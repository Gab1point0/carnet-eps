import { useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, Printer } from 'lucide-react';
import { useData } from '../store/data';
import { activityOf, cycleLessons } from '../store/selectors';
import { Button } from '../components/ui';
import { criteriaOf } from '../lib/materials';
import { formatDM } from '../lib/dates';

type FicheId = 'contrat' | 'observation' | 'grille' | 'carnet';

const FICHES: Array<{ id: FicheId; label: string; hint: string }> = [
  { id: 'contrat', label: 'Contrat / projet', hint: 'L’élève annonce son objectif puis compare avec sa réalisation.' },
  { id: 'observation', label: 'Observation d’un partenaire', hint: 'Un élève observe et note un camarade sur les critères du cycle.' },
  { id: 'grille', label: 'Grille d’évaluation', hint: 'Critères du cycle × 4 degrés de maîtrise, à remplir par l’enseignant.' },
  { id: 'carnet', label: 'Carnet de suivi du cycle', hint: 'Une ligne par séance : ce que j’ai fait, mon ressenti, ma progression.' },
];

const DEGREES = ['Objectifs non atteints', 'Partiellement atteints', 'Atteints', 'Dépassés'];

/** Fiches élèves imprimables, générées à partir des critères et des séances d'un cycle. Aucun nom d'élève n'est stocké : les champs se remplissent à la main. */
export function FichesPage() {
  const { id = '' } = useParams();
  const cycle = useData((s) => s.data.cycles[id]);
  const data = useData((s) => s.data);
  const navigate = useNavigate();
  const [selected, setSelected] = useState<Set<FicheId>>(new Set(['contrat', 'observation', 'grille']));

  if (!cycle) return <Navigate to="/classes" replace />;

  const klass = cycle.classId ? data.classes[cycle.classId] : undefined;
  const act = activityOf(data, cycle.activityId);
  const criteria = criteriaOf(cycle.evaluation);
  const crit = criteria.length ? criteria : ['Réalisation motrice', 'Choix et projet', 'Sécurité et rôle social'];
  const lessons = cycleLessons(data, cycle.id).filter((l) => l.status !== 'cancelled');
  const objective = cycle.objectives.split('\n')[0];

  const toggle = (f: FicheId) =>
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(f)) next.delete(f);
      else next.add(f);
      return next;
    });

  const Header = ({ title }: { title: string }) => (
    <header className="fiche-head">
      <div>
        <p className="sheet-kicker">
          {[klass?.name, act ? `${act.emoji} ${act.name}` : null].filter(Boolean).join(' · ')}
        </p>
        <h1>{title}</h1>
        <p className="fiche-cycle">{cycle.title}</p>
      </div>
      <div className="fiche-id">
        <div>Nom : <span className="blank" /></div>
        <div>Prénom : <span className="blank" /></div>
        <div>Classe : {klass?.name ?? <span className="blank" />} &nbsp; Date : <span className="blank short" /></div>
      </div>
    </header>
  );

  return (
    <div className="print-page">
      <div className="print-bar no-print fiches-bar">
        <Button variant="ghost" icon={<ChevronLeft size={18} />} onClick={() => navigate(`/cycles/${cycle.id}`)}>
          Retour
        </Button>
        <Button variant="primary" icon={<Printer size={18} />} onClick={() => window.print()} disabled={selected.size === 0}>
          Imprimer / enregistrer en PDF
        </Button>
      </div>
      <div className="fiches-choose no-print">
        {FICHES.map((f) => (
          <label key={f.id} className="card fiche-choice">
            <input type="checkbox" checked={selected.has(f.id)} onChange={() => toggle(f.id)} />
            <span>
              <strong>{f.label}</strong>
              <span className="muted small"> — {f.hint}</span>
            </span>
          </label>
        ))}
        <p className="muted small">Les critères viennent de la fiche « Évaluation » du cycle : modifiez-les dans le cycle pour adapter les fiches.</p>
      </div>

      {selected.has('contrat') && (
        <article className="sheet fiche">
          <Header title="Mon contrat" />
          <p className="fiche-obj">
            <strong>Objectif du cycle :</strong> {objective || '…'}
          </p>
          <table className="fiche-table">
            <thead>
              <tr>
                <th>Mon objectif (ce que je m'engage à réaliser)</th>
                <th>Ce que j'ai réalisé</th>
                <th>Écart / validé ?</th>
              </tr>
            </thead>
            <tbody>
              {crit.slice(0, 4).map((c) => (
                <tr key={c} className="tall">
                  <td>
                    <span className="crit">{c}</span>
                  </td>
                  <td />
                  <td />
                </tr>
              ))}
            </tbody>
          </table>
          <p className="fiche-q">Ce qui m'a aidé à réussir :</p>
          <div className="fiche-lines" />
          <p className="fiche-q">Ce que je dois améliorer :</p>
          <div className="fiche-lines" />
        </article>
      )}

      {selected.has('observation') && (
        <article className="sheet fiche">
          <Header title="J'observe mon partenaire" />
          <p className="fiche-obj">Observateur : <span className="blank" /> &nbsp;&nbsp; Je note ce que je vois, sans juger la personne.</p>
          <table className="fiche-table">
            <thead>
              <tr>
                <th>Ce que j'observe</th>
                <th>Acquis</th>
                <th>En cours</th>
                <th>À corriger</th>
                <th>Remarques / conseil</th>
              </tr>
            </thead>
            <tbody>
              {crit.map((c) => (
                <tr key={c} className="tall">
                  <td>
                    <span className="crit">{c}</span>
                  </td>
                  <td className="box">☐</td>
                  <td className="box">☐</td>
                  <td className="box">☐</td>
                  <td />
                </tr>
              ))}
            </tbody>
          </table>
          <p className="fiche-q">Un conseil pour mon partenaire :</p>
          <div className="fiche-lines" />
        </article>
      )}

      {selected.has('grille') && (
        <article className="sheet fiche">
          <Header title="Grille d'évaluation" />
          <table className="fiche-table">
            <thead>
              <tr>
                <th>Critère</th>
                {DEGREES.map((d) => (
                  <th key={d}>{d}</th>
                ))}
                <th>Points</th>
              </tr>
            </thead>
            <tbody>
              {crit.map((c) => (
                <tr key={c} className="tall">
                  <td>
                    <span className="crit">{c}</span>
                  </td>
                  {DEGREES.map((d) => (
                    <td key={d} className="box">☐</td>
                  ))}
                  <td className="pts">/ …</td>
                </tr>
              ))}
              <tr>
                <td colSpan={DEGREES.length + 1} className="total">
                  Total
                </td>
                <td className="pts">/ 20</td>
              </tr>
            </tbody>
          </table>
          <p className="fiche-q">Commentaire de l'enseignant :</p>
          <div className="fiche-lines" />
        </article>
      )}

      {selected.has('carnet') && (
        <article className="sheet fiche">
          <Header title="Mon carnet de suivi" />
          <table className="fiche-table">
            <thead>
              <tr>
                <th>Séance</th>
                <th>Ce que j'ai travaillé / appris</th>
                <th>Mon ressenti</th>
                <th>Ma progression</th>
              </tr>
            </thead>
            <tbody>
              {lessons.map((l, i) => (
                <tr key={l.id} className="tall">
                  <td>
                    <strong>{i + 1}.</strong> {l.date ? formatDM(l.date) : ''}
                    <br />
                    <span className="muted small">{l.title.replace(/^Séance \d+ — /, '')}</span>
                  </td>
                  <td />
                  <td className="box">😕 🙂 😀</td>
                  <td />
                </tr>
              ))}
            </tbody>
          </table>
        </article>
      )}
    </div>
  );
}
