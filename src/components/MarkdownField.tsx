import { useState } from 'react';
import { Check, Pencil } from 'lucide-react';
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
}: {
  value: string;
  onChange: (v: string) => void;
  minRows?: number;
  placeholder?: string;
}) {
  const [editing, setEditing] = useState(!value.trim());
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
        <Button size="sm" icon={<Check size={14} />} onClick={() => setEditing(false)}>
          Terminer (voir la mise en forme)
        </Button>
      )}
    </div>
  );
}
