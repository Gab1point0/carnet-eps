import { useEffect, useImperativeHandle, useRef, type Ref } from 'react';
import { Mic, MicOff } from 'lucide-react';
import { useDictation } from '../lib/dictation';
import { cls } from '../lib/util';
import { TextArea } from './ui';

export interface VoiceTextAreaHandle {
  /** Arrête le micro, attend les derniers mots (moteur intégré) et renvoie le texte complet. À appeler avant d'envoyer à Claude. */
  finish: () => Promise<string>;
}

/**
 * Zone de texte où l'on parle à Claude : on écrit, ou on touche « Parler » et la voix s'ajoute au texte.
 * Règle de l'application : toute consigne donnée à Claude doit pouvoir se dicter.
 */
export function VoiceTextArea({
  value,
  onChange,
  placeholder,
  minRows = 2,
  ref,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  minRows?: number;
  ref?: Ref<VoiceTextAreaHandle>;
}) {
  const textRef = useRef(value);
  const changeRef = useRef(onChange);
  useEffect(() => {
    textRef.current = value;
    changeRef.current = onChange;
  });
  const set = (v: string) => {
    textRef.current = v;
    changeRef.current(v);
  };
  const dictation = useDictation((t) => set(textRef.current.trim() ? `${textRef.current.trim()} ${t}` : t));

  useImperativeHandle(ref, () => ({
    async finish() {
      if (dictation.listening) dictation.stop();
      const pending = await dictation.flush();
      if (pending.trim()) set(textRef.current.trim() ? `${textRef.current.trim()} ${pending.trim()}` : pending.trim());
      return textRef.current;
    },
  }));

  return (
    <div className="voice-area">
      <div className="voice-area-row">
        <TextArea value={value} onChange={set} minRows={minRows} placeholder={placeholder} />
        {dictation.supported && (
          <button
            type="button"
            className={cls('voice-mic', dictation.listening && 'voice-mic-on')}
            onClick={dictation.listening ? dictation.stop : dictation.start}
            aria-label={dictation.listening ? 'Arrêter la dictée' : 'Parler'}
            title={dictation.listening ? 'Arrêter la dictée' : 'Parler'}
          >
            {dictation.listening ? <MicOff size={20} /> : <Mic size={20} />}
            <span>{dictation.listening ? 'Stop' : 'Parler'}</span>
          </button>
        )}
      </div>
      {dictation.listening && <p className="muted small dictate-interim">Je vous écoute{dictation.interim ? ` : … ${dictation.interim}` : '…'}</p>}
      {dictation.status && <p className="muted small dictate-interim">{dictation.status}</p>}
      {dictation.error && <p className="error-text small">{dictation.error}</p>}
    </div>
  );
}
