// Accès minimal à l'API GitHub « Contents » pour lire / écrire le fichier de données.
// Le jeton (fine-grained token) n'est jamais écrit dans le fichier de données :
// il reste uniquement dans le navigateur de chaque appareil.

export interface GithubConfig {
  owner: string;
  repo: string;
  path: string;
  branch: string;
  token: string;
}

export interface RemoteFile {
  /** `null` si le fichier n'existe pas encore. */
  content: string | null;
  sha: string | null;
}

export class GithubError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

const API = 'https://api.github.com';

function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

function fromBase64(b64: string): string {
  const bin = atob(b64.replace(/\s/g, ''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function headers(cfg: GithubConfig): HeadersInit {
  return {
    Authorization: `Bearer ${cfg.token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

function url(cfg: GithubConfig): string {
  const path = cfg.path.split('/').map(encodeURIComponent).join('/');
  return `${API}/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}/contents/${path}`;
}

async function explain(res: Response): Promise<GithubError> {
  let detail = '';
  try {
    detail = ((await res.json()) as { message?: string }).message ?? '';
  } catch {
    /* ignore */
  }
  const hint =
    res.status === 401
      ? 'Jeton invalide ou expiré.'
      : res.status === 403
        ? "Accès refusé : le jeton n'a pas le droit « Contents : lecture et écriture » sur ce dépôt."
        : res.status === 404
          ? 'Dépôt ou fichier introuvable (vérifiez le nom du dépôt et les droits du jeton).'
          : res.status === 409 || res.status === 422
            ? 'Conflit : le fichier a été modifié ailleurs.'
            : 'Erreur GitHub.';
  return new GithubError(`${hint}${detail ? ` (${detail})` : ''}`, res.status);
}

export async function getFile(cfg: GithubConfig): Promise<RemoteFile> {
  const res = await fetch(`${url(cfg)}?ref=${encodeURIComponent(cfg.branch)}`, {
    headers: headers(cfg),
    cache: 'no-store',
  });
  if (res.status === 404) {
    // Le dépôt existe-t-il ? On distingue « fichier absent » de « dépôt introuvable ».
    const repoRes = await fetch(`${API}/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}`, {
      headers: headers(cfg),
    });
    if (!repoRes.ok) throw await explain(repoRes);
    return { content: null, sha: null };
  }
  if (!res.ok) throw await explain(res);
  const json = (await res.json()) as { content?: string; sha: string; encoding?: string; download_url?: string };
  if (json.content && json.encoding === 'base64') {
    return { content: fromBase64(json.content), sha: json.sha };
  }
  // Fichier > 1 Mo : l'API ne renvoie pas le contenu en base64, on passe par le format brut.
  const raw = await fetch(url(cfg) + `?ref=${encodeURIComponent(cfg.branch)}`, {
    headers: { ...headers(cfg), Accept: 'application/vnd.github.raw+json' },
    cache: 'no-store',
  });
  if (!raw.ok) throw await explain(raw);
  return { content: await raw.text(), sha: json.sha };
}

export async function putFile(
  cfg: GithubConfig,
  content: string,
  sha: string | null,
  message: string,
): Promise<string> {
  const res = await fetch(url(cfg), {
    method: 'PUT',
    headers: { ...headers(cfg), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      content: toBase64(content),
      branch: cfg.branch,
      ...(sha ? { sha } : {}),
    }),
  });
  if (!res.ok) throw await explain(res);
  const json = (await res.json()) as { content: { sha: string } };
  return json.content.sha;
}
