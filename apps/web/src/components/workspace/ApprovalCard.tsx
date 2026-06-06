import { useWorkspaceStore } from '../../stores/workspaceStore';

export default function ApprovalCard() {
  const { approvalPlan, approvePlan, rejectPlan } = useWorkspaceStore();

  if (!approvalPlan) return null;

  const summary = approvalPlan.type === 'carousel'
    ? `Ready to create a ${approvalPlan.cardCount}-card carousel about ${approvalPlan.topic}.`
    : `Ready to create a post about ${approvalPlan.topic}.`;

  return (
    <div className="approval-card">
      <div className="approval-card__summary">{summary}</div>
      <div className="approval-card__details">
        <div className="approval-card__detail">
          <strong>Style</strong>: {approvalPlan.style}
        </div>
        <div className="approval-card__detail">
          <strong>Format</strong>: {approvalPlan.ratio}
        </div>
        <div className="approval-card__detail">
          <strong>Brand</strong>: {approvalPlan.brand || 'No brand'}
        </div>
        <div className="approval-card__detail">
          <strong>CTA</strong>: Not set
        </div>
      </div>
      <div className="approval-card__actions">
        <button className="orra-btn orra-btn--primary" onClick={approvePlan}>
          Approve and create
        </button>
        <button className="orra-btn orra-btn--secondary" onClick={rejectPlan}>
          Edit direction
        </button>
        <button className="orra-btn orra-btn--ghost" onClick={rejectPlan}>
          Cancel
        </button>
      </div>
    </div>
  );
}
