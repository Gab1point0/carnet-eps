import { useState } from 'react';
import { Check, Loader, Pencil, Sparkles, Undo2 } from 'lucide-react';
import { toast } from '../store/ui';
import { Button, TextArea } from './ui';
import { Markdown } from './Markdown';

/**
 * Texte en mini-Markdown : s'affiche mis en forme (gras, listes) ; un bouton passe en mode modification
 * pour écrire avec les marques `**gras**` et `- liste`. Un champ vide s'ouvre directement en modification.
 */
/** Texte mis en forme par Claude → texte écrit avant (le temps de la session, même si le bloc est refermé). */
const BEFORE_AI = new Map<string, string>();

export function MarkdownField({
  value,
  onChange,
  minRows = 4,
  placeholder,
  aiFormat,
}: {
  value: string;
  /** `why` : « ai » pour le texte mis en forme par Claude, « undo » pour le retour au texte d'avant. */
  onChange: (v: string, why?: 'ai' | 'undo') => void;
  minRows?: number;
  placeholder?: string;
  /** « Mettre en forme avec Claude » : renvoie le texte rédigé (bouton absent sinon). */
  aiFormat?: (text: string) => Promise<string>;
}) {
  const [editing, setEditing] = useState(!value.trim());
  const [busy, setBusy] = useState(false);
  // Texte d'avant la mise en forme par Claude, tant que le texte mis en forme n'a pas été retouché.
  const before = BEFORE_AI.get(value);
  const format = async () => {
    if (!aiFormat) return;
    const mine = value;
    setBusy(true);
    try {
      const text = await aiFormat(mine);
      BEFORE_AI.set(text, mine);
      onChange(text, 'ai');
      setEditing(false);
      toast('Texte mis en forme par Claude. « Revenir à mon texte » est à côté de « Modifier le texte ».', { tone: 'success', ms: 8000 });
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Claude est indisponible.', { tone: 'error', ms: 8000 });
    } finally {
      setBusy(false);
    }
  };
  if (!editing) {
    return (
      <div className="md-field">
        <Markdown text={value} />
        <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
          <Button size="sm" icon={<Pencil size={14} />} onClick={() => setEditing(true)}>
            Modifier le texte
          </Button>
          {before !== undefined && (
            <Button
              size="sm"
              icon={<Undo2 size={14} />}
              onClick={() => {
                BEFORE_AI.delete(value);
                onChange(before, 'undo');
              }}
            >
              Revenir à mon texte
            </Button>
          )}
        </div>
      </div>
    );
  }
  return (
    <div className="md-field">
      <TextArea value={value} onChange={(v) => onChange(v)} minRows={minRows} placeholder={placeholder} />
      {value.trim() && (
        <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
          <Button size="sm" icon={<Check size={14} />} onClick={() => setEditing(false)} disabled={busy}>
            Terminer (voir la mise en forme)
          </Button>
          {aiFormat && (
            <Button size="sm" icon={busy ? <Loader size={14} className="spin" /> : <Sparkles size={14} />} onClick={format} disabled={busy}>
              {busy ? 'Mise en forme…' : 'Mettre en forme avec Claude'}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
