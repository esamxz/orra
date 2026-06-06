import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { useDashboardStore } from '../stores/dashboardStore';
import WorkspaceTopbar from '../components/workspace/WorkspaceTopbar';
import DirectorPanel from '../components/workspace/DirectorPanel';
import ArtifactStage from '../components/workspace/ArtifactStage';
import CarouselRail from '../components/workspace/CarouselRail';
import InspectorPanel from '../components/workspace/InspectorPanel';
import '../styles/workspace.css';

export default function WorkspacePage() {
  const { projectId } = useParams();
  const { project, initWorkspace, darkMode } = useWorkspaceStore();
  const { projects } = useDashboardStore();

  useEffect(() => {
    const found = projects.find((p) => p.id === projectId);
    if (found) {
      initWorkspace({
        id: found.id,
        name: found.name,
        type: found.type,
        ratio: found.ratio,
      });
    } else if (!project) {
      // Default workspace when no project matched
      initWorkspace({
        id: 'new',
        name: 'New project',
        type: 'carousel',
        ratio: { name: '4:5', w: 1080, h: 1350 },
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  return (
    <div className="workspace">
      <WorkspaceTopbar />
      <div className="workspace__body">
        <DirectorPanel />
        <div className="stage-area">
          <ArtifactStage />
          <CarouselRail />
        </div>
        <InspectorPanel />
      </div>
    </div>
  );
}
