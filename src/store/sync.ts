import { create } from 'zustand';
import type { AppData } from '../types';
import { GithubError, getFile, putFile, type GithubConfig } from '../lib/github';
import { mergeData, sameData } from '../lib/merge';
import { normalizeData, serialize } from './model';
import { useData } from './data';

const CONFIG_KEY = 'carnet-eps:github';

export const EMPTY_CONFIG: GithubConfig = {
  owner: '',
  repo: '',
  path: 'carnet-eps-data.json',
  branch: 'main',
  token: '',
};

function readConfig(): GithubConfig {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (raw) return { ...EMPTY_CONFIG, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return { ...EMPTY_CONFIG };
}

export const isConfigured = (c: GithubConfig) => !!(c.owner && c.repo && c.path && c.branch && c.token);

type Status = 'idle' | 'syncing' | 'ok' | 'error';

interface SyncState {
  config: GithubConfig;
  status: Status;
  error: string | null;
  lastSync: number | null;
  setConfig: (c: GithubConfig) => void;
  syncNow: (opts?: { silent?: boolean }) => Promise<boolean>;
}

let running: Promise<boolean> | null = null;

export const useSync = create<SyncState>((set, get) => ({
  config: readConfig(),
  status: 'idle',
  error: null,
  lastSync: null,

  setConfig(config) {
    try {
      localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
    } catch {
      /* ignore */
    }
    set({ config, status: 'idle', error: null });
  },

  syncNow() {
    // Évite deux synchronisations simultanées.
    if (running) return running;
    const cfg = get().config;
    if (!isConfigured(cfg)) return Promise.resolve(false);
    set({ status: 'syncing', error: null });
    running = (async () => {
      try {
        await runSync(cfg);
        set({ status: 'ok', lastSync: Date.now(), error: null });
        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        set({ status: 'error', error: message });
        return false;
      } finally {
        running = null;
      }
    })();
    return running;
  },
}));

/** Tire, fusionne, pousse. Réessaie si quelqu'un a écrit entre-temps. */
async function runSync(cfg: GithubConfig): Promise<void> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const remote = await getFile(cfg);
    const local: AppData = useData.getState().data;

    let remoteData: AppData | null = null;
    if (remote.content) {
      try {
        remoteData = normalizeData(JSON.parse(remote.content));
      } catch {
        throw new Error("Le fichier distant n'est pas un JSON valide : synchronisation interrompue pour ne rien écraser.");
      }
    }

    const merged = remoteData ? mergeData(local, remoteData) : local;
    if (!sameData(merged, local)) useData.getState().applyData(merged);

    if (remoteData && sameData(merged, remoteData)) return; // rien à envoyer

    try {
      await putFile(cfg, serialize(merged), remote.sha, 'Mise à jour du carnet EPS');
      return;
    } catch (err) {
      if (err instanceof GithubError && (err.status === 409 || err.status === 422) && attempt < 3) continue;
      throw err;
    }
  }
}

// ── Synchronisation automatique ─────────────────────────────────────────────

let timer: ReturnType<typeof setTimeout> | undefined;

function scheduleAutoSync(delay: number) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    const s = useSync.getState();
    if (isConfigured(s.config) && navigator.onLine) void s.syncNow();
  }, delay);
}

export function startAutoSync() {
  let lastRevision = useData.getState().revision;
  useData.subscribe((state) => {
    if (state.revision !== lastRevision) {
      lastRevision = state.revision;
      scheduleAutoSync(6000);
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      const { lastSync } = useSync.getState();
      if (!lastSync || Date.now() - lastSync > 60_000) scheduleAutoSync(300);
    }
  });
  window.addEventListener('online', () => scheduleAutoSync(500));
  scheduleAutoSync(1200);
}
