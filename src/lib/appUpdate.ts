import { toast } from '../store/ui';

const CHECK_EVERY = 60_000;
/** Date de construction inscrite dans la page (voir vite.config.ts). */
const buildOf = (html: string) => html.match(/name="app-build" content="([^"]+)"/)?.[1] ?? null;

let current: string | null = null;
let outdated = false;
let warned = false;
let lastCheck = 0;

/**
 * Une version plus récente de l'application est-elle en ligne ? Un onglet resté ouvert garde son ancien code,
 * qui ne connaît pas les nouvelles données (par exemple les groupes) : s'il synchronisait, il les effacerait.
 * Tant qu'il n'est pas rechargé, il ne synchronise donc plus.
 */
export async function checkForUpdate(force = false): Promise<boolean> {
  if (outdated || !current) return outdated;
  if (!force && Date.now() - lastCheck < CHECK_EVERY) return false;
  lastCheck = Date.now();
  try {
    const res = await fetch('./index.html', { cache: 'no-store' });
    const latest = res.ok ? buildOf(await res.text()) : null;
    // Seulement si le site est plus récent (juste après une mise en ligne, il peut encore servir l'ancienne page).
    if (latest && latest > current) {
      outdated = true;
      if (!warned) {
        warned = true;
        toast("Une nouvelle version de l'application est en ligne : rechargez pour continuer à synchroniser (rien n'est perdu).", {
          ms: 600000,
          action: { label: 'Recharger', run: () => location.reload() },
        });
      }
    }
  } catch {
    // Hors ligne : on réessaiera plus tard.
  }
  return outdated;
}
/** Surveille les mises à jour ; quand on revient sur un onglet périmé, il se recharge tout seul (jamais pendant qu'on s'en sert). */
export function watchAppUpdates() {
  watchMissingChunks();
  current = buildOf(document.documentElement.outerHTML);
  if (!current) return;
  void checkForUpdate();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (outdated) location.reload();
    else void checkForUpdate().then((old) => old && location.reload());
  });
}

const RELOADED = 'carnet-eps:recharge-maj';

/**
 * Onglet ouvert avant une mise en ligne : ses morceaux chargés à la demande (assistant Claude, dictée, impression…)
 * ont changé de nom et n'existent plus sur le site (« Failed to fetch dynamically imported module »). On recharge
 * une fois la page pour prendre la nouvelle version (le travail en cours est déjà enregistré), puis on prévient.
 * Pas plus d'un rechargement par minute : hors ligne, l'erreur s'affiche normalement.
 */
function watchMissingChunks() {
  let note: string | null = null;
  try {
    note = sessionStorage.getItem(RELOADED);
  } catch {
    /* stockage indisponible */
  }
  if (note && Date.now() - Number(note) < 60_000) {
    toast("L'application vient d'être mise à jour : recommencez ce que vous faisiez.", { ms: 8000 });
  }
  window.addEventListener('vite:preloadError', (event) => {
    if (note && Date.now() - Number(note) < 60_000) return;
    try {
      sessionStorage.setItem(RELOADED, String(Date.now()));
    } catch {
      return; // sans mémoire du rechargement, on risquerait de recharger en boucle
    }
    event.preventDefault();
    setTimeout(() => location.reload(), 300);
  });
}
