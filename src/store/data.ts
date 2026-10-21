import { create } from 'zustand';
import { del as idbDel, get as idbGet, keys as idbKeys, set as idbSet } from 'idb-keyval';
import type { AppData, Collection, EntityMap, ID, Settings } from '../types';
import { COLLECTIONS } from '../types';
import { emptyData, normalizeData } from './model';
import { debounce } from '../lib/util';
import { todayISO } from '../lib/dates';

const KEY = 'carnet-eps:data';
const BACKUP_PREFIX = 'carnet-eps:backup:';
const MAX_BACKUPS = 7;

type AnyEntity = { id: ID; createdAt: number; updatedAt: number };

/** Transaction : permet de modifier plusieurs entités en une seule mise à jour du store. */
export class Tx {
  data: AppData;
  private cloned = new Set<string>();
  private now = Date.now();
  /** Entités supprimées pendant la transaction (pour l'annulation). */
  removed: Array<{ c: Collection; e: AnyEntity }> = [];

  constructor(base: AppData) {
    this.data = { ...base };
  }

  private writable<K extends Collection>(c: K): Record<ID, EntityMap[K]> {
    if (!this.cloned.has(c)) {
      (this.data as unknown as Record<string, unknown>)[c] = { ...this.data[c] };
      this.cloned.add(c);
    }
    return this.data[c] as Record<ID, EntityMap[K]>;
  }

  get<K extends Collection>(c: K, id: ID): EntityMap[K] | undefined {
    return this.data[c][id] as EntityMap[K] | undefined;
  }

  all<K extends Collection>(c: K): Array<EntityMap[K]> {
    return Object.values(this.data[c]) as Array<EntityMap[K]>;
  }

  put<K extends Collection>(c: K, e: EntityMap[K]): void {
    this.writable(c)[e.id] = { ...e, updatedAt: this.now };
    if (this.data.deleted[e.id] !== undefined) {
      if (!this.cloned.has('deleted')) {
        this.data.deleted = { ...this.data.deleted };
        this.cloned.add('deleted');
      }
      delete this.data.deleted[e.id];
    }
  }

  patch<K extends Collection>(c: K, id: ID, p: Partial<EntityMap[K]>): void {
    const cur = this.data[c][id] as EntityMap[K] | undefined;
    if (!cur) return;
    this.put(c, { ...cur, ...p });
  }

  /** Supprime une entité et tout ce qui en dépend (année → classes → cycles → séances). */
  del(c: Collection, id: ID): void {
    const target = this.data[c][id] as AnyEntity | undefined;
    if (!target) return;
    if (c === 'years') {
      for (const k of this.all('classes')) if (k.yearId === id) this.del('classes', k.id);
    } else if (c === 'classes') {
      for (const cy of this.all('cycles')) if (cy.classId === id) this.del('cycles', cy.id);
      for (const l of this.all('lessons')) if (l.classId === id) this.del('lessons', l.id);
    } else if (c === 'cycles') {
      for (const l of this.all('lessons')) if (l.cycleId === id) this.del('lessons', l.id);
    }
    const col = this.writable(c as 'years') as Record<ID, unknown>;
    if (!col[id]) return;
    this.removed.push({ c, e: target });
    delete col[id];
    if (!this.cloned.has('deleted')) {
      this.data.deleted = { ...this.data.deleted };
      this.cloned.add('deleted');
    }
    this.data.deleted[id] = this.now;
  }

  setSettings(p: Partial<Settings>): void {
    this.data.settings = { ...this.data.settings, ...p, updatedAt: this.now };
  }
}

interface DataState {
  data: AppData;
  loaded: boolean;
  /** Incrémenté à chaque modification locale (déclenche la synchronisation automatique). */
  revision: number;
  load: () => Promise<void>;
  /** Applique une transaction. Retourne une fonction d'annulation des suppressions éventuelles. */
  transact: (fn: (tx: Tx) => void) => () => void;
  /** Remplace tout le document (import, fusion distante) sans compter comme modification locale. */
  applyData: (d: AppData, opts?: { local?: boolean }) => void;
  put: <K extends Collection>(c: K, e: EntityMap[K]) => void;
  patch: <K extends Collection>(c: K, id: ID, p: Partial<EntityMap[K]>) => void;
  remove: (c: Collection, id: ID) => () => void;
  patchSettings: (p: Partial<Settings>) => void;
  reset: () => void;
}

export const useData = create<DataState>((set, get) => ({
  data: emptyData(),
  loaded: false,
  revision: 0,

  async load() {
    let data: AppData;
    try {
      const raw = await idbGet<unknown>(KEY);
      data = raw ? normalizeData(raw) : emptyData();
    } catch (err) {
      console.error('Lecture des données impossible', err);
      data = emptyData();
    }
    set({ data, loaded: true });
    void rotateBackup(data);
  },

  transact(fn) {
    const tx = new Tx(get().data);
    fn(tx);
    set((s) => ({ data: tx.data, revision: s.revision + 1 }));
    const removed = tx.removed;
    return () => {
      if (!removed.length) return;
      get().transact((t) => {
        for (const r of removed) t.put(r.c as 'lessons', r.e as EntityMap['lessons']);
      });
    };
  },

  applyData(d, opts) {
    set((s) => ({ data: d, revision: opts?.local ? s.revision + 1 : s.revision }));
  },

  put(c, e) {
    get().transact((tx) => tx.put(c, e));
  },

  patch(c, id, p) {
    get().transact((tx) => tx.patch(c, id, p));
  },

  remove(c, id) {
    return get().transact((tx) => tx.del(c, id));
  },

  patchSettings(p) {
    get().transact((tx) => tx.setSettings(p));
  },

  reset() {
    const t = Date.now();
    const old = get().data;
    // On conserve des pierres tombales pour que la synchronisation propage la remise à zéro.
    const deleted = { ...old.deleted };
    for (const c of COLLECTIONS) for (const id of Object.keys(old[c])) deleted[id] = t;
    const fresh = emptyData();
    fresh.deleted = deleted;
    fresh.settings.updatedAt = t;
    set((s) => ({ data: fresh, revision: s.revision + 1 }));
  },
}));

// ── Persistance (IndexedDB) ─────────────────────────────────────────────────

const persist = debounce((data: AppData) => {
  idbSet(KEY, data).catch((err) => console.error('Sauvegarde locale impossible', err));
}, 300);

useData.subscribe((state, prev) => {
  if (state.loaded && state.data !== prev.data) persist(state.data);
});

// Sauvegarde immédiate quand l'onglet se ferme / passe en arrière-plan.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      const s = useData.getState();
      if (s.loaded) persist.flush(s.data);
    }
  });
}

/** Une copie de secours par jour, sept jours conservés. */
async function rotateBackup(data: AppData): Promise<void> {
  try {
    if (!COLLECTIONS.some((c) => Object.keys(data[c]).length)) return;
    const key = BACKUP_PREFIX + todayISO();
    if (await idbGet(key)) return;
    await idbSet(key, data);
    const all = (await idbKeys()).filter((k) => typeof k === 'string' && k.startsWith(BACKUP_PREFIX)) as string[];
    all.sort();
    for (const k of all.slice(0, Math.max(0, all.length - MAX_BACKUPS))) await idbDel(k);
  } catch (err) {
    console.warn('Copie de secours impossible', err);
  }
}

export async function listBackups(): Promise<Array<{ key: string; date: string }>> {
  const all = (await idbKeys()).filter((k) => typeof k === 'string' && k.startsWith(BACKUP_PREFIX)) as string[];
  return all.sort().reverse().map((key) => ({ key, date: key.slice(BACKUP_PREFIX.length) }));
}

export async function readBackup(key: string): Promise<AppData | null> {
  const raw = await idbGet<unknown>(key);
  return raw ? normalizeData(raw) : null;
}
