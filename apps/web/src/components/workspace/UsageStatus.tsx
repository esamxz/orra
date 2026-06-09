import { useState } from 'react';
import type { CreditStatusResponse, CreditLedgerEntryDto } from '../../api/types';

interface Props {
  compact?: boolean;
  className?: string;
  status?: CreditStatusResponse | null;
  loading?: boolean;
  error?: string | null;
  planLabel?: string;
}

export default function UsageStatus({
  compact = false,
  className = '',
  status,
  loading,
  error,
  planLabel,
}: Props) {
  const [open, setOpen] = useState(false);

  const balance = status?.balance;
  const totalRemaining = balance?.totalRemaining ?? 0;
  const monthlyRemaining = balance?.monthlyRemaining ?? 0;
  const topupRemaining = balance?.topupRemaining ?? 0;
  const reserved = balance?.reserved ?? 0;
  const resetAt = balance?.resetAt ?? null;

  // Compute monthly total for progress visualization if we can infer it.
  // Phase 10D: backend does not return monthlyTotal, so we derive a proxy:
  // treat monthlyRemaining + any recent subscription usage as the pool.
  // This is approximate; future phases may add monthlyTotal to the DTO.
  const monthlyTotal = Math.max(monthlyRemaining, 1);
  const monthlyUsed = Math.max(0, monthlyTotal - monthlyRemaining);
  const pct = Math.max(0, Math.min(100, (monthlyUsed / monthlyTotal) * 100));

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
            {loading && !status ? (
              <span style={{ fontWeight: 600, color: 'var(--muted)' }}>—</span>
            ) : error ? (
              <span style={{ fontWeight: 600, color: 'var(--muted)' }}>Usage unavailable</span>
            ) : (
              <span style={{ fontWeight: 600, color: 'var(--ink)' }}>
                {totalRemaining}
              </span>
            )}
          </span>
          {!error && <span style={{ color: 'var(--muted)', fontWeight: 500 }}>credits</span>}
        </button>

        {open && (
          <>
            <div className="backdrop" onClick={() => setOpen(false)} />
            <UsagePopover
              onClose={() => setOpen(false)}
              status={status}
              loading={loading}
              error={error}
              planLabel={planLabel}
            />
          </>
        )}
      </div>
    );
  }

  return (
    <div className={`create-panel ${className}`} style={{ padding: 16, marginTop: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <span className="eyebrow">Usage</span>
        {planLabel && (
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--primary)' }}>{planLabel}</span>
        )}
      </div>

      {loading && !status && (
        <div style={{ fontSize: 13, color: 'var(--muted)', padding: '6px 0' }}>Loading usage…</div>
      )}

      {error && (
        <div style={{ fontSize: 12.5, color: 'var(--muted)', padding: '4px 0' }}>
          Usage unavailable
        </div>
      )}

      {!loading && !error && (
        <>
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
                <span>{totalRemaining} remaining</span>
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
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>
              Monthly credits: <strong style={{ color: 'var(--ink)' }}>{monthlyRemaining}</strong>
            </span>
            {topupRemaining > 0 && (
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                Top-up credits: <strong style={{ color: 'var(--ink)' }}>{topupRemaining}</strong>
              </span>
            )}
            {reserved > 0 && (
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                Reserved: <strong style={{ color: 'var(--ink)' }}>{reserved}</strong>
              </span>
            )}
            {resetAt && (
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                Resets on <strong style={{ color: 'var(--ink)' }}>{resetAt}</strong>
              </span>
            )}
          </div>
        </>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button className="btn btn-primary btn-sm" style={{ flex: 1 }} disabled onClick={() => alert('Buy credits — coming soon')}>
          Buy credits
        </button>
        <button className="btn btn-ghost btn-sm" style={{ flex: 1 }} disabled onClick={() => alert('Upgrade — coming soon')}>
          Upgrade
        </button>
      </div>
    </div>
  );
}

function UsagePopover({
  onClose,
  status,
  loading,
  error,
  planLabel,
}: {
  onClose: () => void;
  status?: CreditStatusResponse | null;
  loading?: boolean;
  error?: string | null;
  planLabel?: string;
}) {
  const balance = status?.balance;
  const totalRemaining = balance?.totalRemaining ?? 0;
  const monthlyRemaining = balance?.monthlyRemaining ?? 0;
  const topupRemaining = balance?.topupRemaining ?? 0;
  const reserved = balance?.reserved ?? 0;
  const resetAt = balance?.resetAt ?? null;
  const recentLedger = status?.recentLedger ?? [];

  const monthlyTotal = Math.max(monthlyRemaining, 1);
  const monthlyUsed = Math.max(0, monthlyTotal - monthlyRemaining);
  const pct = Math.max(0, Math.min(100, (monthlyUsed / monthlyTotal) * 100));

  return (
    <div className="menu-pop" style={{ width: 280, right: 0, top: 42 }}>
      <div className="mh">Usage status</div>

      <div style={{ padding: '10px 10px 6px' }}>
        {loading && !status && (
          <div style={{ fontSize: 13, color: 'var(--muted)', padding: '6px 0' }}>Loading usage…</div>
        )}

        {error && (
          <div style={{ fontSize: 12.5, color: 'var(--muted)', padding: '4px 0' }}>
            Usage unavailable
          </div>
        )}

        {!loading && !error && (
          <>
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
                <div style={{ fontSize: 13.5, fontWeight: 650, color: 'var(--ink)' }}>
                  {planLabel ? `${planLabel} plan` : 'Current plan'}
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                  {totalRemaining} credits remaining
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
                <span style={{ color: 'var(--muted)', display: 'block' }}>Monthly</span>
                <strong style={{ color: 'var(--ink)' }}>{monthlyRemaining}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--muted)', display: 'block' }}>Remaining</span>
                <strong style={{ color: 'var(--ink)' }}>{totalRemaining}</strong>
              </div>
              {topupRemaining > 0 && (
                <div>
                  <span style={{ color: 'var(--muted)', display: 'block' }}>Top-up</span>
                  <strong style={{ color: 'var(--ink)' }}>{topupRemaining}</strong>
                </div>
              )}
              {reserved > 0 && (
                <div>
                  <span style={{ color: 'var(--muted)', display: 'block' }}>Reserved</span>
                  <strong style={{ color: 'var(--ink)' }}>{reserved}</strong>
                </div>
              )}
              {resetAt && (
                <div>
                  <span style={{ color: 'var(--muted)', display: 'block' }}>Resets</span>
                  <strong style={{ color: 'var(--ink)' }}>{resetAt}</strong>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {recentLedger.length > 0 && !loading && !error && (
        <>
          <div className="mh" style={{ borderTop: '1px solid var(--line-soft)', marginTop: 4 }}>
            Recent usage
          </div>
          <div style={{ maxHeight: 160, overflowY: 'auto', padding: '0 4px' }}>
            {recentLedger.map((item: CreditLedgerEntryDto, i: number) => (
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
                <span style={{ color: 'var(--ink)' }}>{item.entryType}</span>
                <span style={{ color: item.amount < 0 ? 'var(--danger, #c44)' : 'var(--muted)', fontWeight: 600 }}>
                  {item.amount < 0 ? '' : '+'}{item.amount}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      <div style={{ display: 'flex', gap: 8, padding: '10px' }}>
        <button className="btn btn-primary btn-sm" style={{ flex: 1 }} disabled onClick={() => { onClose(); alert('Buy credits — coming soon'); }}>
          Buy credits
        </button>
        <button className="btn btn-ghost btn-sm" style={{ flex: 1 }} disabled onClick={() => { onClose(); alert('Upgrade — coming soon'); }}>
          Upgrade
        </button>
      </div>
    </div>
  );
}
