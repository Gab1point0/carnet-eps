import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ClipboardList, Cloud, CloudAlert, CloudCheck, CloudUpload, Home, CalendarDays, Library, Search, Settings, Users } from 'lucide-react';
import { useEffect } from 'react';
import { useCurrentYear, useYears } from '../store/selectors';
import { useUi } from '../store/ui';
import { isConfigured, useSync } from '../store/sync';
import { Select } from './ui';
import { cls } from '../lib/util';

const NAV = [
  { to: '/', label: 'Accueil', icon: Home, end: true },
  { to: '/planning', label: 'Planning', icon: CalendarDays },
  { to: '/classes', label: 'Classes', icon: Users },
  { to: '/library', label: 'Bibliothèque', icon: Library },
  { to: '/settings', label: 'Réglages', icon: Settings },
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
          {[...NAV.slice(0, 2), { to: '/preparation', label: 'Préparation', icon: ClipboardList, end: false }, ...NAV.slice(2)].map(({ to, label, icon: Icon, end }) => (
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
      </header>

      <main className="main">
        <div className="page">
          <Outlet />
        </div>
      </main>

      <nav className="bottom-nav" aria-label="Navigation principale">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => (isActive ? 'active' : '')}>
            <Icon size={22} />
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
