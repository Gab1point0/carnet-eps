import { useCallback, useEffect, useRef, useState } from 'react';
import type { WorkerIn, WorkerOut } from './whisper.worker';

// Dictée par le moteur intégré (Whisper, voir whisper.worker.ts), pour les navigateurs dont la dictée
// ne transcrit rien (Opera, Brave…). Le micro est découpé à chaque pause et chaque morceau est transcrit à part.

const RATE = 16000; // Whisper attend de l'audio mono à 16 kHz
const SPEECH_LEVEL = 0.012; // en dessous : silence
const PAUSE_MS = 800; // pause qui termine un morceau
const MIN_SECONDS = 1.2;
const MAX_SECONDS = 25; // Whisper lit 30 s à la fois : on coupe avant

/** Phrases que Whisper invente parfois sur du silence (sous-titres de vidéos). */
const HALLUCINATION = /amara\.org|^\W*sous-titr|merci d'avoir regardé|abonnez-vous|^\W*(musique|applaudissements)\W*$/i;

export const cleanWhisper = (text: string) => {
  const t = text
    .replace(/\s+/g, ' ')
    .replace(/\bet chauffement/gi, 'échauffement') // mot du métier que Whisper entend souvent mal
    .trim();
  if (HALLUCINATION.test(t) || /^[\W\d]*$/.test(t)) return '';
  return t.charAt(0).toUpperCase() + t.slice(1);
};

export const localDictationSupported = () =>
  typeof window !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof Worker !== 'undefined' && typeof WebAssembly !== 'undefined';

function resample(chunks: Float32Array[], from: number): Float32Array {
  const length = chunks.reduce((n, c) => n + c.length, 0);
  const input = new Float32Array(length);
  let o = 0;
  for (const c of chunks) {
    input.set(c, o);
    o += c.length;
  }
  if (from === RATE) return input;
  const ratio = from / RATE;
  const out = new Float32Array(Math.floor(length / ratio));
  for (let i = 0; i < out.length; i++) {
    // moyenne des échantillons couverts : évite les sifflements du sous-échantillonnage
    const a = Math.floor(i * ratio);
    const b = Math.min(length, Math.floor((i + 1) * ratio));
    let s = 0;
    for (let j = a; j < b; j++) s += input[j];
    out[i] = b > a ? s / (b - a) : input[a] ?? 0;
  }
  return out;
}

let sharedWorker: Worker | null = null;
const workerListeners = new Set<(m: WorkerOut) => void>();
let engineReady = false;
function worker(): Worker {
  if (!sharedWorker) {
    sharedWorker = new Worker(new URL('./whisper.worker.ts', import.meta.url), { type: 'module' });
    sharedWorker.onmessage = (e: MessageEvent<WorkerOut>) => {
      if (e.data.type === 'ready') engineReady = true;
      workerListeners.forEach((l) => l(e.data));
    };
  }
  return sharedWorker;
}
const send = (m: WorkerIn, transfer: Transferable[] = []) => worker().postMessage(m, transfer);

export function useLocalDictation(onText: (text: string) => void) {
  const supported = localDictationSupported();
  const [listening, setListening] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [speaking, setSpeaking] = useState(false); // une phrase est en cours : « J'ai terminé » doit pouvoir la récupérer
  const [download, setDownload] = useState<number | null>(null);
  const [ready, setReady] = useState(engineReady);
  const [error, setError] = useState('');
  const cb = useRef(onText);
  cb.current = onText;

  const audio = useRef<{ stream: MediaStream; ctx: AudioContext } | null>(null);
  const chunks = useRef<Float32Array[]>([]);
  const samples = useRef(0);
  const silentMs = useRef(0);
  const voiced = useRef(false);
  const pending = useRef(new Set<number>());
  const waiters = useRef<Array<() => void>>([]);
  const nextId = useRef(1);

  useEffect(() => {
    const listener = (m: WorkerOut) => {
      if (m.type === 'progress') setDownload(m.total ? Math.min(99, Math.round((m.loaded / m.total) * 100)) : null);
      else if (m.type === 'ready') {
        setReady(true);
        setDownload(null);
      } else if ((m.type === 'result' || m.type === 'error') && m.id !== undefined) {
        if (!pending.current.delete(m.id)) return;
        setPendingCount(pending.current.size);
        if (m.type === 'result') {
          const t = cleanWhisper(m.text);
          if (t) cb.current(t);
        } else setError(`La transcription a échoué (${m.message}).`);
        if (pending.current.size === 0) waiters.current.splice(0).forEach((w) => w());
      } else if (m.type === 'error') {
        setDownload(null);
        setError("Le moteur de dictée n'a pas pu se charger. La première fois, il faut une connexion internet.");
        pending.current.clear();
        setPendingCount(0);
        waiters.current.splice(0).forEach((w) => w());
      }
    };
    workerListeners.add(listener);
    return () => {
      workerListeners.delete(listener);
    };
  }, []);

  /** Envoie le morceau en cours à la transcription (s'il contient de la voix). */
  const cut = useCallback(() => {
    const parts = chunks.current;
    const hadVoice = voiced.current;
    chunks.current = [];
    samples.current = 0;
    silentMs.current = 0;
    voiced.current = false;
    setSpeaking(false);
    if (!hadVoice || !parts.length || !audio.current) return;
    const pcm = resample(parts, audio.current.ctx.sampleRate);
    if (pcm.length < RATE * 0.5) return;
    const id = nextId.current++;
    pending.current.add(id);
    setPendingCount(pending.current.size);
    send({ type: 'transcribe', id, audio: pcm }, [pcm.buffer]);
  }, []);

  const release = useCallback(() => {
    const a = audio.current;
    audio.current = null;
    a?.stream.getTracks().forEach((t) => t.stop());
    void a?.ctx.close().catch(() => undefined);
  }, []);

  const stop = useCallback(() => {
    if (audio.current) cut();
    release();
    setListening(false);
  }, [cut, release]);

  const start = useCallback(async () => {
    setError('');
    setListening(true);
    send({ type: 'load' }); // le téléchargement du modèle commence pendant qu'on parle
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    } catch (e) {
      const name = (e as { name?: string }).name;
      setError(
        name === 'NotFoundError'
          ? "Aucun micro détecté : vérifiez qu'il est branché et choisi comme micro par défaut dans Windows."
          : name === 'NotReadableError'
            ? 'Le micro ne répond pas : il est peut-être utilisé par une autre application (Teams, Zoom…).'
            : "Micro bloqué : cliquez sur le cadenas à gauche de l'adresse du site et autorisez le micro.",
      );
      setListening(false);
      return;
    }
    const ctx = new AudioContext();
    const source = ctx.createMediaStreamSource(stream);
    const proc = ctx.createScriptProcessor(4096, 1, 1);
    proc.onaudioprocess = (e) => {
      const data = new Float32Array(e.inputBuffer.getChannelData(0));
      let sum = 0;
      for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
      const loud = Math.sqrt(sum / data.length) > SPEECH_LEVEL;
      const ms = (data.length / ctx.sampleRate) * 1000;
      if (!voiced.current && !loud) {
        // Silence avant de parler : on n'en garde qu'un court instant, pour ne pas couper le premier mot.
        chunks.current = [...chunks.current.slice(-2), data];
        samples.current = chunks.current.reduce((n, c) => n + c.length, 0);
        return;
      }
      chunks.current.push(data);
      samples.current += data.length;
      if (loud) {
        if (!voiced.current) setSpeaking(true);
        voiced.current = true;
        silentMs.current = 0;
      } else silentMs.current += ms;
      const seconds = samples.current / ctx.sampleRate;
      if ((silentMs.current >= PAUSE_MS && seconds >= MIN_SECONDS) || seconds >= MAX_SECONDS) cut();
    };
    source.connect(proc);
    proc.connect(ctx.destination);
    audio.current = { stream, ctx };
  }, [cut]);

  /** Termine le morceau en cours et attend que tout ce qui a été dit soit écrit. */
  const flush = useCallback(async () => {
    if (audio.current) cut();
    if (pending.current.size) await new Promise<void>((r) => waiters.current.push(r));
    return '';
  }, [cut]);

  useEffect(() => () => release(), [release]);

  const status = download !== null
    ? `Chargement du moteur de dictée : ${download} %. La première fois, il se télécharge (jusqu’à 300 Mo) ; il reste ensuite sur cet ordinateur.`
    : pendingCount > 0
      ? ready ? 'Transcription en cours…' : 'Préparation du moteur de dictée…'
      : listening
        ? 'Parlez : le texte s\'écrit après chaque pause.'
        : '';

  return { supported, listening, interim: '', pending: pendingCount > 0 || speaking, status, error, start, stop, flush };
}
