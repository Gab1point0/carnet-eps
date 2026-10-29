import { useSettings } from '../store/selectors';
import { cls } from '../lib/util';

/** Choix d'un ou plusieurs niveaux de classe (6e, 5e…) pour un modèle de la bibliothèque. */
export function LevelsField({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const levels = useSettings().levels;
  const toggle = (l: string) => onChange(value.includes(l) ? value.filter((x) => x !== l) : [...value, l]);
  return (
    <div className="row" style={{ gap: 6, flexWrap: 'wrap' }} role="group" aria-label="Niveaux de classe">
      {levels.map((l) => (
        <button key={l} type="button" className={cls('seg', value.includes(l) && 'seg-on')} onClick={() => toggle(l)}>
          {l}
        </button>
      ))}
    </div>
  );
}
