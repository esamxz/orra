import { useState, useRef, useEffect } from 'react';
import type { ProjectContextMemoryDto } from '../../api/types.js';
import { Icon } from '../../data/icons.js';

interface Props {
  memory: ProjectContextMemoryDto | null;
  loading: boolean;
  error: string | null;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return iso;
  }
}

export default function ProjectMemoryPanel({ memory, loading, error }: Props) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <button
        className="btn-ghost btn-sm"
        onClick={() => setOpen((v) => !v)}
        title="Project memory"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          fontSize: 12.5,
          fontWeight: 500,
          padding: '4px 9px',
          borderRadius: 6,
          color: 'var(--muted)',
          border: '1px solid var(--border)',
          background: 'none',
          cursor: 'pointer',
          height: 30,
          whiteSpace: 'nowrap',
        }}
      >
        <Icon.spark s={13} />
        Project memory
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            right: 0,
            width: 280,
            background: 'var(--panel)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
            zIndex: 200,
            padding: '14px 16px',
          }}
        >
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10, color: 'var(--text)' }}>
            Project memory
          </div>

          {loading && (
            <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: 0 }}>
              Loading project memory…
            </p>
          )}

          {!loading && error && (
            <p style={{ fontSize: 12.5, color: 'var(--danger, #c44)', margin: 0 }}>
              Could not load project memory.
            </p>
          )}

          {!loading && !error && memory === null && (
            <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: 0, lineHeight: 1.55 }}>
              No project memory yet. It will build as you chat.
            </p>
          )}

          {!loading && !error && memory !== null && (
            <MemoryFields memory={memory} />
          )}
        </div>
      )}
    </div>
  );
}

function MemoryFields({ memory }: { memory: ProjectContextMemoryDto }) {
  const rows: [string, string][] = [];

  if (memory.topic) rows.push(['Topic', memory.topic]);
  if (memory.audience) rows.push(['Audience', memory.audience]);
  if (memory.platform) rows.push(['Platform', memory.platform]);
  if (memory.tone) rows.push(['Tone', memory.tone]);
  if (memory.slideCount != null) rows.push(['Slides', String(memory.slideCount)]);
  if (memory.visualDirection) rows.push(['Visual direction', memory.visualDirection]);
  if (memory.approvedDirection) rows.push(['Approved', memory.approvedDirection]);

  const avoidItems = [
    ...(memory.constraints ?? []),
    ...(memory.rejectedIdeas ?? []),
  ].filter(Boolean).slice(0, 5);

  if (avoidItems.length > 0) {
    rows.push(['Avoid', avoidItems.join(', ')]);
  }

  return (
    <div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <tbody>
          {rows.map(([label, value]) => (
            <tr key={label}>
              <td
                style={{
                  color: 'var(--muted)',
                  paddingBottom: 5,
                  paddingRight: 10,
                  verticalAlign: 'top',
                  whiteSpace: 'nowrap',
                  fontWeight: 500,
                }}
              >
                {label}
              </td>
              <td
                style={{
                  color: 'var(--text)',
                  paddingBottom: 5,
                  verticalAlign: 'top',
                  lineHeight: 1.45,
                }}
              >
                {value}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div
        style={{
          marginTop: 8,
          paddingTop: 8,
          borderTop: '1px solid var(--border)',
          fontSize: 11,
          color: 'var(--muted)',
        }}
      >
        Updated {formatDate(memory.updatedAt)}
      </div>
    </div>
  );
}
