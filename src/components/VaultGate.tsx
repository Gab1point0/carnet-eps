import { useEffect, useState, type ReactNode } from 'react';
import { CloudDownload, Loader, Lock, ShieldCheck } from 'lucide-react';
import { useVault } from '../store/vault';
import { isConfigured, useSync } from '../store/sync';
import { Button, Card, Field } from './ui';

/**
 * Affiche son contenu seulement quand le coffre des élèves est ouvert sur cet appareil ;
 * sinon, propose de le créer (premier appareil) ou de l'ouvrir avec le mot de passe.
 */
export function VaultGate({ children }: { children: ReactNode }) {
  const status = useVault((s) => s.status);
  const remote = useVault((s) => s.remote);
  const checked = useVault((s) => s.checked);
  const conflict = useVault((s) => s.conflict);
  const syncing = useSync((s) => s.status === 'syncing');
  const syncError = useSync((s) => s.error);
  const configured = useSync((s) => isConfigured(s.config));
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [forceNew, setForceNew] = useState(false);
  // Nouvel appareil : on cherche d'abord les données en ligne, pour ne pas créer un second coffre vide.
  const waiting = status === 'none' && configured && !checked && !forceNew;
  useEffect(() => {
    if (waiting && !syncing) void useSync.getState().syncNow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waiting]);

  if (status === 'open') return conflict ? <><VaultConflict />{children}</> : <>{children}</>;
  if (status === 'loading') return null;

  if (waiting) {
    return (
      <Card className="stack vault-gate">
        <div className="row" style={{ gap: 10 }}>
          {syncError ? <CloudDownload size={22} /> : <Loader size={22} className="spin" />}
          <strong>Recherche de vos données d'élèves en ligne…</strong>
        </div>
        {syncError ? (
          <>
            <p className="error-text small">Impossible de joindre la sauvegarde en ligne : {syncError}</p>
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              <Button size="sm" variant="primary" onClick={() => void useSync.getState().syncNow()}>
                Réessayer
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setForceNew(true)}>
                C'est mon premier appareil : créer le coffre
              </Button>
            </div>
          </>
        ) : (
          <p className="muted small">Un instant : si vous avez déjà des élèves sur un autre appareil, ils vont arriver ici.</p>
        )}
      </Card>
    );
  }

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

/** Deux coffres (créés chacun sur un appareil) : on les réunit avec le mot de passe de celui en ligne. */
export function VaultConflict() {
  const [pw, setPw] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      if (await useVault.getState().joinRemote(pw)) void useSync.getState().syncNow();
      else setError('Mot de passe incorrect.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card className="stack vault-gate">
      <div className="row" style={{ gap: 10 }}>
        <CloudDownload size={22} />
        <strong>Réunir les données des élèves de vos appareils</strong>
      </div>
      <p className="muted small">
        Un autre appareil a ses propres données d'élèves, protégées par un autre mot de passe : elles ne se synchronisent pas avec celles-ci. Tapez le mot de passe de l'autre appareil (celui de l'ordinateur, par exemple) : les deux seront réunies, sans rien perdre, et ce mot de passe servira partout.
      </p>
      <form
        className="stack"
        style={{ gap: 10 }}
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Field label="Mot de passe de l'autre appareil">
          <input className="input" type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} />
        </Field>
        {error && <p className="error-text small">{error}</p>}
        <div>
          <Button type="submit" variant="primary" disabled={busy || !pw}>
            Réunir
          </Button>
        </div>
      </form>
    </Card>
  );
}
