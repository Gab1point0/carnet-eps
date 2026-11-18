import { useState } from 'react';
import { ClipboardPaste, Lock, Plus, X } from 'lucide-react';
import type { Klass } from '../types';
import { useStudents, useVault } from '../store/vault';
import { confirmDialog, toastUndo } from '../store/ui';
import { parseRoster } from '../lib/privateData';
import { uid } from '../lib/util';
import { Button, Card, IconButton, Modal, Section, TextArea } from './ui';
import { VaultConflict, VaultGate } from './VaultGate';
import { VaultHistoryButton } from './VaultHistory';

/** Élèves de la classe (chiffrés) : pour remplir les fiches d'évaluation dans l'application. */
export function StudentsSection({ klass }: { klass: Klass }) {
  const students = useStudents(klass.id);
  const status = useVault((s) => s.status);
  const [open, setOpen] = useState(false);
  const [pasting, setPasting] = useState(false);
  const [text, setText] = useState('');
  const set = (list: typeof students) => useVault.getState().setStudents(klass.id, list);
  // Garçon / fille : cocher une case, la recocher l'enlève (pour les barèmes différenciés).
  const setSex = (id: string, sex: 'F' | 'G') =>
    set(students.map((x) => (x.id !== id ? x : x.sex === sex ? { id: x.id, name: x.name } : { ...x, sex })));
  const girls = students.filter((s) => s.sex === 'F').length;
  const boys = students.filter((s) => s.sex === 'G').length;

  return (
    <Section
      title={
        <span className="row" style={{ gap: 8 }}>
          <Lock size={16} /> Élèves{status === 'open' ? ` (${students.length})` : ''}
        </span>
      }
      actions={
        status === 'open' && (
          <Button size="sm" variant="ghost" onClick={() => setOpen(!open)}>
            {open ? 'Replier' : students.length ? 'Voir la liste' : 'Ajouter les élèves'}
          </Button>
        )
      }
    >
      <VaultGate>
        {!open ? (
          <p className="muted small">
            {students.length
              ? `${students.length} élèves, chiffrés sur vos appareils. Ils servent aux fiches d'évaluation à remplir dans l'application.`
              : "Ajoutez les élèves pour remplir les fiches d'évaluation dans l'application. Prénom et initiale du nom suffisent."}
          </p>
        ) : (
          <Card className="stack" style={{ gap: 8 }}>
            {students.length > 0 && (
              <p className="muted small">
                Cochez garçon ou fille pour les barèmes différenciés : {girls} fille{girls > 1 ? 's' : ''}, {boys} garçon{boys > 1 ? 's' : ''}
                {students.length - girls - boys ? `, ${students.length - girls - boys} à renseigner` : ''}.
              </p>
            )}
            {students.map((s, i) => (
              <div key={s.id} className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
                <span className="muted small" style={{ width: 22, textAlign: 'right' }}>
                  {i + 1}
                </span>
                <input className="input" value={s.name} aria-label={`Élève ${i + 1}`} onChange={(e) => set(students.map((x) => (x.id === s.id ? { ...x, name: e.target.value } : x)))} />
                <label className="sex-check" title="Garçon">
                  <input type="checkbox" checked={s.sex === 'G'} onChange={() => setSex(s.id, 'G')} aria-label={`${s.name || 'Élève'} : garçon`} />
                  <span>G</span>
                </label>
                <label className="sex-check" title="Fille">
                  <input type="checkbox" checked={s.sex === 'F'} onChange={() => setSex(s.id, 'F')} aria-label={`${s.name || 'Élève'} : fille`} />
                  <span>F</span>
                </label>
                <IconButton
                  label={`Retirer ${s.name}`}
                  onClick={() => {
                    const before = students;
                    set(students.filter((x) => x.id !== s.id));
                    toastUndo(`${s.name || 'Élève'} retiré`, () => set(before));
                  }}
                >
                  <X size={16} />
                </IconButton>
              </div>
            ))}
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              <Button size="sm" icon={<Plus size={15} />} onClick={() => set([...students, { id: uid(), name: '' }])}>
                Ajouter un élève
              </Button>
              <Button size="sm" icon={<ClipboardPaste size={15} />} onClick={() => setPasting(true)}>
                Coller une liste
              </Button>
            </div>
          </Card>
        )}
      </VaultGate>
      {pasting && (
        <Modal
          title={`Élèves de ${klass.name}`}
          onClose={() => setPasting(false)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setPasting(false)}>
                Annuler
              </Button>
              <Button
                variant="primary"
                disabled={!text.trim()}
                onClick={() => {
                  set(parseRoster([...students.map((s) => s.name), text].join('\n'), students, uid));
                  setText('');
                  setPasting(false);
                  setOpen(true);
                }}
              >
                Ajouter
              </Button>
            </>
          }
        >
          <p className="muted small">Un élève par ligne, copié par exemple depuis École Directe. Les doublons sont ignorés.</p>
          <TextArea value={text} onChange={setText} minRows={8} placeholder={'Léa D.\nTom M.\n…'} />
        </Modal>
      )}
    </Section>
  );
}

/** Réglages, onglet Sauvegarde : état du coffre, verrouillage de l'appareil, effacement de fin d'année. */
export function VaultSettings() {
  const status = useVault((s) => s.status);
  const doc = useVault((s) => s.doc);
  const conflict = useVault((s) => s.conflict);
  const count = Object.values(doc.rosters).reduce((n, r) => n + r.students.length, 0);
  const filled = Object.values(doc.sheets).filter((rows) => Object.values(rows).some((r) => Object.keys(r.v).length)).length;
  return (
    <Section title="Données des élèves (chiffrées)">
      <Card className="stack" style={{ gap: 10 }}>
        <p className="muted small">
          Noms et résultats des élèves : chiffrés sur vos appareils avec votre mot de passe, jamais envoyés à Claude, et synchronisés seulement sous forme chiffrée. Le responsable de ces données est votre établissement : gardez le strict nécessaire (prénom et initiale) et effacez-les en fin d'année.
        </p>
        {status === 'open' ? (
          <>
            {conflict && <VaultConflict />}
            <p className="small">
              <strong>{count}</strong> élèves · <strong>{filled}</strong> fiches remplies
            </p>
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              <Button size="sm" icon={<Lock size={15} />} onClick={() => void useVault.getState().lock()}>
                Verrouiller cet appareil
              </Button>
              <VaultHistoryButton />
              <Button
                size="sm"
                variant="danger"
                onClick={async () => {
                  const ok = await confirmDialog({
                    title: 'Effacer tous les élèves et leurs résultats ?',
                    message: 'Sur cet appareil et sur les appareils synchronisés. Exportez les fiches en Excel avant si vous voulez les garder.',
                    confirmLabel: 'Tout effacer',
                    danger: true,
                  });
                  if (ok) useVault.getState().wipe();
                }}
              >
                Effacer les élèves de l'année
              </Button>
            </div>
          </>
        ) : (
          <VaultGate>{null}</VaultGate>
        )}
      </Card>
    </Section>
  );
}
