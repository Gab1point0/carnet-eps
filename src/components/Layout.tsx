import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ClipboardList, Cloud, CloudAlert, CloudCheck, CloudUpload, Home, CalendarDays, Library, Printer, Search, Settings, Users } from 'lucide-react';
import { useEffect } from 'react';
import { useCurrentYear, useYearLessons, useYears } from '../store/selectors';
import { currentLesson } from '../pages/Today';
import { todayISO } from '../lib/dates';
import { useUi } from '../store/ui';
import { isConfigured, useSync } from '../store/sync';
import { Select } from './ui';
import { cls } from '../lib/util';

// Ordinateur : tout dans la barre latérale. Téléphone : les 5 écrans du quotidien en bas, Réglages en haut.
const NAV = [
  { to: '/', label: 'Accueil', icon: Home, end: true, mobile: true },
  { to: '/planning', label: 'Planning', icon: CalendarDays, mobile: true },
  { to: '/preparation', label: 'Préparation', icon: ClipboardList, mobile: true },
  { to: '/fiches', label: 'Fiches', icon: Printer, mobile: false },
  { to: '/classes', label: 'Classes', icon: Users, mobile: true },
  { to: '/library', label: 'Bibliothèque', icon: Library, mobile: true },
  { to: '/settings', label: 'Réglages', icon: Settings, mobile: false },
];

function SyncButton() {
  const { config, status, error, syncNow } = useSync();
  const navigate = useNavigate();
  const configured = isConfigured(config);
  const Icon = !configured ? Cloud : status === 'syncing' ? CloudUpload : status === 'error' ? CloudAlert : CloudCheck;
  const label = !configured
    ? 'Synchronisation GitHub non configurée'
    : status === 'syncing'
      ? 'Synchronisation…'
      : status === 'error'
        ? `Erreur de synchronisation : ${error}`
        : 'Synchronisé — toucher pour relancer';
  return (
    <button
      type="button"
      className={cls('icon-btn', status === 'error' && 'sync-error', status === 'syncing' && 'sync-busy')}
      title={label}
      aria-label={label}
      onClick={() => (configured ? void syncNow() : navigate('/settings#sync'))}
    >
      <Icon size={21} color={status === 'error' ? 'var(--danger)' : configured && status !== 'syncing' ? 'var(--primary)' : undefined} />
    </button>
  );
}

export function Layout() {
  const years = useYears();
  const year = useCurrentYear();
  const setYear = useUi((s) => s.setYear);
  const location = useLocation();
  const navigate = useNavigate();

  // Au gymnase : sur téléphone, ouvrir l'application pendant un cours (ou dans les 15 min avant) mène à la vue du jour.
  const lessons = useYearLessons();
  useEffect(() => {
    if (location.pathname !== '/' || sessionStorage.getItem('carnet-eps:today-shown')) return;
    if (!window.matchMedia?.('(pointer: coarse)').matches) return;
    const d = new Date();
    if (currentLesson(lessons, todayISO(), d.getHours() * 60 + d.getMinutes())) {
      sessionStorage.setItem('carnet-eps:today-shown', '1');
      navigate('/aujourdhui');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessons.length]);

  // Retour en haut de page à chaque changement d'écran.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  return (
    <div className="app">
      <aside className="sidebar">
        <NavLink to="/" className="brand">
          <span className="brand-mark">🏐</span> Carnet EPS
        </NavLink>
        <nav aria-label="Navigation principale">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => cls('navlink', isActive && 'active')}>
              <Icon size={20} /> {label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <header className="topbar">
        <NavLink to="/" className="brand">
          <span className="brand-mark">🏐</span>
        </NavLink>
        {years.length > 0 && (
          <Select<string>
            className="year-select"
            value={year?.id ?? ''}
            onChange={(v) => v && setYear(v)}
            options={years.map((y) => ({ value: y.id, label: y.label }))}
          />
        )}
        <div className="spacer" />
        <button type="button" className="icon-btn" aria-label="Rechercher" onClick={() => navigate('/search')}>
          <Search size={21} />
        </button>
        <SyncButton />
        <button type="button" className="icon-btn mobile-only" aria-label="Réglages" onClick={() => navigate('/settings')}>
          <Settings size={21} />
        </button>
      </header>

      <main className="main">
        <div className="page">
          <Outlet />
        </div>
      </main>

      <nav className="bottom-nav" aria-label="Navigation principale">
        {NAV.filter((n) => n.mobile).map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => (isActive ? 'active' : '')}>
            <Icon size={22} />
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
