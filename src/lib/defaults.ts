import type { Activity, BlockKind, CourtId, Field, Settings } from '../types';

export const CLASS_COLORS = [
  '#2563eb', '#0d9488', '#d97706', '#dc2626', '#7c3aed',
  '#db2777', '#16a34a', '#0891b2', '#ea580c', '#4b5563',
];

export const DEFAULT_FIELDS: Field[] = [
  { id: 'ca1', short: 'CA1', label: 'Produire une performance optimale, mesurable à une échéance donnée', color: '#ea580c' },
  { id: 'ca2', short: 'CA2', label: 'Adapter ses déplacements à des environnements variés', color: '#16a34a' },
  { id: 'ca3', short: 'CA3', label: "S'exprimer devant les autres par une prestation artistique et/ou acrobatique", color: '#9333ea' },
  { id: 'ca4', short: 'CA4', label: 'Conduire et maîtriser un affrontement collectif ou interindividuel', color: '#2563eb' },
  { id: 'ca5', short: 'CA5', label: "Réaliser une activité physique pour développer ses ressources et s'entretenir", color: '#0d9488' },
];

const a = (id: string, name: string, fieldId: string, emoji: string, court: CourtId = 'blank'): Activity => ({
  id, name, fieldId, emoji, court,
});

export const DEFAULT_ACTIVITIES: Activity[] = [
  // CA1 – performance
  a('vitesse', 'Course de vitesse', 'ca1', '🏃', 'track'),
  a('haies', 'Course de haies', 'ca1', '🏃', 'track'),
  a('relais', 'Relais', 'ca1', '🏃', 'track'),
  a('demi-fond', 'Demi-fond', 'ca1', '⏱️', 'track'),
  a('longueur', 'Saut en longueur', 'ca1', '🦘', 'blank'),
  a('hauteur', 'Saut en hauteur', 'ca1', '🦘', 'blank'),
  a('poids', 'Lancer de poids', 'ca1', '⚫', 'blank'),
  a('javelot', 'Lancer de javelot', 'ca1', '🎯', 'blank'),
  a('nat-vitesse', 'Natation de vitesse', 'ca1', '🏊', 'blank'),
  a('natation', 'Natation', 'ca1', '🏊', 'blank'),
  a('combine-athle', 'Combiné athlétique', 'ca1', '🏃', 'track'),
  a('biathlon', 'Biathlon (course + lancer)', 'ca1', '🎯', 'track'),
  // CA2 – environnements variés
  a('orientation', "Course d'orientation", 'ca2', '🧭', 'blank'),
  a('escalade', 'Escalade', 'ca2', '🧗', 'blank'),
  a('sauvetage', 'Sauvetage / savoir nager', 'ca2', '🛟', 'blank'),
  a('parcours', 'Parcours / activités de pleine nature', 'ca2', '🌲', 'blank'),
  // CA3 – expression
  a('gym', 'Gymnastique', 'ca3', '🤸', 'blank'),
  a('gym-sol', 'Gymnastique au sol', 'ca3', '🤸', 'blank'),
  a('gym-agres', 'Gymnastique aux agrès', 'ca3', '🤸', 'blank'),
  a('acrosport', 'Acrosport', 'ca3', '🤸', 'blank'),
  a('danse', 'Danse', 'ca3', '💃', 'blank'),
  a('cirque', 'Arts du cirque', 'ca3', '🎪', 'blank'),
  a('step', 'Step / aérobic', 'ca3', '🎵', 'blank'),
  // CA4 – affrontement
  a('basket', 'Basket-ball', 'ca4', '🏀', 'basket'),
  a('hand', 'Handball', 'ca4', '🤾', 'hand'),
  a('foot', 'Football', 'ca4', '⚽', 'foot'),
  a('rugby', 'Rugby', 'ca4', '🏉', 'rugby'),
  a('volley', 'Volley-ball', 'ca4', '🏐', 'volley'),
  a('ultimate', 'Ultimate', 'ca4', '🥏', 'ultimate'),
  a('badminton', 'Badminton', 'ca4', '🏸', 'badminton'),
  a('tt', 'Tennis de table', 'ca4', '🏓', 'tt'),
  a('tennis', 'Tennis', 'ca4', '🎾', 'tennis'),
  a('judo', 'Judo / lutte', 'ca4', '🥋', 'blank'),
  a('hockey', 'Hockey', 'ca4', '🏑', 'hand'),
  a('baseball', 'Baseball / softball', 'ca4', '⚾', 'blank'),
  // CA5 – entretien de soi
  a('course-duree', 'Course en durée', 'ca5', '⏱️', 'track'),
  a('musculation', 'Musculation', 'ca5', '🏋️', 'blank'),
  a('cross-training', 'Cross-training / CAP', 'ca5', '🔥', 'blank'),
  a('yoga', 'Yoga / relaxation', 'ca5', '🧘', 'blank'),
  a('nat-duree', 'Natation en durée', 'ca5', '🏊', 'blank'),
  // Transversal
  a('echauffement', 'Échauffement / jeux', 'ca5', '🔆', 'blank'),
];

export const DEFAULT_LEVELS = [
  '6e', '5e', '4e', '3e', '2nde', '1re', 'Terminale', 'CAP', 'Bac Pro', 'SEGPA', 'ULIS', 'UNSS',
];

export function defaultSettings(): Settings {
  return {
    // 0 : des réglages jamais modifiés ne doivent jamais écraser ceux d'un autre appareil lors de la fusion.
    updatedAt: 0,
    teacher: '',
    fields: DEFAULT_FIELDS.map((f) => ({ ...f })),
    activities: DEFAULT_ACTIVITIES.map((x) => ({ ...x })),
    levels: [...DEFAULT_LEVELS],
    places: ['Gymnase', 'Plateau extérieur', 'Salle de danse', 'Piscine', 'Stade'],
    defaultLessonMinutes: 110,
  };
}

export const BLOCK_KINDS: Record<BlockKind, { label: string; color: string; icon: string }> = {
  warmup: { label: 'Échauffement', color: '#f59e0b', icon: '🔥' },
  situation: { label: 'Situation / exercice', color: '#2563eb', icon: '🎯' },
  skill: { label: 'Atelier technique', color: '#7c3aed', icon: '🛠️' },
  game: { label: 'Jeu / match', color: '#16a34a', icon: '🏆' },
  evaluation: { label: 'Évaluation', color: '#dc2626', icon: '📝' },
  theory: { label: 'Temps théorique', color: '#0891b2', icon: '💬' },
  cooldown: { label: 'Retour au calme', color: '#0d9488', icon: '🧘' },
  free: { label: 'Autre', color: '#6b7280', icon: '📌' },
};

export const BLOCK_KIND_ORDER: BlockKind[] = [
  'warmup', 'situation', 'skill', 'game', 'evaluation', 'theory', 'cooldown', 'free',
];

export const COURTS: Array<{ id: CourtId; label: string }> = [
  { id: 'blank', label: 'Terrain libre' },
  { id: 'basket', label: 'Basket (terrain complet)' },
  { id: 'basket-half', label: 'Basket (demi-terrain)' },
  { id: 'volley', label: 'Volley-ball' },
  { id: 'badminton', label: 'Badminton' },
  { id: 'hand', label: 'Handball / futsal' },
  { id: 'foot', label: 'Football' },
  { id: 'rugby', label: 'Rugby' },
  { id: 'ultimate', label: 'Ultimate' },
  { id: 'tennis', label: 'Tennis' },
  { id: 'tt', label: 'Tennis de table' },
  { id: 'track', label: 'Piste d’athlétisme' },
];

export const TOKEN_COLORS = [
  '#2563eb', '#dc2626', '#16a34a', '#eab308', '#7c3aed', '#f97316', '#0f172a', '#e5e7eb',
];
