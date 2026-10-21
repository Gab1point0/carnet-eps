import { useMemo } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ChevronLeft, Printer } from 'lucide-react';
import { useData } from '../store/data';
import { Button, Card, PageHeader, Section } from '../components/ui';
import { FICHES, FICHE_BY_ID, FICHE_GROUPS, fichesOfActivity, type FicheCtx, type FicheDef, type FicheSection } from '../lib/fiches';
import { criteriaOf } from '../lib/materials';
import { cls } from '../lib/util';

function Blank({ short }: { short?: boolean }) {
  return <span className={cls('blank', short && 'short')} />;
}

function Section_({ s }: { s: FicheSection }) {
  switch (s.type) {
    case 'fields':
      return (
        <div className="fiche-fields">
          {s.fields.map((f) => (
            <div key={f}>
              {f} : <Blank />
            </div>
          ))}
        </div>
      );
    case 'text':
      return <p className="fiche-obj">{s.text}</p>;
    case 'lines':
      return (
        <>
          {s.title && <p className="fiche-q">{s.title} :</p>}
          {Array.from({ length: s.n ?? 2 }, (_, i) => (
            <div key={i} className="fiche-line" />
          ))}
        </>
      );
    case 'checks':
      return (
        <>
          {s.title && <p className="fiche-q">{s.title} :</p>}
          <ul className="fiche-checks">
            {s.items.map((it) => (
              <li key={it}>☐ {it}</li>
            ))}
          </ul>
        </>
      );
    case 'levels': {
      const levels = s.levels ?? ['Débutant', 'En cours', 'Acquis', 'Avancé'];
      return (
        <table className="fiche-table">
          <thead>
            <tr>
              <th>{s.title ?? 'Critère'}</th>
              {levels.map((l) => (
                <th key={l}>{l}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {s.items.map((it) => (
              <tr key={it} className="tall">
                <td>
                  <span className="crit">{it}</span>
                </td>
                {levels.map((l) => (
                  <td key={l} className="box">
                    ☐
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );
    }
    case 'table': {
      const rows = typeof s.rows === 'number' ? Array.from({ length: s.rows }, () => '') : s.rows;
      return (
        <table className="fiche-table">
          <thead>
            <tr>
              <th>{s.head ?? s.title ?? ''}</th>
              {s.cols.map((c) => (
                <th key={c}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={`${r}-${i}`} className={s.tall ? 'tall' : undefined}>
                <td>
                  <span className="crit">{r}</span>
                </td>
                {s.cols.map((c, j) => (
                  <td key={c} className={s.cells ? 'box' : undefined}>
                    {s.cells?.[i]?.[j] ?? ''}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );
    }
  }
}

/** Une fiche, prête à imprimer. */
export function FicheView({ def, ctx, subtitle }: { def: FicheDef; ctx: FicheCtx; subtitle?: string }) {
  return (
    <article className={cls('sheet', 'fiche', def.size === 'half' && 'fiche-half')}>
      <header className="fiche-head">
        <div>
          {subtitle && <p className="sheet-kicker">{subtitle}</p>}
          <h1>{def.title}</h1>
        </div>
        <div className="fiche-id">
          {def.ident.map((f) => (
            <div key={f}>
              {f} : <Blank short={f === 'Date' || f === 'Classe'} />
            </div>
          ))}
        </div>
      </header>
      {def.build(ctx).map((s, i) => (
        <Section_ key={i} s={s} />
      ))}
    </article>
  );
}

/** Page d'impression d'une fiche : `/fiches/:id?cycle=…&copies=…`. */
export function FichePage() {
  const { id = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const data = useData((s) => s.data);
  const navigate = useNavigate();
  const def = FICHE_BY_ID.get(id);
  const cycle = data.cycles[params.get('cycle') ?? ''];
  const defaultCopies = def?.size === 'half' ? 2 : 1;
  const copies = Math.max(1, Math.min(60, Number(params.get('copies')) || defaultCopies));
  const ctx: FicheCtx = useMemo(() => ({ criteria: cycle ? criteriaOf(cycle.evaluation) : [] }), [cycle]);
  if (!def) return <Navigate to="/fiches" replace />;
  const klass = cycle?.classId ? data.classes[cycle.classId] : undefined;
  const subtitle = [klass?.name, cycle?.title].filter(Boolean).join(' · ');

  return (
    <div className="print-page">
      <div className="print-bar no-print fiches-bar">
        <Button variant="ghost" icon={<ChevronLeft size={18} />} onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/fiches'))}>
          Retour
        </Button>
        <label className="row" style={{ gap: 8 }}>
          Exemplaires
          <input
            className="input"
            type="number"
            min={1}
            max={60}
            value={copies}
            style={{ width: 80 }}
            onChange={(e) => setParams({ ...(cycle ? { cycle: cycle.id } : {}), copies: String(e.target.value) }, { replace: true })}
          />
        </label>
        <Button variant="primary" icon={<Printer size={18} />} onClick={() => window.print()}>
          Imprimer / enregistrer en PDF
        </Button>
      </div>
      <p className="muted small no-print" style={{ padding: '0 16px' }}>
        {def.hint}
        {def.who === 'élève' || def.who === 'observateur' ? ' Les noms sont à écrire à la main : aucun nom d\'élève n\'est enregistré.' : ''}
      </p>
      <div className={cls('fiche-copies', def.size === 'half' && 'fiche-copies-half')}>
        {Array.from({ length: copies }, (_, i) => (
          <FicheView key={i} def={def} ctx={ctx} subtitle={subtitle} />
        ))}
      </div>
    </div>
  );
}

/** Toutes les fiches, classées par activité : de quoi en retrouver une et l'imprimer tout de suite. */
export function FichesHubPage() {
  const [params] = useSearchParams();
  const data = useData((s) => s.data);
  const cycle = data.cycles[params.get('cycle') ?? ''];
  const mine = cycle ? fichesOfActivity(cycle.title) : null;
  const q = cycle ? `?cycle=${cycle.id}` : '';
  const groups = mine ? [...new Set(mine.map((f) => f.group))] : FICHE_GROUPS;
  const list = mine ?? FICHES;
  return (
    <>
      <PageHeader
        title="Fiches à imprimer"
        subtitle={cycle ? `Fiches de « ${cycle.title} » et fiches communes` : `${FICHES.length} fiches : observation, score, contrat, composition…`}
        back={
          cycle ? (
            <Link to={`/cycles/${cycle.id}`} className="back-link">
              <ChevronLeft size={16} /> {cycle.title}
            </Link>
          ) : undefined
        }
      />
      <p className="muted">Choisissez une fiche, réglez le nombre d'exemplaires, puis imprimez ou enregistrez en PDF. Les critères viennent de la fiche « Évaluation » du cycle quand vous ouvrez les fiches depuis un cycle.</p>
      {groups.map((g) => (
        <Section key={g} title={g}>
          <div className="grid grid-2">
            {list
              .filter((f) => f.group === g)
              .map((f) => (
                <Link key={f.id} to={`/fiches/${f.id}${q}`} className="card card-click">
                  <strong>🖨 {f.title}</strong>
                  <p className="muted small" style={{ margin: '4px 0 0' }}>
                    {f.hint}
                  </p>
                  <span className="chip">{f.who === 'enseignant' ? 'Pour l\'enseignant' : f.who === 'groupe' ? 'Pour un groupe' : f.who === 'observateur' ? 'Pour l\'observateur' : 'Pour l\'élève'}</span>
                </Link>
              ))}
          </div>
        </Section>
      ))}
      {!cycle && (
        <Card className="callout">
          Astuce : depuis un cycle (bouton « Fiches élèves »), les critères du cycle sont repris sur les fiches.
        </Card>
      )}
    </>
  );
}

/** Boutons d'impression des fiches d'un bloc. */
export function SheetLinks({ sheets, cycleId, className }: { sheets: string[]; cycleId?: string | null; className?: string }) {
  const defs = sheets.map((s) => FICHE_BY_ID.get(s)).filter((d): d is FicheDef => !!d);
  if (defs.length === 0) return null;
  const q = cycleId ? `?cycle=${cycleId}` : '';
  return (
    <div className={cls('sheet-links', className)}>
      <span className="muted small">Fiches à imprimer :</span>
      {defs.map((d) => (
        <Link key={d.id} to={`/fiches/${d.id}${q}`} className="chip chip-btn">
          🖨 {d.title}
        </Link>
      ))}
    </div>
  );
}
