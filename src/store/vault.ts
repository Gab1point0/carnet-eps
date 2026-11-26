import { create } from 'zustand';
import { del as idbDel, get as idbGet, set as idbSet } from 'idb-keyval';
import type { ID } from '../types';
import { deriveKey, isEnvelope, newSalt, open, seal, type Envelope } from '../lib/crypto';
import { INVESTMENT_START, emptyPrivate, mergePrivate, normalizePrivate, remapStudents, restorePrivate, samePrivate, stampGrouping, stampMarks, type Grouping, type PrivateDoc, type SavedGrouping, type SavedTournament, type Student, type StudentMarks } from '../lib/privateData';
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
  /** Le coffre en ligne a déjà été cherché (pour ne pas en créer un second par erreur sur un nouvel appareil). */
  checked: boolean;
  /** Coffre en ligne créé avec un autre mot de passe que celui de cet appareil : à réunir. */
  conflict: Envelope | null;
  /** Réunit le coffre de cet appareil et celui en ligne (mot de passe de celui en ligne). */
  joinRemote: (password: string) => Promise<boolean>;
  /** Déchiffre une ancienne version (avec la clé de l'appareil, ou ce mot de passe si elle en a un autre). */
  openVersion: (env: Envelope, password?: string) => Promise<PrivateDoc | null>;
  /** Remet ce qui a disparu depuis une ancienne version. */
  restore: (old: PrivateDoc) => ReturnType<typeof restorePrivate>;
  load: () => Promise<void>;
  create: (password: string) => Promise<void>;
  unlock: (password: string) => Promise<boolean>;
  lock: () => Promise<void>;
  setStudents: (classId: ID, students: Student[]) => void;
  setMarks: (lessonId: ID, studentId: ID, marks: Omit<StudentMarks, 't'>) => void;
  /** Groupes d'une fiche (séance). `null` = plus de groupes. */
  setGroups: (lessonId: ID, groups: Omit<Grouping, 't'> | null) => void;
  saveGroups: (id: ID, g: Omit<SavedGrouping, 't'>) => void;
  saveTournament: (id: ID, x: Omit<SavedTournament, 't'>) => void;
  /** Notes d'investissement d'une classe : élève → nouvelle note (seuls ceux donnés changent). */
  setInvestment: (classId: ID, notes: Record<ID, number>) => void;
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
  checked: false,
  conflict: null,

  async joinRemote(password) {
    const remote = get().conflict;
    if (!remote) return false;
    try {
      const k = await deriveKey(password, remote.salt);
      const theirs = normalizePrivate(await open<PrivateDoc>(k, remote));
      const mine = remapStudents(get().doc, theirs);
      const doc = mergePrivate(theirs, mine);
      // Deux listes saisies chacune de leur côté : on garde tous les élèves des deux.
      for (const [classId, r] of Object.entries(mine.rosters)) {
        const list = doc.rosters[classId]?.students ?? [];
        const extra = r.students.filter((s) => !list.some((x) => x.id === s.id));
        if (extra.length) doc.rosters[classId] = { students: [...list, ...extra], updatedAt: Date.now() };
      }
      key = k;
      salt = remote.salt;
      await idbSet(KEY_KEY, { key, salt });
      set({ doc, conflict: null, revision: get().revision + 1 });
      await persist();
      return true;
    } catch {
      return false;
    }
  },

  async openVersion(env, password) {
    try {
      if (key && env.salt === salt && !password) return normalizePrivate(await open<PrivateDoc>(key, env));
      if (!password) return null;
      return normalizePrivate(await open<PrivateDoc>(await deriveKey(password, env.salt), env));
    } catch {
      return null;
    }
  },

  restore(old) {
    const r = restorePrivate(get().doc, old, Date.now());
    set({ doc: r.doc, revision: get().revision + 1 });
    void persist();
    return r;
  },

  async load() {
    try {
      const env = await idbGet<unknown>(ENVELOPE_KEY);
      const stored = await idbGet<{ key: CryptoKey; salt: string }>(KEY_KEY);
      if (!isEnvelope(env)) return set({ status: 'none' });
      if (!stored) return set({ status: 'locked' });
      key = stored.key;
      salt = stored.salt;
      set({ status: 'open', doc: normalizePrivate(await open<PrivateDoc>(key, env)) });
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
      let doc = normalizePrivate(await open<PrivateDoc>(k, env));
      // Coffre local ET coffre distant : on fusionne les deux (même mot de passe, donc même sel).
      const remote = get().remote;
      if (remote && remote !== env && remote.salt === env.salt) doc = mergePrivate(doc, normalizePrivate(await open<PrivateDoc>(k, remote)));
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
    const sheet = { ...(doc.sheets[lessonId] ?? {}), [studentId]: stampMarks(doc.sheets[lessonId]?.[studentId], marks, Date.now()) };
    set({ doc: { ...doc, sheets: { ...doc.sheets, [lessonId]: sheet } }, revision: get().revision + 1 });
    void persist();
  },

  setGroups(lessonId, groups) {
    const doc = get().doc;
    const g = stampGrouping(doc.groups[lessonId], groups ?? { assign: {}, count: 0 }, Date.now());
    set({ doc: { ...doc, groups: { ...doc.groups, [lessonId]: g } }, revision: get().revision + 1 });
    void persist();
  },

  saveGroups(id, g) {
    const doc = get().doc;
    set({ doc: { ...doc, savedGroups: { ...doc.savedGroups, [id]: { ...g, t: Date.now() } } }, revision: get().revision + 1 });
    void persist();
  },

  saveTournament(id, x) {
    const doc = get().doc;
    set({ doc: { ...doc, tournaments: { ...doc.tournaments, [id]: { ...x, t: Date.now() } } }, revision: get().revision + 1 });
    void persist();
  },

  setInvestment(classId, notes) {
    const doc = get().doc;
    const t = Date.now();
    const rows = { ...(doc.investment[classId] ?? {}) };
    for (const [sid, v] of Object.entries(notes)) rows[sid] = { v, t };
    set({ doc: { ...doc, investment: { ...doc.investment, [classId]: rows } }, revision: get().revision + 1 });
    void persist();
  },

  wipe() {
    const doc = get().doc;
    const t = Date.now();
    // Listes vides et lignes vides datées de maintenant : la fusion les propage aux autres appareils.
    const rosters = Object.fromEntries(Object.keys(doc.rosters).map((id) => [id, { students: [], updatedAt: t }]));
    const sheets = Object.fromEntries(Object.entries(doc.sheets).map(([id, rows]) => [id, Object.fromEntries(Object.keys(rows).map((s) => [s, { v: {}, t }]))]));
    const groups = Object.fromEntries(Object.keys(doc.groups).map((id) => [id, { assign: {}, count: 0, t }]));
    const savedGroups = Object.fromEntries(Object.entries(doc.savedGroups).map(([id, g]) => [id, { ...g, assign: {}, count: 0, deleted: true, t }]));
    const tournaments = Object.fromEntries(Object.entries(doc.tournaments).map(([id, x]) => [id, { ...x, name: '', state: null, deleted: true, t }]));
    const investment = Object.fromEntries(Object.entries(doc.investment).map(([id, rows]) => [id, Object.fromEntries(Object.keys(rows).map((s) => [s, { v: INVESTMENT_START, t }]))]));
    set({ doc: { version: 1, rosters, sheets, groups, savedGroups, tournaments, investment }, revision: get().revision + 1 });
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
      if (st.status !== 'loading') useVault.setState({ checked: true });
      return;
    }
    useVault.setState({ checked: true, ...(st.conflict ? { conflict: null } : {}) });
    let merged = st.doc;
    if (remote) {
      if (remote.salt !== salt) {
        useVault.setState({ conflict: remote, checked: true });
        throw new Error('Les données des élèves en ligne ont un autre mot de passe que cet appareil : ouvrez une fiche ou Réglages › Sauvegarde pour les réunir.');
      }
      merged = mergePrivate(st.doc, normalizePrivate(await open<PrivateDoc>(key, remote)));
      if (!samePrivate(merged, st.doc)) {
        useVault.setState({ doc: merged, revision: st.revision });
        await persist();
      }
      if (samePrivate(merged, normalizePrivate(await open<PrivateDoc>(key, remote)))) return;
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
