import { toast } from '../store/ui';

// A4 en mm, marges identiques à l'impression (@page) : juste de quoi rester dans la zone imprimable.
const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 5;
const WIDTH = PAGE_W - 2 * MARGIN;
const HEIGHT = PAGE_H - 2 * MARGIN;
const GAP = 4;
const RENDER_W = 756; // largeur A4 utile en pixels CSS
const MAX_RENDER_W = 1134; // au-delà, le texte deviendrait trop petit sur papier

/** `window.print()` ne fait rien sans prévenir dans une application installée sur téléphone. */
function printUnavailable() {
  const nav = navigator as Navigator & { standalone?: boolean };
  return !!nav.standalone || matchMedia('(display-mode: standalone)').matches || matchMedia('(pointer: coarse)').matches;
}

const isIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

type Canvas = HTMLCanvasElement;

async function capture(el: HTMLElement, cache: Map<string, Canvas>, width = RENDER_W) {
  const key = `${width}|${el.outerHTML}`;
  const known = cache.get(key);
  if (known) return { canvas: known, alias: key };
  const { default: html2canvas } = await import('html2canvas-pro');
  const canvas = await html2canvas(el, {
    scale: 2,
    backgroundColor: '#ffffff',
    windowWidth: 1200,
    onclone: (doc, clone) => {
      doc.documentElement.setAttribute('data-theme', 'light');
      doc.documentElement.classList.add('pdf-mode');
      clone.style.width = `${width}px`;
      clone.style.maxWidth = 'none';
    },
  });
  cache.set(key, canvas);
  return { canvas, alias: key };
}

/** Une fiche trop haute est mise en page plus large, pour tenir sans laisser de marges sur les côtés. */
async function captureToFit(el: HTMLElement, cache: Map<string, Canvas>, maxH: number) {
  let width = RENDER_W;
  for (;;) {
    const shot = await capture(el, cache, width);
    const h = heightOf(shot.canvas);
    if (h <= maxH) return { ...shot, fits: true };
    if (width >= MAX_RENDER_W) return { ...shot, fits: false };
    width = Math.min(MAX_RENDER_W, Math.ceil(((width * h) / maxH) * 1.02));
  }
}

const heightOf = (image: Canvas) => (image.height / image.width) * WIDTH;

/** Morceaux à placer sur les pages : une fiche reste entière, une séance s'écoule partie par partie. */
function unitsOf(selector: string) {
  const units: Array<{ el: HTMLElement; kind: 'half' | 'full' | 'flow' }> = [];
  for (const root of document.querySelectorAll<HTMLElement>(selector)) {
    if (root.classList.contains('fiche')) units.push({ el: root, kind: root.classList.contains('fiche-half') ? 'half' : 'full' });
    else for (const child of root.children) if (!child.classList.contains('no-print')) units.push({ el: child as HTMLElement, kind: 'flow' });
  }
  return units;
}

/** Fabrique le PDF à partir de ce qui est affiché. */
export async function buildPdf(selector: string): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  const cache = new Map<string, Canvas>();
  let used = false; // la page en cours contient déjà quelque chose
  let y = MARGIN;
  let halves = 0;
  const newPage = () => {
    if (used) pdf.addPage();
    used = false;
    y = MARGIN;
    halves = 0;
  };
  // Toujours sur toute la largeur utile.
  const place = (image: Canvas, alias?: string) => {
    const h = heightOf(image);
    pdf.addImage(image, 'PNG', MARGIN, y, WIDTH, h, alias, 'FAST');
    used = true;
    y += h + GAP;
  };
  // Plus haut qu'une page : on le découpe, sans le réduire.
  const placeSliced = (canvas: Canvas) => {
    const perMm = canvas.width / WIDTH;
    for (let top = 0; top < canvas.height; ) {
      if (y >= MARGIN + HEIGHT - 20) newPage();
      const slice = document.createElement('canvas');
      slice.width = canvas.width;
      slice.height = Math.min(canvas.height - top, Math.floor((MARGIN + HEIGHT - y) * perMm));
      slice.getContext('2d')!.drawImage(canvas, 0, -top);
      place(slice);
      top += slice.height;
    }
  };
  const placeFull = (shot: { canvas: Canvas; alias: string; fits: boolean }) => {
    newPage();
    if (shot.fits) place(shot.canvas, shot.alias);
    else placeSliced(shot.canvas);
    y = PAGE_H; // la fiche suivante commence une autre page
  };

  for (const { el, kind } of unitsOf(selector)) {
    if (kind === 'flow') {
      const { canvas, alias } = await capture(el, cache);
      if (!canvas.width || !canvas.height) continue; // partie vide (séance sans objectif ni matériel)
      const h = heightOf(canvas);
      if (h > HEIGHT) placeSliced(canvas);
      else {
        if (y + h > MARGIN + HEIGHT) newPage();
        place(canvas, alias);
      }
      continue;
    }
    if (kind === 'half') {
      const shot = await captureToFit(el, cache, HEIGHT / 2 - GAP);
      if (shot.fits) {
        if (halves === 2 || y > MARGIN + HEIGHT / 2) newPage();
        place(shot.canvas, shot.alias);
        y = Math.max(y, MARGIN + HEIGHT / 2);
        halves++;
        continue;
      }
    }
    // Fiche pleine page, ou demi-fiche qui ne peut vraiment pas tenir sur une moitié de page.
    placeFull(await captureToFit(el, cache, HEIGHT));
  }
  return pdf.output('blob');
}

function deliver(blob: Blob, fileName: string) {
  const save = () => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };
  const file = new File([blob], fileName, { type: 'application/pdf' });
  if (isIos() && navigator.canShare?.({ files: [file] })) {
    // Sur iPhone, le partage doit partir d'un toucher : le PDF a pris trop de temps pour compter comme tel.
    toast('Votre PDF est prêt.', { tone: 'success', ms: 60000, action: { label: 'Enregistrer', run: () => void navigator.share({ files: [file] }).catch(() => undefined) } });
    return;
  }
  save();
  toast(`PDF téléchargé : ${fileName}`, { tone: 'success', ms: 6000 });
}

let running = false;

/** Bouton « Imprimer / enregistrer en PDF » : l'impression du navigateur quand elle existe, sinon un vrai fichier PDF. */
export async function printPage(name: string, selector = '.print-page .sheet') {
  if (!printUnavailable()) {
    window.print();
    return;
  }
  if (running) return;
  running = true;
  toast('Préparation du PDF…', { ms: 4000 });
  try {
    const blob = await buildPdf(selector);
    const safe = name.replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim() || 'Carnet EPS';
    deliver(blob, `${safe}.pdf`);
  } catch (e) {
    console.error(e);
    toast('Le PDF n\'a pas pu être créé. Réessayez, ou ouvrez cette page sur un ordinateur.', { tone: 'error', ms: 8000 });
  } finally {
    running = false;
  }
}
