import { toast } from '../store/ui';

const CHECK_EVERY = 60_000;
const scriptOf = (html: string) => html.match(/assets\/index-[^"']+\.js/)?.[0] ?? null;

/** Une application restée ouverte garde son ancien code : on compare au site et on propose de recharger, sans jamais couper une dictée. */
export function watchAppUpdates() {
  const current = scriptOf(document.documentElement.outerHTML);
  if (!current) return;
  let lastCheck = 0;
  const check = async () => {
    if (Date.now() - lastCheck < CHECK_EVERY) return;
    lastCheck = Date.now();
    try {
      const res = await fetch('./index.html', { cache: 'no-store' });
      const latest = res.ok ? scriptOf(await res.text()) : null;
      if (latest && latest !== current) {
        toast('Une nouvelle version de l\'application est disponible.', { ms: 30000, action: { label: 'Recharger', run: () => location.reload() } });
      }
    } catch {
      // Hors ligne : on réessaiera plus tard.
    }
  };
  void check();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void check();
  });
}
