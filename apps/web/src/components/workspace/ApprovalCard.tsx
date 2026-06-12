import { Icon } from '../../data/icons';

interface Specs {
  lead: string;
  style: string;
  format: string;
  brand: string;
  cta: string;
  cardCount?: number;
  visualDirection?: string;
  styleNotes?: string[];
  memorySummary?: string;
}

interface Props {
  specs: Specs | null;
  ctaSet: boolean;
  disabled?: boolean;
  onApprove: () => void;
  onAddCta: () => void;
  onEdit: () => void;
  onCreateCardByCard?: () => void;
}

export default function ApprovalCard({ specs, onApprove, onAddCta, onEdit, onCreateCardByCard, ctaSet, disabled }: Props) {
  if (!specs) return null;
  const isCarousel = specs.cardCount != null;
  return (
    <div className="approval" style={{ opacity: disabled ? 0.6 : 1 }}>
      <div className="ap-head">
        <span className="ic">{<Icon.spark s={15} />}</span>
        <b>Plan ready</b>
      </div>
      <div className="ap-body">
        <p className="lead">{specs.lead}</p>
        <div className="ap-specs">
          <div className="ap-spec"><span className="k">Style</span><span className="v">{specs.style}</span></div>
          <div className="ap-spec"><span className="k">Format</span><span className="v">{specs.format}</span></div>
          {specs.cardCount != null && (
            <div className="ap-spec"><span className="k">Cards</span><span className="v">{specs.cardCount}</span></div>
          )}
          <div className="ap-spec"><span className="k">Brand</span><span className="v">{specs.brand}</span></div>
          {specs.visualDirection && (
            <div className="ap-spec"><span className="k">Visual</span><span className="v">{specs.visualDirection}</span></div>
          )}
          <div className="ap-spec"><span className="k">CTA</span><span className={'v'+(ctaSet?'':' unset')}>{ctaSet ? specs.cta : 'not set'}</span></div>
          {specs.memorySummary && (
            <div className="ap-spec"><span className="k">Context</span><span className="v">{specs.memorySummary}</span></div>
          )}
        </div>
        {specs.styleNotes && specs.styleNotes.length > 0 && (
          <div className="ap-notes">
            {specs.styleNotes.map((note, i) => (
              <span key={i} className="ap-note">{note}</span>
            ))}
          </div>
        )}
      </div>
      <div className="ap-foot">
        {isCarousel ? (
          <>
            <button className="btn btn-primary" disabled={disabled} onClick={onApprove}>{<Icon.check s={16} />} Create all cards</button>
            {onCreateCardByCard && (
              <button className="btn btn-soft btn-sm" disabled={disabled} onClick={onCreateCardByCard}>{<Icon.carousel s={16} />} Create card by card</button>
            )}
          </>
        ) : (
          <button className="btn btn-primary" disabled={disabled} onClick={onApprove}>{<Icon.check s={16} />} Approve & create</button>
        )}
        {!ctaSet && <button className="btn btn-ghost btn-sm" disabled={disabled} onClick={onAddCta}>Add CTA</button>}
        <button className="btn btn-ghost btn-sm" disabled={disabled} onClick={onEdit}>Edit direction</button>
      </div>
    </div>
  );
}
