import { create } from 'zustand';
import type { ID } from '../types';

// ── Préférences d'affichage (propres à chaque appareil) ───────────────────

const PREFS_KEY = 'carnet-eps:prefs';

export type Theme = 'auto' | 'light' | 'dark';

interface Prefs {
  yearId: ID | null;
  theme: Theme;
}

function readPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) return { yearId: null, theme: 'auto', ...JSON.parse(raw) };
  } catch {
    /* navigation privée, stockage bloqué… */
  }
  return { yearId: null, theme: 'auto' };
}

function writePrefs(p: Prefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === 'auto') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
}

// ── Toasts et boîtes de confirmation ───────────────────────────────────────

export interface Toast {
  id: number;
  text: string;
  tone: 'info' | 'success' | 'error';
  action?: { label: string; run: () => void };
}

export interface ConfirmRequest {
  title: string;
  message?: string;
  confirmLabel?: string;
  danger?: boolean;
  resolve: (ok: boolean) => void;
}

interface UiState extends Prefs {
  toasts: Toast[];
  confirmReq: ConfirmRequest | null;
  setYear: (id: ID | null) => void;
  setTheme: (t: Theme) => void;
  toast: (text: string, opts?: { tone?: Toast['tone']; action?: Toast['action']; ms?: number }) => void;
  dismissToast: (id: number) => void;
  confirm: (req: Omit<ConfirmRequest, 'resolve'>) => Promise<boolean>;
  closeConfirm: (ok: boolean) => void;
}

let toastSeq = 1;

export const useUi = create<UiState>((set, get) => ({
  ...readPrefs(),
  toasts: [],
  confirmReq: null,

  setYear(yearId) {
    set({ yearId });
    writePrefs({ yearId, theme: get().theme });
  },

  setTheme(theme) {
    set({ theme });
    applyTheme(theme);
    writePrefs({ yearId: get().yearId, theme });
  },

  toast(text, opts = {}) {
    const id = toastSeq++;
    const t: Toast = { id, text, tone: opts.tone ?? 'info', action: opts.action };
    set((s) => ({ toasts: [...s.toasts, t].slice(-4) }));
    setTimeout(() => get().dismissToast(id), opts.ms ?? (opts.action ? 8000 : 3500));
  },

  dismissToast(id) {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },

  confirm(req) {
    return new Promise<boolean>((resolve) => {
      // Une seule confirmation à la fois : la précédente est refusée.
      get().confirmReq?.resolve(false);
      set({ confirmReq: { ...req, resolve } });
    });
  },

  closeConfirm(ok) {
    const req = get().confirmReq;
    set({ confirmReq: null });
    req?.resolve(ok);
  },
}));

export const toast = (text: string, opts?: Parameters<UiState['toast']>[1]) => useUi.getState().toast(text, opts);
export const confirmDialog = (req: Omit<ConfirmRequest, 'resolve'>) => useUi.getState().confirm(req);

/** Supprime avec possibilité d'annuler pendant quelques secondes. */
export function toastUndo(text: string, undo: () => void) {
  toast(text, { action: { label: 'Annuler', run: undo } });
}
