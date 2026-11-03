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
  onaudiostart: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

function ctor(): (new () => Recognition) | null {
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** Ordinateur (souris) plutôt que téléphone ou tablette. */
export const isDesktop = () => typeof window !== 'undefined' && !window.matchMedia?.('(pointer: coarse)').matches;

const WINDOWS_HINT = ' En attendant, cliquez dans la zone de texte et appuyez sur les touches Windows + H pour dicter avec Windows.';
const BLOCKED =
  "Micro bloqué. Cliquez sur le cadenas à gauche de l'adresse du site et autorisez le micro. Sur Windows, vérifiez aussi Paramètres → Confidentialité et sécurité → Microphone : « Accès au microphone » et « Autoriser les applications de bureau à accéder au microphone » doivent être activés.";

const ERRORS: Record<string, string> = {
  'not-allowed': BLOCKED,
  'service-not-allowed': 'Ce navigateur ne propose pas la dictée. Utilisez Google Chrome ou Microsoft Edge.',
  'audio-capture': "Aucun micro détecté : vérifiez qu'il est branché et choisi comme micro par défaut dans Windows.",
  network:
    "La dictée du navigateur ne répond pas : pas de connexion internet, ou navigateur qui ne la propose pas (Brave, Opera…). Utilisez Google Chrome ou Microsoft Edge.",
  'language-not-supported': "Le français n'est pas disponible pour la dictée sur cet appareil.",
};

/**
 * Sur ordinateur, ouvre le micro une première fois : le navigateur demande l'autorisation,
 * et on obtient une erreur claire (micro absent, bloqué par Windows, déjà utilisé).
 */
async function checkMicrophone(): Promise<string> {
  if (!navigator.mediaDevices?.getUserMedia) return '';
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
    return '';
  } catch (e) {
    const name = (e as { name?: string }).name;
    if (name === 'NotFoundError' || name === 'OverconstrainedError') return ERRORS['audio-capture'];
    if (name === 'NotReadableError') return 'Le micro ne répond pas : il est peut-être utilisé par une autre application (Teams, Zoom…) ou bloqué par Windows.';
    return BLOCKED;
  }
}

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
  const watchdog = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cb = useRef(onText);
  cb.current = onText;

  const clearWatchdog = () => {
    if (watchdog.current) clearTimeout(watchdog.current);
    watchdog.current = null;
  };

  const stop = useCallback(() => {
    wanted.current = false;
    clearWatchdog();
    rec.current?.stop();
    setListening(false);
    setInterim('');
  }, []);

  /** Arrête tout et explique pourquoi (avec, sur ordinateur, la dictée de Windows en secours). */
  const fail = useCallback((message: string) => {
    wanted.current = false;
    clearWatchdog();
    rec.current?.abort();
    setListening(false);
    setInterim('');
    setError(message + (isDesktop() ? WINDOWS_HINT : ''));
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

  const start = useCallback(async () => {
    const C = ctor();
    if (!C) return;
    setError('');
    setListening(true);
    wanted.current = true;
    if (isDesktop()) {
      const problem = await checkMicrophone();
      if (!wanted.current) return; // arrêté pendant la vérification
      if (problem) return fail(problem);
    }
    const r = new C();
    let heard = false;
    let quickEnds = 0;
    let startedAt = Date.now();
    r.lang = 'fr-FR';
    r.continuous = true;
    r.interimResults = true;
    r.onaudiostart = () => {
      heard = true;
      clearWatchdog();
    };
    r.onresult = (e) => {
      heard = true;
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
      fail(ERRORS[e.error] ?? `Dictée interrompue (${e.error}).`);
    };
    // Le navigateur coupe après un silence : on relance tant que l'utilisateur n'a pas arrêté.
    r.onend = () => {
      setInterim('');
      if (!wanted.current) return setListening(false);
      // Un navigateur qui ne sait pas dicter s'arrête aussitôt sans rien dire : on ne relance pas sans fin.
      quickEnds = !heard && Date.now() - startedAt < 1500 ? quickEnds + 1 : 0;
      if (quickEnds >= 3) return fail("La dictée de ce navigateur s'arrête aussitôt. Utilisez Google Chrome ou Microsoft Edge.");
      try {
        startedAt = Date.now();
        r.start();
      } catch {
        fail('Impossible de relancer le micro.');
      }
    };
    rec.current = r;
    // Le micro doit s'ouvrir en quelques secondes ; sinon on le dit, au lieu d'afficher « Je vous écoute » pour rien.
    clearWatchdog();
    watchdog.current = setTimeout(() => {
      if (wanted.current && !heard) fail("Le micro ne s'est pas ouvert. Essayez Google Chrome ou Microsoft Edge.");
    }, 6000);
    try {
      r.start();
    } catch {
      fail('Impossible de démarrer le micro.');
    }
  }, [fail]);

  useEffect(
    () => () => {
      wanted.current = false;
      clearWatchdog();
      rec.current?.abort();
    },
    [],
  );

  return { supported, listening, interim, error, start, stop, flush };
}
