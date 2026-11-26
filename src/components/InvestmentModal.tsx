import { useState } from 'react';
import { Download, Minus, Plus, RotateCcw, Star } from 'lucide-react';
import type { Klass } from '../types';
import { useStudents, useVault } from '../store/vault';
import { confirmDialog, toast, toastUndo } from '../store/ui';
import { INVESTMENT_START } from '../lib/privateData';
import { Button, EmptyState, Modal } from './ui';
import { VaultGate } from './VaultGate';

// Note d'investissement : chaque élève part de 20 ; le professeur la fait monter ou descendre d'un point.
// Les notes vont dans le coffre chiffré (comme les élèves), jamais dans le carnet ni à Claude.

const MIN = 0;
const MAX = 20;

export function InvestmentButton({ klass }: { klass: Klass }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button icon={<Star size={16} />} onClick={() => setOpen(true)}>
        Note d'investissement
      </Button>
      {open && <InvestmentModal klass={klass} onClose={() => setOpen(false)} />}
    </>
  );
}

function InvestmentModal({ klass, onClose }: { klass: Klass; onClose: () => void }) {
  return (
    <Modal title={`Note d'investissement · ${klass.name}`} onClose={onClose}>
      <VaultGate>
        <InvestmentSheet klass={klass} />
      </VaultGate>
    </Modal>
  );
}

function InvestmentSheet({ klass }: { klass: Klass }) {
  const students = useStudents(klass.id);
  const rows = useVault((s) => s.doc.investment[klass.id]);
  const sorted = [...students].sort((a, b) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }));
  const noteOf = (id: string) => rows?.[id]?.v ?? INVESTMENT_START;
  const change = (id: string, delta: number) => {
    const v = Math.min(MAX, Math.max(MIN, noteOf(id) + delta));
    if (v !== noteOf(id)) useVault.getState().setInvestment(klass.id, { [id]: v });
  };

  if (!students.length)
    return (
      <EmptyState icon="👥" title="Aucun élève dans cette classe">
        Ajoutez d'abord les élèves dans la partie « Élèves » de la classe.
      </EmptyState>
    );

  // Aussi les élèves retirés de la liste depuis : la réinitialisation remet toute la classe à 20.
  const ids = [...new Set([...sorted.map((s) => s.id), ...Object.keys(rows ?? {})])];
  const changed = ids.filter((id) => noteOf(id) !== INVESTMENT_START).length;

  const reset = async () => {
    const ok = await confirmDialog({
      title: 'Réinitialiser les notes ?',
      message: `Toutes les notes de ${klass.name} reviennent à ${INVESTMENT_START}. Vous pourrez annuler juste après.`,
      confirmLabel: 'Réinitialiser',
      danger: true,
    });
    if (!ok) return;
    const before: Record<string, number> = Object.fromEntries(ids.map((id) => [id, noteOf(id)]).filter(([, v]) => v !== INVESTMENT_START));
    useVault.getState().setInvestment(klass.id, Object.fromEntries(ids.map((id) => [id, INVESTMENT_START])));
    // Annuler ne touche pas une note changée entre-temps (ici ou sur un autre appareil).
    toastUndo('Notes réinitialisées', () => {
      const now = useVault.getState().doc.investment[klass.id] ?? {};
      const back = Object.fromEntries(Object.entries(before).filter(([id]) => (now[id]?.v ?? INVESTMENT_START) === INVESTMENT_START));
      useVault.getState().setInvestment(klass.id, back);
    });
  };

  const exportXlsx = async () => {
    try {
      await writeXlsx();
    } catch {
      toast("L'export n'a pas pu se faire. Vérifiez la connexion, rechargez l'application et réessayez.", { tone: 'error', ms: 8000 });
    }
  };

  const writeXlsx = async () => {
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Note d'investissement");
    const date = new Date().toLocaleDateString('fr-FR');
    ws.addRow([`Note d'investissement · ${klass.name} · ${date}`]).font = { bold: true, size: 13 };
    ws.addRow([]);
    const head = ws.addRow(['Élève', 'Note /20']);
    head.font = { bold: true };
    for (const s of sorted) ws.addRow([s.name, noteOf(s.id)]);
    ws.getColumn(1).width = 32;
    ws.getColumn(2).width = 12;
    ws.getColumn(2).alignment = { horizontal: 'center' };
    const blob = new Blob([await wb.xlsx.writeBuffer()], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `Note d'investissement - ${klass.name} - ${date}.xlsx`.replace(/[\\/:*?"<>|]/g, '-');
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
    toast('Notes exportées (fichier Excel)', { tone: 'success' });
  };

  return (
    <div className="stack" style={{ gap: 12 }}>
      <p className="muted small">
        Chaque élève part de {INVESTMENT_START}/20. Appuyez sur − ou + pour enlever ou rendre un point. Les notes sont gardées (chiffrées) et
        passent à vos autres appareils.
      </p>
      <div className="invest-list">
        {sorted.map((s) => {
          const v = noteOf(s.id);
          return (
            <div key={s.id} className="invest-row">
              <span className="invest-name">{s.name}</span>
              <button type="button" className="invest-btn" aria-label={`Enlever un point à ${s.name}`} disabled={v <= MIN} onClick={() => change(s.id, -1)}>
                <Minus size={20} />
              </button>
              <strong className={`invest-note${v < INVESTMENT_START ? ' is-down' : ''}`}>{v}</strong>
              <button type="button" className="invest-btn" aria-label={`Ajouter un point à ${s.name}`} disabled={v >= MAX} onClick={() => change(s.id, 1)}>
                <Plus size={20} />
              </button>
            </div>
          );
        })}
      </div>
      <div className="invest-foot">
        <Button variant="danger" icon={<RotateCcw size={16} />} onClick={reset} disabled={changed === 0}>
          Réinitialiser
        </Button>
        <Button variant="primary" icon={<Download size={16} />} onClick={exportXlsx}>
          Exporter les notes
        </Button>
      </div>
    </div>
  );
}
