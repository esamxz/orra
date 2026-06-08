import { useState } from 'react';
import { useDashboardStore } from '../../stores/dashboardStore';
import type { DashboardState } from '../../stores/dashboardStore';

interface Props {
  compact?: boolean;
  className?: string;
}

export default function UsageStatus({ compact = false, className = '' }: Props) {
  const [open, setOpen] = useState(false);
  const usage = useDashboardStore((s: DashboardState) => s.usage);

  const remaining = usage.monthlyTotal - usage.monthlyUsed;
  const pct = Math.max(0, Math.min(100, (usage.monthlyUsed / usage.monthlyTotal) * 100));

  if (compact) {
    return (
      <div style={{ position: 'relative' }} className={className}>
        <button
          className="top-sel"
          style={{ gap: 8, padding: '0 11px', height: 34, fontSize: 12.5 }}
          onClick={() => setOpen((v) => !v)}
          title="Usage status"
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span
              style={{
                width: 18,
                height: 18,
                borderRadius: '50%',
                background: `conic-gradient(var(--primary) ${pct * 3.6}deg, var(--inset) 0deg)`,
                display: 'inline-block',
                flex: 'none',
              }}
            />
            <span style={{ fontWeight: 600, color: 'var(--ink)' }}>
              {usage.monthlyUsed} / {usage.monthlyTotal}
            </span>
          </span>
          <span style={{ color: 'var(--muted)', fontWeight: 500 }}>credits</span>
        </button>

        {open && (
          <>
            <div className="backdrop" onClick={() => setOpen(false)} />
            <UsagePopover onClose={() => setOpen(false)} />
          </>
        )}
      </div>
    );
  }

  return (
    <div className={`create-panel ${className}`} style={{ padding: 16, marginTop: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <span className="eyebrow">Usage</span>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--primary)' }}>{usage.plan}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <span
          style={{
            width: 28,
            height: 28,
            borderRadius: '50%',
            background: `conic-gradient(var(--primary) ${pct * 3.6}deg, var(--inset) 0deg)`,
            display: 'inline-block',
            flex: 'none',
          }}
        />
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>
            <span>{usage.monthlyUsed} used</span>
            <span>{remaining} left</span>
          </div>
          <div
            style={{
              width: '100%',
              height: 4,
              borderRadius: 999,
              background: 'var(--inset)',
              marginTop: 6,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${pct}%`,
                height: '100%',
                borderRadius: 999,
                background: 'var(--primary)',
              }}
            />
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {usage.topupCredits > 0 && (
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>
            Top-up credits: <strong style={{ color: 'var(--ink)' }}>{usage.topupCredits}</strong>
          </span>
        )}
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>
          Resets on <strong style={{ color: 'var(--ink)' }}>{usage.resetDate}</strong>
        </span>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button className="btn btn-primary btn-sm" style={{ flex: 1 }} onClick={() => alert('Buy credits — mocked')}>
          Buy credits
        </button>
        <button className="btn btn-ghost btn-sm" style={{ flex: 1 }} onClick={() => alert('Upgrade — mocked')}>
          Upgrade
        </button>
      </div>
    </div>
  );
}

function UsagePopover({ onClose }: { onClose: () => void }) {
  const usage = useDashboardStore((s: DashboardState) => s.usage);
  const remaining = usage.monthlyTotal - usage.monthlyUsed;
  const pct = Math.max(0, Math.min(100, (usage.monthlyUsed / usage.monthlyTotal) * 100));

  return (
    <div className="menu-pop" style={{ width: 280, right: 0, top: 42 }}>
      <div className="mh">Usage status</div>

      <div style={{ padding: '10px 10px 6px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <span
            style={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              background: `conic-gradient(var(--primary) ${pct * 3.6}deg, var(--inset) 0deg)`,
              display: 'inline-block',
              flex: 'none',
            }}
          />
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 650, color: 'var(--ink)' }}>{usage.plan} plan</div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>
              {usage.monthlyUsed} / {usage.monthlyTotal} monthly credits
            </div>
          </div>
        </div>

        <div
          style={{
            width: '100%',
            height: 5,
            borderRadius: 999,
            background: 'var(--inset)',
            marginBottom: 10,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${pct}%`,
              height: '100%',
              borderRadius: 999,
              background: 'var(--primary)',
            }}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 12px', fontSize: 12, marginBottom: 10 }}>
          <div>
            <span style={{ color: 'var(--muted)', display: 'block' }}>Used</span>
            <strong style={{ color: 'var(--ink)' }}>{usage.monthlyUsed}</strong>
          </div>
          <div>
            <span style={{ color: 'var(--muted)', display: 'block' }}>Remaining</span>
            <strong style={{ color: 'var(--ink)' }}>{remaining}</strong>
          </div>
          {usage.topupCredits > 0 && (
            <div>
              <span style={{ color: 'var(--muted)', display: 'block' }}>Top-up</span>
              <strong style={{ color: 'var(--ink)' }}>{usage.topupCredits}</strong>
            </div>
          )}
          <div>
            <span style={{ color: 'var(--muted)', display: 'block' }}>Resets</span>
            <strong style={{ color: 'var(--ink)' }}>{usage.resetDate}</strong>
          </div>
        </div>
      </div>

      {usage.recentUsage.length > 0 && (
        <>
          <div className="mh" style={{ borderTop: '1px solid var(--line-soft)', marginTop: 4 }}>
            Recent usage
          </div>
          <div style={{ maxHeight: 160, overflowY: 'auto', padding: '0 4px' }}>
            {usage.recentUsage.map((item: { action: string; credits: number }, i: number) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '7px 6px',
                  borderRadius: 7,
                  fontSize: 12.5,
                }}
              >
                <span style={{ color: 'var(--ink)' }}>{item.action}</span>
                <span style={{ color: 'var(--muted)', fontWeight: 600 }}>-{item.credits}</span>
              </div>
            ))}
          </div>
        </>
      )}

      <div style={{ display: 'flex', gap: 8, padding: '10px' }}>
        <button className="btn btn-primary btn-sm" style={{ flex: 1 }} onClick={() => { onClose(); alert('Buy credits — mocked'); }}>
          Buy credits
        </button>
        <button className="btn btn-ghost btn-sm" style={{ flex: 1 }} onClick={() => { onClose(); alert('Upgrade — mocked'); }}>
          Upgrade
        </button>
      </div>
    </div>
  );
}
