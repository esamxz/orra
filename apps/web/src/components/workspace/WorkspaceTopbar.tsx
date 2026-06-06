import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Download,
  History,
  Undo,
  Redo,
  Moon,
  Sun,
} from 'lucide-react';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import ExportMenu from './ExportMenu';
import VersionHistoryPopover from './VersionHistoryPopover';
import UsageStatus from './UsageStatus';

export default function WorkspaceTopbar() {
  const navigate = useNavigate();
  const {
    project,
    darkMode,
    toggleDarkMode,
    showExportMenu,
    toggleExportMenu,
    showVersionHistory,
    toggleVersionHistory,
  } = useWorkspaceStore();

  return (
    <header className="workspace-topbar">
      <div className="workspace-topbar__left">
        <button className="orra-btn orra-btn--small orra-btn--ghost" onClick={() => navigate('/')}>
          <ArrowLeft size={16} />
        </button>
        <span className="workspace-topbar__project-name">
          {project?.name || 'Untitled project'}
        </span>
      </div>

      <div className="workspace-topbar__center">
        <button className="orra-btn orra-btn--small orra-btn--ghost" title="Undo">
          <Undo size={16} />
        </button>
        <button className="orra-btn orra-btn--small orra-btn--ghost" title="Redo">
          <Redo size={16} />
        </button>
        <button className="orra-btn orra-btn--small orra-btn--ghost" title="Version history" onClick={toggleVersionHistory}>
          <History size={16} />
        </button>
        {showVersionHistory && <VersionHistoryPopover />}
      </div>

      <div className="workspace-topbar__right">
        <UsageStatus />
        <button className="orra-btn orra-btn--small orra-btn--ghost" onClick={toggleDarkMode}>
          {darkMode ? <Sun size={16} /> : <Moon size={16} />}
        </button>
        <div style={{ position: 'relative' }}>
          <button className="orra-btn orra-btn--small orra-btn--secondary" onClick={toggleExportMenu}>
            <Download size={14} />
            Export
          </button>
          {showExportMenu && <ExportMenu />}
        </div>
      </div>
    </header>
  );
}
