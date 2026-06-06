import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MoreVertical, FolderOpen, Pencil, Copy, Trash2 } from 'lucide-react';
import { type MockProject } from '../../data/mockData';
import { useDashboardStore } from '../../stores/dashboardStore';
import DeleteConfirmationModal from '../ui/DeleteConfirmationModal';

interface Props {
  project: MockProject;
}

export default function ProjectCard({ project }: Props) {
  const navigate = useNavigate();
  const { removeProject, duplicateProject, renameProject } = useDashboardStore();
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(project.name);

  const handleOpen = () => {
    navigate(`/workspace/${project.id}`);
  };

  const handleRename = () => {
    if (renameValue.trim()) {
      renameProject(project.id, renameValue.trim());
    }
    setIsRenaming(false);
  };

  return (
    <div className="orra-card project-card">
      <div
        className="project-card__thumb"
        style={{ background: project.thumbnailColor }}
        onClick={handleOpen}
      >
        <div className="project-card__thumb-overlay">
          <button className="orra-btn orra-btn--small orra-btn--primary">Open</button>
        </div>
      </div>

      <div className="project-card__info">
        {isRenaming ? (
          <input
            className="orra-input"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={handleRename}
            onKeyDown={(e) => { if (e.key === 'Enter') handleRename(); }}
            autoFocus
          />
        ) : (
          <div className="project-card__name" onClick={handleOpen}>{project.name}</div>
        )}
        <div className="project-card__meta">
          {project.type === 'carousel' ? `${project.cardCount} cards` : 'Post'} · {project.ratio.name}
        </div>
      </div>

      <div className="project-card__actions">
        <div className="dropdown">
          <button
            className="orra-btn orra-btn--small orra-btn--ghost"
            onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v); }}
          >
            <MoreVertical size={14} />
          </button>
          {menuOpen && (
            <div className="dropdown__menu">
              <button className="dropdown__item" onClick={() => { setMenuOpen(false); handleOpen(); }}>
                <FolderOpen size={14} /> Open
              </button>
              <button className="dropdown__item" onClick={() => { setMenuOpen(false); setIsRenaming(true); }}>
                <Pencil size={14} /> Rename
              </button>
              <button className="dropdown__item" onClick={() => { setMenuOpen(false); duplicateProject(project.id); }}>
                <Copy size={14} /> Duplicate
              </button>
              <button className="dropdown__item dropdown__item--danger" onClick={() => { setMenuOpen(false); setConfirmDelete(true); }}>
                <Trash2 size={14} /> Delete
              </button>
            </div>
          )}
        </div>
      </div>

      <DeleteConfirmationModal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => { setConfirmDelete(false); removeProject(project.id); }}
        itemName={project.name}
        itemType="project"
      />
    </div>
  );
}
