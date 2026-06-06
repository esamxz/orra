import { useDashboardStore } from '../../stores/dashboardStore';

export default function UsageSummaryCard() {
  const { usage } = useDashboardStore();
  const pct = Math.round((usage.monthlyUsed / usage.monthlyTotal) * 100);

  return (
    <div className="usage-summary">
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-primary)' }}>
          {usage.plan} plan
        </div>
        <div className="usage-summary__bar-bg">
          <div className="usage-summary__bar-fill" style={{ width: `${pct}%` }} />
        </div>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
          {usage.monthlyUsed} / {usage.monthlyTotal} credits
        </div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Reset on {usage.resetDate}</div>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>Top up: {usage.topupCredits}</div>
      </div>
    </div>
  );
}
