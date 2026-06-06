import { useWorkspaceStore } from '../../stores/workspaceStore';
import { RotateCcw } from 'lucide-react';

export default function VersionHistoryPopover() {
  const { versions, toggleVersionHistory, restoreVersion } = useWorkspaceStore();

  return (
    <div className="orra-popover" style={{ right: '1rem', top: '3rem', width: '320px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
        <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Version history</span>
        <button className="orra-btn orra-btn--small orra-btn--ghost" onClick={toggleVersionHistory}>Close</button>
      </div>

      {versions.length === 0 && (
        <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No versions yet.</div>
      )}

      {versions.map((v) => (
        <div key={v.id} className="version-history__item">
          <div>
            <span className="version-history__badge">{v.reason}</span>
            <div className="version-history__meta">
              Version {v.version} · {v.createdBy === 'ai' ? 'AI' : 'You'}
            </div>
          </div>
          <button
            className="orra-btn orra-btn--small orra-btn--ghost"
            title="Restore"
            onClick={() => restoreVersion(v.id)}
          >
            <RotateCcw size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
