import { useState } from 'react';
import { Check, Loader, Pencil, Sparkles } from 'lucide-react';
import { toast } from '../store/ui';
import { Button, TextArea } from './ui';
import { Markdown } from './Markdown';

/**
 * Texte en mini-Markdown : s'affiche mis en forme (gras, listes) ; un bouton passe en mode modification
 * pour écrire avec les marques `**gras**` et `- liste`. Un champ vide s'ouvre directement en modification.
 */
export function MarkdownField({
  value,
  onChange,
  minRows = 4,
  placeholder,
  aiFormat,
}: {
  value: string;
  onChange: (v: string) => void;
  minRows?: number;
  placeholder?: string;
  /** « Mettre en forme avec Claude » : renvoie le texte rédigé (bouton absent sinon). */
  aiFormat?: (text: string) => Promise<string>;
}) {
  const [editing, setEditing] = useState(!value.trim());
  const [busy, setBusy] = useState(false);
  const format = async () => {
    if (!aiFormat) return;
    const before = value;
    setBusy(true);
    try {
      const text = await aiFormat(before);
      onChange(text);
      setEditing(false);
      toast('Texte mis en forme par Claude.', { tone: 'success', ms: 10000, action: { label: 'Revenir à mon texte', run: () => onChange(before) } });
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
        <Button size="sm" icon={<Pencil size={14} />} onClick={() => setEditing(true)}>
          Modifier le texte
        </Button>
      </div>
    );
  }
  return (
    <div className="md-field">
      <TextArea value={value} onChange={onChange} minRows={minRows} placeholder={placeholder} />
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
