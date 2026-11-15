import type { Attachment } from './ai';

// Documents joints à une demande à Claude (référentiel du bac en photo ou en PDF). Les photos sont réduites
// dans le navigateur avant l'envoi : une photo de téléphone pèse plusieurs Mo, Claude n'a pas besoin de plus
// de ~1600 px pour lire une page.

const MAX_SIDE = 1600;
/** L'API refuse une requête de plus de 32 Mo (base64 compris) : on garde une marge. */
export const MAX_TOTAL_BYTES = 20 * 1024 * 1024;

const toBase64 = (buf: ArrayBuffer) => {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};

async function shrinkImage(file: File): Promise<Attachment> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  const blob = await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('Image illisible'))), 'image/jpeg', 0.85));
  return { name: file.name, mediaType: 'image/jpeg', data: toBase64(await blob.arrayBuffer()) };
}

/** Photo ou PDF → pièce jointe pour Claude. */
export async function fileToAttachment(file: File): Promise<Attachment> {
  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
    return { name: file.name, mediaType: 'application/pdf', data: toBase64(await file.arrayBuffer()) };
  }
  if (file.type.startsWith('image/') || /\.(jpe?g|png|webp|heic|gif)$/i.test(file.name)) return shrinkImage(file);
  throw new Error(`« ${file.name} » n'est ni une photo ni un PDF.`);
}

/** Taille réelle envoyée (base64 → octets). */
export const attachmentBytes = (a: Attachment) => Math.round((a.data.length * 3) / 4);
