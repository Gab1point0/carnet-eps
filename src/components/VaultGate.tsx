import { useState, type ReactNode } from 'react';
import { Lock, ShieldCheck } from 'lucide-react';
import { useVault } from '../store/vault';
import { Button, Card, Field } from './ui';

/**
 * Affiche son contenu seulement quand le coffre des élèves est ouvert sur cet appareil ;
 * sinon, propose de le créer (premier appareil) ou de l'ouvrir avec le mot de passe.
 */
export function VaultGate({ children }: { children: ReactNode }) {
  const status = useVault((s) => s.status);
  const remote = useVault((s) => s.remote);
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (status === 'open') return <>{children}</>;
  if (status === 'loading') return null;

  const creating = status === 'none';
  const submit = async () => {
    setError('');
    if (creating) {
      if (pw.length < 8) return setError('8 caractères au moins.');
      if (pw !== pw2) return setError('Les deux mots de passe sont différents.');
    }
    setBusy(true);
    try {
      if (creating) await useVault.getState().create(pw);
      else if (!(await useVault.getState().unlock(pw))) setError('Mot de passe incorrect.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="stack vault-gate">
      <div className="row" style={{ gap: 10 }}>
        {creating ? <ShieldCheck size={22} /> : <Lock size={22} />}
        <strong>{creating ? 'Protéger les données des élèves' : 'Données des élèves verrouillées'}</strong>
      </div>
      <p className="muted small">
        {creating
          ? "Les noms et les résultats des élèves sont chiffrés sur cet appareil avec un mot de passe que vous seul connaissez. Ils ne sont jamais envoyés à Claude ; s'ils sont synchronisés, GitHub ne reçoit qu'un bloc illisible. Sans ce mot de passe, personne ne peut les lire, vous non plus : notez-le en lieu sûr."
          : remote
            ? 'Des données d’élèves chiffrées existent sur un autre de vos appareils. Tapez le mot de passe choisi alors (une seule fois sur cet appareil).'
            : 'Tapez votre mot de passe pour ouvrir les données des élèves sur cet appareil.'}
      </p>
      <form
        className="stack"
        style={{ gap: 10 }}
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Field label="Mot de passe">
          <input className="input" type="password" autoComplete={creating ? 'new-password' : 'current-password'} value={pw} onChange={(e) => setPw(e.target.value)} />
        </Field>
        {creating && (
          <Field label="Encore une fois">
            <input className="input" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
          </Field>
        )}
        {error && <p className="error-text small">{error}</p>}
        <div>
          <Button type="submit" variant="primary" disabled={busy || !pw}>
            {creating ? 'Créer le coffre' : 'Ouvrir'}
          </Button>
        </div>
      </form>
    </Card>
  );
}
