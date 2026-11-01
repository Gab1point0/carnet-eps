import { useCallback, useEffect, useRef, useState } from 'react';

// Reconnaissance vocale du navigateur (Chrome, Edge, Safari, Chrome Android). Pas disponible sur Firefox.
interface SpeechAlt {
  transcript: string;
}
interface SpeechResult {
  isFinal: boolean;
  0: SpeechAlt;
}
interface SpeechEvent {
  resultIndex: number;
  results: ArrayLike<SpeechResult>;
}
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: SpeechEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

function ctor(): (new () => Recognition) | null {
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const ERRORS: Record<string, string> = {
  'not-allowed': 'Micro refusé : autorisez-le dans les réglages du navigateur pour ce site.',
  'service-not-allowed': 'Micro refusé : autorisez-le dans les réglages du navigateur pour ce site.',
  'audio-capture': 'Aucun micro détecté.',
  network: 'La reconnaissance vocale a besoin d\'une connexion internet.',
  'language-not-supported': 'Le français n\'est pas disponible pour la dictée sur cet appareil.',
};

/** Ponctuation dite à voix haute : « point », « virgule »… (le navigateur ne la met pas toujours). */
export function tidyTranscript(s: string): string {
  return s
    .replace(/\s+(point d'interrogation)\b/gi, ' ?')
    .replace(/\s+(point d'exclamation)\b/gi, ' !')
    .replace(/\s+(virgule)\b/gi, ',')
    .replace(/\s+(point final|point)\s*$/gi, '.')
    .replace(/\s+à la ligne\b/gi, '\n')
    .replace(/\s+([,.?!])/g, '$1')
    .trim();
}

/** Dictée continue en français : appelle `onText` à chaque phrase terminée. */
export function useDictation(onText: (text: string) => void) {
  const supported = typeof window !== 'undefined' && ctor() !== null;
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [error, setError] = useState('');
  const rec = useRef<Recognition | null>(null);
  const wanted = useRef(false);
  const lastFinal = useRef('');
  const interimRef = useRef('');
  const cb = useRef(onText);
  cb.current = onText;

  const stop = useCallback(() => {
    wanted.current = false;
    rec.current?.stop();
    setListening(false);
    setInterim('');
  }, []);

  /**
   * Termine la partie en cours sans couper l'écoute : renvoie ce qui était encore en cours de reconnaissance
   * et relance le micro, pour que ces mots ne reviennent pas une seconde fois.
   */
  const flush = useCallback(() => {
    const pending = tidyTranscript(interimRef.current);
    interimRef.current = '';
    lastFinal.current = '';
    setInterim('');
    if (wanted.current) rec.current?.abort();
    return pending;
  }, []);

  const start = useCallback(() => {
    const C = ctor();
    if (!C) return;
    setError('');
    const r = new C();
    r.lang = 'fr-FR';
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (e) => {
      let partial = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) {
          let t = tidyTranscript(res[0].transcript);
          // Sur Android, Chrome renvoie souvent toute la phrase déjà reçue : on ne garde que la nouveauté.
          if (t === lastFinal.current) t = '';
          else if (lastFinal.current && t.startsWith(lastFinal.current)) {
            const whole = t;
            t = t.slice(lastFinal.current.length).trim();
            lastFinal.current = whole;
          } else if (t) lastFinal.current = t;
          if (t) cb.current(t);
        } else partial += res[0].transcript;
      }
      interimRef.current = partial;
      setInterim(partial);
    };
    r.onerror = (e) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return;
      setError(ERRORS[e.error] ?? `Dictée interrompue (${e.error}).`);
      wanted.current = false;
      setListening(false);
    };
    // Le navigateur coupe après un silence : on relance tant que l'utilisateur n'a pas arrêté.
    r.onend = () => {
      setInterim('');
      if (wanted.current) {
        try {
          r.start();
        } catch {
          setListening(false);
        }
      } else setListening(false);
    };
    rec.current = r;
    wanted.current = true;
    try {
      r.start();
      setListening(true);
    } catch {
      setError('Impossible de démarrer le micro.');
    }
  }, []);

  useEffect(
    () => () => {
      wanted.current = false;
      rec.current?.abort();
    },
    [],
  );

  return { supported, listening, interim, error, start, stop, flush };
}
