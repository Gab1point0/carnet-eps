import { create } from 'zustand';
import { del as idbDel, get as idbGet, set as idbSet } from 'idb-keyval';
import type { ID } from '../types';
import { deriveKey, isEnvelope, newSalt, open, seal, type Envelope } from '../lib/crypto';
import { emptyPrivate, mergePrivate, samePrivate, type PrivateDoc, type Student, type StudentMarks } from '../lib/privateData';
import { GithubError, getFile, putFile, type GithubConfig } from '../lib/github';

// Coffre des données des élèves : chiffré sur l'appareil (IndexedDB) et, si la synchronisation est réglée,
// dans un fichier à part du dépôt GitHub, toujours chiffré. La clé (non exportable) reste sur l'appareil
// jusqu'à « Verrouiller cet appareil ».

const ENVELOPE_KEY = 'carnet-eps:eleves';
const KEY_KEY = 'carnet-eps:eleves-cle';
export const PRIVATE_FILE = 'carnet-eps-eleves.chiffre.json';

export type VaultStatus = 'loading' | 'none' | 'locked' | 'open';

interface VaultState {
  status: VaultStatus;
  doc: PrivateDoc;
  revision: number;
  /** Coffre trouvé sur GitHub mais pas encore ouvert sur cet appareil. */
  remote: Envelope | null;
  load: () => Promise<void>;
  create: (password: string) => Promise<void>;
  unlock: (password: string) => Promise<boolean>;
  lock: () => Promise<void>;
  setStudents: (classId: ID, students: Student[]) => void;
  setMarks: (lessonId: ID, studentId: ID, marks: Omit<StudentMarks, 't'>) => void;
  /** Efface tous les élèves et résultats (fin d'année), sur tous les appareils synchronisés. */
  wipe: () => void;
}

let key: CryptoKey | null = null;
let salt = '';

export const useVault = create<VaultState>((set, get) => ({
  status: 'loading',
  doc: emptyPrivate(),
  revision: 0,
  remote: null,

  async load() {
    try {
      const env = await idbGet<unknown>(ENVELOPE_KEY);
      const stored = await idbGet<{ key: CryptoKey; salt: string }>(KEY_KEY);
      if (!isEnvelope(env)) return set({ status: 'none' });
      if (!stored) return set({ status: 'locked' });
      key = stored.key;
      salt = stored.salt;
      set({ status: 'open', doc: await open<PrivateDoc>(key, env) });
    } catch {
      set({ status: 'locked' });
    }
  },

  async create(password) {
    salt = newSalt();
    key = await deriveKey(password, salt);
    await idbSet(KEY_KEY, { key, salt });
    set({ status: 'open', doc: emptyPrivate(), remote: null, revision: get().revision + 1 });
    await persist();
  },

  async unlock(password) {
    const local = await idbGet<unknown>(ENVELOPE_KEY);
    const env = isEnvelope(local) ? local : get().remote;
    if (!env) return false;
    try {
      const k = await deriveKey(password, env.salt);
      let doc = await open<PrivateDoc>(k, env);
      // Coffre local ET coffre distant : on fusionne les deux (même mot de passe, donc même sel).
      const remote = get().remote;
      if (remote && remote !== env && remote.salt === env.salt) doc = mergePrivate(doc, await open<PrivateDoc>(k, remote));
      key = k;
      salt = env.salt;
      await idbSet(KEY_KEY, { key, salt });
      set({ status: 'open', doc, remote: null, revision: get().revision + 1 });
      await persist();
      return true;
    } catch {
      return false;
    }
  },

  async lock() {
    key = null;
    await idbDel(KEY_KEY);
    set({ status: 'locked', doc: emptyPrivate() });
  },

  setStudents(classId, students) {
    const doc = get().doc;
    set({ doc: { ...doc, rosters: { ...doc.rosters, [classId]: { students, updatedAt: Date.now() } } }, revision: get().revision + 1 });
    void persist();
  },

  setMarks(lessonId, studentId, marks) {
    const doc = get().doc;
    const sheet = { ...(doc.sheets[lessonId] ?? {}), [studentId]: { ...marks, t: Date.now() } };
    set({ doc: { ...doc, sheets: { ...doc.sheets, [lessonId]: sheet } }, revision: get().revision + 1 });
    void persist();
  },

  wipe() {
    const doc = get().doc;
    const t = Date.now();
    // Listes vides et lignes vides datées de maintenant : la fusion les propage aux autres appareils.
    const rosters = Object.fromEntries(Object.keys(doc.rosters).map((id) => [id, { students: [], updatedAt: t }]));
    const sheets = Object.fromEntries(Object.entries(doc.sheets).map(([id, rows]) => [id, Object.fromEntries(Object.keys(rows).map((s) => [s, { v: {}, t }]))]));
    set({ doc: { version: 1, rosters, sheets }, revision: get().revision + 1 });
    void persist();
  },
}));

let saving: Promise<void> = Promise.resolve();
function persist() {
  saving = saving.then(async () => {
    if (!key) return;
    await idbSet(ENVELOPE_KEY, await seal(key, salt, useVault.getState().doc));
  });
  return saving;
}

/** Élèves d'une classe (vide si le coffre est fermé). */
export const useStudents = (classId: ID | null | undefined) => useVault((s) => (classId ? s.doc.rosters[classId]?.students : undefined) ?? EMPTY);
const EMPTY: Student[] = [];

/**
 * Synchronisation du coffre avec le fichier chiffré du dépôt (appelée après celle du carnet).
 * Coffre fermé : on note seulement qu'il en existe un en ligne, pour proposer de l'ouvrir.
 */
export async function syncVault(cfg: GithubConfig): Promise<void> {
  const fileCfg = { ...cfg, path: PRIVATE_FILE };
  for (let attempt = 0; attempt < 3; attempt++) {
    const remoteFile = await getFile(fileCfg);
    let remote: Envelope | null = null;
    if (remoteFile.content) {
      try {
        const parsed = JSON.parse(remoteFile.content);
        if (isEnvelope(parsed)) remote = parsed;
      } catch {
        /* fichier abîmé : on le remplace par notre version */
      }
    }
    const st = useVault.getState();
    if (st.status !== 'open' || !key) {
      if (remote && st.status !== 'loading') useVault.setState({ remote, status: st.status === 'none' ? 'locked' : st.status });
      return;
    }
    let merged = st.doc;
    if (remote) {
      if (remote.salt !== salt) throw new Error('Le coffre des élèves en ligne a un autre mot de passe que cet appareil.');
      merged = mergePrivate(st.doc, await open<PrivateDoc>(key, remote));
      if (!samePrivate(merged, st.doc)) {
        useVault.setState({ doc: merged, revision: st.revision });
        await persist();
      }
      if (samePrivate(merged, await open<PrivateDoc>(key, remote))) return;
    }
    try {
      await putFile(fileCfg, JSON.stringify(await seal(key, salt, merged)), remoteFile.sha, 'Coffre des élèves (chiffré)');
      return;
    } catch (err) {
      if (err instanceof GithubError && (err.status === 409 || err.status === 422) && attempt < 2) continue;
      throw err;
    }
  }
}
