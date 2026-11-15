import { useState } from 'react';
import { History, Loader } from 'lucide-react';
import { useVault, PRIVATE_FILE } from '../store/vault';
import { isConfigured, useSync } from '../store/sync';
import { toast } from '../store/ui';
import { getFileAt, listVersions, type FileVersion } from '../lib/github';
import { isEnvelope, type Envelope } from '../lib/crypto';
import { summarizePrivate, type PrivateDoc } from '../lib/privateData';
import { plural } from '../lib/util';
import { Button, Field, Modal } from './ui';

type Row = FileVersion & { env?: Envelope | null; doc?: PrivateDoc | null; sum?: ReturnType<typeof summarizePrivate> };

const when = (iso: string) =>
  new Date(iso).toLocaleString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/**
 * « Retrouver une ancienne version » : chaque synchronisation garde une copie chiffrée dans l'historique du dépôt.
 * On les déchiffre ici, sur l'appareil, pour remettre ce qui a disparu (groupes, résultats).
 */
export function VaultHistoryButton() {
  const configured = useSync((s) => isConfigured(s.config));
  const [open, setOpen] = useState(false);
  if (!configured) return null;
  return (
    <>
      <Button size="sm" icon={<History size={15} />} onClick={() => setOpen(true)}>
        Retrouver une ancienne version
      </Button>
      {open && <VaultHistoryModal onClose={() => setOpen(false)} />}
    </>
  );
}

function VaultHistoryModal({ onClose }: { onClose: () => void }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [pw, setPw] = useState('');
  const current = summarizePrivate(useVault((s) => s.doc));

  const load = async (password?: string) => {
    setError('');
    const cfg = { ...useSync.getState().config, path: PRIVATE_FILE };
    try {
      const list: Row[] = rows ?? (await listVersions(cfg, 60));
      const out: Row[] = [];
      for (let i = 0; i < list.length; i++) {
        setProgress(`Lecture des versions… ${i + 1} / ${list.length}`);
        const r = { ...list[i] };
        if (r.env === undefined) {
          const raw = await getFileAt(cfg, r.sha);
          let env: Envelope | null = null;
          try {
            const parsed = raw ? JSON.parse(raw) : null;
            if (isEnvelope(parsed)) env = parsed;
          } catch {
            /* version abîmée */
          }
          r.env = env;
        }
        if (r.env && !r.doc) {
          r.doc = await useVault.getState().openVersion(r.env, password);
          r.sum = r.doc ? summarizePrivate(r.doc) : undefined;
        }
        out.push(r);
        setRows([...out, ...list.slice(i + 1)]);
      }
      setRows(out);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setProgress('');
    }
  };

  const restore = (r: Row) => {
    if (!r.doc) return;
    const res = useVault.getState().restore(r.doc);
    const parts = [
      res.groups && `les groupes de ${plural(res.groups, 'fiche')}`,
      res.saved && plural(res.saved, 'groupe enregistré', 'groupes enregistrés'),
      res.rows && plural(res.rows, 'résultat d’élève', 'résultats d’élèves'),
      res.rosters && plural(res.rosters, 'liste d’élèves', 'listes d’élèves'),
    ].filter(Boolean);
    toast(parts.length ? `Récupéré : ${parts.join(', ')}. Vos autres appareils le recevront à la prochaine synchronisation.` : 'Rien à récupérer : tout ce que contenait cette version est déjà là.', {
      tone: parts.length ? 'success' : undefined,
      ms: 8000,
    });
    if (parts.length) void useSync.getState().syncNow();
    onClose();
  };

  const locked = rows?.some((r) => r.env && !r.doc);

  return (
    <Modal title="Retrouver une ancienne version" onClose={onClose}>
      <p className="muted small">
        À chaque synchronisation, une copie chiffrée des données des élèves est gardée en ligne. Choisissez une version d'avant la perte : ce qui a disparu depuis (groupes, résultats) est remis, et ce que vous avez fait ensuite est gardé.
      </p>
      <p className="small">
        Aujourd'hui : <strong>{plural(current.grouped, 'fiche')}</strong> avec des groupes · {plural(current.saved, 'groupe enregistré', 'groupes enregistrés')} · {plural(current.filled, 'fiche remplie', 'fiches remplies')}
      </p>
      {!rows && !progress && (
        <div>
          <Button variant="primary" onClick={() => void load()}>
            Afficher les versions
          </Button>
        </div>
      )}
      {progress && (
        <p className="muted row" style={{ gap: 8 }}>
          <Loader size={16} className="spin" /> {progress}
        </p>
      )}
      {error && <p className="error-text small">{error}</p>}
      {locked && !progress && (
        <form
          className="row"
          style={{ gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}
          onSubmit={(e) => {
            e.preventDefault();
            void load(pw);
          }}
        >
          <Field label="Certaines versions ont un autre mot de passe : tapez-le pour les lire">
            <input className="input" type="password" value={pw} onChange={(e) => setPw(e.target.value)} />
          </Field>
          <Button type="submit" disabled={!pw}>
            Lire
          </Button>
        </form>
      )}
      {rows && (
        <ul className="reuse-list">
          {rows.map((r) => (
            <li key={r.sha}>
              <div className="grow">
                <strong>{when(r.date)}</strong>
                <span className="muted small">
                  {' · '}
                  {r.sum
                    ? `${plural(r.sum.grouped, 'fiche')} avec des groupes · ${plural(r.sum.saved, 'groupe enregistré', 'groupes enregistrés')} · ${plural(r.sum.filled, 'fiche remplie', 'fiches remplies')} · ${plural(r.sum.students, 'élève')}`
                    : r.env === undefined
                      ? '…'
                      : r.env
                        ? 'autre mot de passe'
                        : 'illisible'}
                </span>
              </div>
              {r.doc && (
                <Button size="sm" onClick={() => restore(r)}>
                  Récupérer
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
