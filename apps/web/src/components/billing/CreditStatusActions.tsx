import { Link } from 'react-router-dom';

export type CreditStatusActionsProps = {
  remaining: number | null;
  monthlyCredits: number | null;
  loading?: boolean;
  onBuyCredits?: () => void;
  onUpgrade?: () => void;
  compact?: boolean;
};

export default function CreditStatusActions({
  remaining,
  monthlyCredits,
  loading = false,
  onBuyCredits,
  onUpgrade,
  compact = false,
}: CreditStatusActionsProps) {
  const hasCredits = remaining !== null && remaining >= 0;
  const hasMonthly = monthlyCredits !== null && monthlyCredits >= 0;
  const displayRemaining = hasCredits ? remaining : '—';

  if (compact) {
    return (
      <div className="csa csa-compact">
        <span
          className="csa-badge"
          title={hasCredits ? `${remaining} credits remaining` : 'Usage status'}
          data-testid="credit-status-badge"
        >
          {loading ? (
            <span className="csa-pulse" />
          ) : (
            <span
              className="csa-ring"
              style={{
                opacity: hasCredits ? 1 : 0.5,
              }}
            />
          )}
          <span className="csa-amount" data-testid="credit-remaining">
            {loading && remaining === null ? '—' : displayRemaining}
          </span>
          <span className="csa-label">credits</span>
        </span>

        {onBuyCredits && (
          <Link
            to="/billing/credits"
            className="btn btn-primary btn-sm"
            onClick={(e) => {
              e.preventDefault();
              onBuyCredits();
            }}
            data-testid="buy-credits-link"
          >
            Buy credits
          </Link>
        )}
        {onUpgrade && (
          <Link
            to="/billing/plan"
            className="btn btn-ghost btn-sm"
            onClick={(e) => {
              e.preventDefault();
              onUpgrade();
            }}
            data-testid="upgrade-link"
          >
            Upgrade
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className="csa" data-testid="credit-status-actions">
      <div className="csa-card">
        <div className="csa-row">
          <span className="eyebrow">Usage</span>
        </div>

        {loading && remaining === null && (
          <div className="csa-loading">Loading usage…</div>
        )}

        {!loading && !hasCredits && !hasMonthly && (
          <div className="csa-unavailable">Usage unavailable</div>
        )}

        {(hasCredits || hasMonthly) && (
          <>
            <div className="csa-total">
              <span className="csa-ring" />
              <div className="csa-stack">
                <span className="csa-remaining" data-testid="credit-remaining">
                  {displayRemaining} remaining
                </span>
                <div className="csa-bar">
                  <div
                    className="csa-bar-fill"
                    style={{
                      width: hasMonthly && monthlyCredits > 0
                        ? `${Math.min(100, Math.max(0, (monthlyCredits / Math.max(monthlyCredits, 1)) * 100))}%`
                        : '0%',
                    }}
                  />
                </div>
              </div>
            </div>

            <div className="csa-breakdown">
              {hasMonthly && (
                <span>
                  Monthly credits: <strong>{monthlyCredits}</strong>
                </span>
              )}
            </div>
          </>
        )}

        <div className="csa-actions">
          {onBuyCredits && (
            <Link
              to="/billing/credits"
              className="btn btn-primary btn-sm"
              onClick={(e) => {
                e.preventDefault();
                onBuyCredits();
              }}
              data-testid="buy-credits-link"
            >
              Buy credits
            </Link>
          )}
          {onUpgrade && (
            <Link
              to="/billing/plan"
              className="btn btn-ghost btn-sm"
              onClick={(e) => {
                e.preventDefault();
                onUpgrade();
              }}
              data-testid="upgrade-link"
            >
              Upgrade
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
