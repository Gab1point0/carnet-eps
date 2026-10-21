import { afterEach, describe, expect, it, vi } from 'vitest';
import { getFile, putFile, type GithubConfig } from './github';

const cfg: GithubConfig = { owner: 'moi', repo: 'donnees', path: 'carnet-eps-data.json', branch: 'main', token: 'secret' };

afterEach(() => vi.unstubAllGlobals());

describe('github', () => {
  it('encode et décode l’UTF-8 (accents, emojis) sans perte', async () => {
    const text = JSON.stringify({ titre: 'Séance d’échauffement 🏐', bilan: 'À retravailler : passes en mouvement' });
    let sent = '';
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        if (init?.method === 'PUT') {
          sent = (JSON.parse(String(init.body)) as { content: string }).content;
          return new Response(JSON.stringify({ content: { sha: 'abc' } }), { status: 200 });
        }
        return new Response(JSON.stringify({ content: sent, sha: 'abc', encoding: 'base64' }), { status: 200 });
      }),
    );
    const sha = await putFile(cfg, text, null, 'test');
    expect(sha).toBe('abc');
    const back = await getFile(cfg);
    expect(back.content).toBe(text);
  });

  it('distingue un fichier absent d’un dépôt introuvable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('/contents/')) return new Response('{}', { status: 404 });
        return new Response('{}', { status: 200 }); // le dépôt existe
      }),
    );
    expect(await getFile(cfg)).toEqual({ content: null, sha: null });

    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ message: 'Not Found' }), { status: 404 })));
    await expect(getFile(cfg)).rejects.toThrow(/introuvable/);
  });
});
