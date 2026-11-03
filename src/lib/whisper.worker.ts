/// <reference lib="webworker" />
// Moteur de dictée intégré : Whisper (OpenAI) tourne dans le navigateur, sans serveur.
// Le modèle est téléchargé une fois depuis Hugging Face puis gardé en cache par le navigateur.
import { pipeline, type AutomaticSpeechRecognitionPipeline, type ProgressInfo } from '@huggingface/transformers';

export type WorkerIn = { type: 'load' } | { type: 'transcribe'; id: number; audio: Float32Array };
export type WorkerOut =
  | { type: 'progress'; loaded: number; total: number }
  | { type: 'ready'; engine: string }
  | { type: 'result'; id: number; text: string }
  | { type: 'error'; id?: number; message: string };

const post = (m: WorkerOut) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(m);

/** Carte graphique (WebGPU) : modèle « small », bien meilleur en français. Sinon processeur : « base », plus léger. */
async function config() {
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
  const adapter = await gpu?.requestAdapter().catch(() => null);
  if (adapter)
    return { model: 'onnx-community/whisper-small', device: 'webgpu' as const, dtype: { encoder_model: 'q4', decoder_model_merged: 'q4' } as const, megabytes: 305 };
  return { model: 'onnx-community/whisper-base', device: 'wasm' as const, dtype: { encoder_model: 'q8', decoder_model_merged: 'q8' } as const, megabytes: 80 };
}

let loading: Promise<AutomaticSpeechRecognitionPipeline> | null = null;
function load() {
  loading ??= (async () => {
    const c = await config();
    // Avancement fichier par fichier (le total global annoncé par la bibliothèque est faux) ; taille attendue en secours.
    const files: Record<string, { loaded: number; total: number }> = {};
    const asr = (await pipeline('automatic-speech-recognition', c.model, {
      device: c.device,
      dtype: c.dtype,
      progress_callback: (p: ProgressInfo) => {
        if (p.status !== 'progress') return;
        files[p.file] = { loaded: p.loaded, total: p.total };
        const all = Object.values(files);
        const loaded = all.reduce((n, f) => n + f.loaded, 0);
        const total = Math.max(c.megabytes * 1e6, all.reduce((n, f) => n + f.total, 0));
        post({ type: 'progress', loaded, total });
      },
    })) as AutomaticSpeechRecognitionPipeline;
    post({ type: 'ready', engine: `${c.model.split('/')[1]} · ${c.device === 'webgpu' ? 'carte graphique' : 'processeur'}` });
    return asr;
  })();
  loading.catch(() => (loading = null));
  return loading;
}

// Une transcription à la fois, dans l'ordre d'arrivée.
let queue: Promise<unknown> = Promise.resolve();

self.onmessage = (e: MessageEvent<WorkerIn>) => {
  const msg = e.data;
  if (msg.type === 'load') {
    load().catch((err) => post({ type: 'error', message: String(err?.message ?? err) }));
    return;
  }
  queue = queue.then(async () => {
    try {
      const asr = await load();
      const out = await asr(msg.audio, { language: 'french', task: 'transcribe', chunk_length_s: 30, stride_length_s: 5 });
      const text = (Array.isArray(out) ? out.map((o) => o.text).join(' ') : out.text).trim();
      post({ type: 'result', id: msg.id, text });
    } catch (err) {
      post({ type: 'error', id: msg.id, message: String((err as Error)?.message ?? err) });
    }
  });
};
