import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { UiHosts } from './components/ui';
import { useData } from './store/data';
import { DashboardPage } from './pages/Dashboard';
import { PlanningPage } from './pages/Planning';
import { ClassesPage } from './pages/Classes';
import { ClassDetailPage } from './pages/ClassDetail';
import { CycleDetailPage } from './pages/CycleDetail';
import { LessonPage } from './pages/Lesson';
import { LessonRunPage } from './pages/LessonRun';
import { LessonPrintPage } from './pages/LessonPrint';
import { LibraryPage } from './pages/Library';
import { ExerciseEditorPage } from './pages/ExerciseEditor';
import { SearchPage } from './pages/Search';
import { SettingsPage } from './pages/Settings';
import { PreparationPage } from './pages/Preparation';
import { FichesPage } from './pages/Fiches';
import { FichePage, FichesHubPage } from './pages/Fiche';

export function App() {
  const loaded = useData((s) => s.loaded);
  if (!loaded) return <div className="splash">Chargement…</div>;

  return (
    <>
      <Routes>
        {/* Écrans plein écran, sans barre de navigation */}
        <Route path="/lessons/:id/run" element={<LessonRunPage />} />
        <Route path="/lessons/:id/print" element={<LessonPrintPage />} />
        <Route path="/cycles/:id/fiches" element={<FichesPage />} />
        <Route path="/fiches/:id" element={<FichePage />} />

        <Route element={<Layout />}>
          <Route index element={<DashboardPage />} />
          <Route path="planning" element={<PlanningPage />} />
          <Route path="preparation" element={<PreparationPage />} />
          <Route path="fiches" element={<FichesHubPage />} />
          <Route path="classes" element={<ClassesPage />} />
          <Route path="classes/:id" element={<ClassDetailPage />} />
          <Route path="cycles/:id" element={<CycleDetailPage />} />
          <Route path="lessons/:id" element={<LessonPage />} />
          <Route path="library" element={<LibraryPage />} />
          <Route path="exercises/:id" element={<ExerciseEditorPage />} />
          <Route path="search" element={<SearchPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
      <UiHosts />
    </>
  );
}
