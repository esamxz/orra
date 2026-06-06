import { FileImage, FileArchive } from 'lucide-react';
import { useWorkspaceStore } from '../../stores/workspaceStore';

export default function ExportMenu() {
  const { project, toggleExportMenu } = useWorkspaceStore();
  const isCarousel = project?.type === 'carousel';

  return (
    <div className="export-menu">
      <button
        className="dropdown__item"
        onClick={() => {
          toggleExportMenu();
          alert('PNG export mocked. No file generated.');
        }}
      >
        <FileImage size={14} />
        Export PNG
      </button>
      {isCarousel && (
        <button
          className="dropdown__item"
          onClick={() => {
            toggleExportMenu();
            alert('ZIP export mocked. No file generated.');
          }}
        >
          <FileArchive size={14} />
          Export ZIP
        </button>
      )}
    </div>
  );
}
