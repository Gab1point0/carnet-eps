// Chiffrement des données des élèves (noms, résultats) : AES-GCM 256 bits, clé tirée du mot de passe de
// l'enseignant (PBKDF2-SHA-256). Tout se fait dans le navigateur (Web Crypto) : le mot de passe et les données
// en clair ne sortent jamais de l'appareil.

const ITERATIONS = 600_000;

export interface Envelope {
  v: 1;
  /** Sel du mot de passe (base64) : le même sur tous les appareils, pour retrouver la même clé. */
  salt: string;
  iv: string;
  data: string;
}

const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export const newSalt = () => b64(crypto.getRandomValues(new Uint8Array(16)));

/** Clé non exportable : elle peut être gardée sur l'appareil sans que son contenu soit lisible. */
export async function deriveKey(password: string, salt: string): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: unb64(salt), iterations: ITERATIONS, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function seal(key: CryptoKey, salt: string, value: unknown): Promise<Envelope> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(value)));
  return { v: 1, salt, iv: b64(iv), data: b64(new Uint8Array(data)) };
}

/** Lève une erreur si la clé ne correspond pas (mauvais mot de passe) : AES-GCM vérifie l'intégrité. */
export async function open<T>(key: CryptoKey, env: Envelope): Promise<T> {
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(env.iv) }, key, unb64(env.data));
  return JSON.parse(new TextDecoder().decode(plain)) as T;
}

export const isEnvelope = (x: unknown): x is Envelope =>
  !!x && typeof x === 'object' && (x as Envelope).v === 1 && typeof (x as Envelope).salt === 'string' && typeof (x as Envelope).data === 'string';
