import { useWorkspaceStore } from '../../stores/workspaceStore';
import { CreditCard, ArrowUpRight } from 'lucide-react';

export default function UsageStatus() {
  const { usage, showUsagePopover, toggleUsagePopover } = useWorkspaceStore();
  const remaining = usage.monthlyTotal - usage.monthlyUsed;

  return (
    <div className="usage-status">
      <button className="usage-status__trigger" onClick={toggleUsagePopover}>
        <CreditCard size={14} />
        {usage.monthlyUsed} / {usage.monthlyTotal} credits
      </button>

      {showUsagePopover && (
        <div className="orra-popover" style={{ right: 0, top: '100%', marginTop: '0.5rem', width: '300px' }}>
          <div style={{ marginBottom: '1rem' }}>
            <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{usage.plan} plan</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>Resets on {usage.resetDate}</div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
            <div style={{ background: 'var(--bg-secondary)', padding: '0.75rem', borderRadius: 'var(--radius-md)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Monthly used</div>
              <div style={{ fontWeight: 600, fontSize: '1.1rem' }}>{usage.monthlyUsed}</div>
            </div>
            <div style={{ background: 'var(--bg-secondary)', padding: '0.75rem', borderRadius: 'var(--radius-md)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Remaining</div>
              <div style={{ fontWeight: 600, fontSize: '1.1rem' }}>{remaining}</div>
            </div>
            <div style={{ background: 'var(--bg-secondary)', padding: '0.75rem', borderRadius: 'var(--radius-md)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Top up</div>
              <div style={{ fontWeight: 600, fontSize: '1.1rem' }}>{usage.topupCredits}</div>
            </div>
            <div style={{ background: 'var(--bg-secondary)', padding: '0.75rem', borderRadius: 'var(--radius-md)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Reset date</div>
              <div style={{ fontWeight: 600, fontSize: '1.1rem' }}>{usage.resetDate}</div>
            </div>
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.5rem' }}>Recent usage</div>
            {usage.recentUsage.slice(0, 4).map((item, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', padding: '0.3rem 0', borderBottom: '1px solid var(--border-color)' }}>
                <span style={{ color: 'var(--text-secondary)' }}>{item.action}</span>
                <span style={{ color: 'var(--text-muted)' }}>-{item.credits} credits · {item.date}</span>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="orra-btn orra-btn--primary" style={{ flex: 1 }}>
              <ArrowUpRight size={14} />
              Buy credits
            </button>
            <button className="orra-btn orra-btn--secondary" style={{ flex: 1 }}>
              Upgrade
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
