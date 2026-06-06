import { Routes, Route } from 'react-router-dom';
import DashboardPage from './pages/DashboardPage';
import WorkspacePage from './pages/WorkspacePage';

export default function App() {
  return (
    <div className="app">
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/workspace" element={<WorkspacePage />} />
        <Route path="/workspace/:projectId" element={<WorkspacePage />} />
      </Routes>
    </div>
  );
}
