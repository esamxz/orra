import { Routes, Route } from 'react-router-dom';
import AuthenticatedLayout from './components/auth/AuthenticatedLayout.js';
import DashboardPage from './pages/DashboardPage';
import WorkspacePage from './pages/WorkspacePage';
import TrendTemplatesPage from './pages/TrendTemplatesPage';

export default function App() {
  return (
    <div className="app">
      <Routes>
        <Route element={<AuthenticatedLayout />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/templates" element={<TrendTemplatesPage />} />
          <Route path="/workspace" element={<WorkspacePage />} />
          <Route path="/workspace/:projectId" element={<WorkspacePage />} />
        </Route>
      </Routes>
    </div>
  );
}
