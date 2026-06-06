import { Routes, Route } from 'react-router-dom';
import DashboardPage from './pages/DashboardPage';
import WorkspacePage from './pages/WorkspacePage';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<DashboardPage />} />
      <Route path="/workspace/:projectId" element={<WorkspacePage />} />
      <Route path="/workspace" element={<WorkspacePage />} />
    </Routes>
  );
}
