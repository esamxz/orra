import { Icon } from '../../data/icons';

interface Specs {
  lead: string;
  style: string;
  format: string;
  brand: string;
  cta: string;
}

interface Props {
  specs: Specs | null;
  ctaSet: boolean;
  onApprove: () => void;
  onAddCta: () => void;
  onEdit: () => void;
}

export default function ApprovalCard({ specs, onApprove, onAddCta, onEdit, ctaSet }: Props) {
  if (!specs) return null;
  return (
    <div className="approval">
      <div className="ap-head">
        <span className="ic">{<Icon.spark s={15} />}</span>
        <b>Plan ready</b>
      </div>
      <div className="ap-body">
        <p className="lead">{specs.lead}</p>
        <div className="ap-specs">
          <div className="ap-spec"><span className="k">Style</span><span className="v">{specs.style}</span></div>
          <div className="ap-spec"><span className="k">Format</span><span className="v">{specs.format}</span></div>
          <div className="ap-spec"><span className="k">Brand</span><span className="v">{specs.brand}</span></div>
          <div className="ap-spec"><span className="k">CTA</span><span className={'v'+(ctaSet?'':' unset')}>{ctaSet ? specs.cta : 'not set'}</span></div>
        </div>
      </div>
      <div className="ap-foot">
        <button className="btn btn-primary" onClick={onApprove}>{<Icon.check s={16} />} Approve & create</button>
        {!ctaSet && <button className="btn btn-ghost btn-sm" onClick={onAddCta}>Add CTA</button>}
        <button className="btn btn-ghost btn-sm" onClick={onEdit}>Edit direction</button>
      </div>
    </div>
  );
}
