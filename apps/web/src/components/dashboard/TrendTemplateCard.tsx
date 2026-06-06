import { useNavigate } from 'react-router-dom';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { type MockTrendTemplate } from '../../data/mockData';

interface Props {
  template: MockTrendTemplate;
}

export default function TrendTemplateCard({ template }: Props) {
  const navigate = useNavigate();
  const { setComposerValue } = useWorkspaceStore();

  const handleUsePrompt = () => {
    setComposerValue(template.prompt);
    navigate('/workspace');
  };

  return (
    <div className="orra-card">
      <div className="template-card__thumb" style={{ background: template.thumbnailColor }}>
        {template.title}
      </div>
      <div className="template-card__info">
        <div className="template-card__name">{template.title}</div>
        <div className="template-card__desc">{template.description}</div>
        <div className="template-card__tags">
          {template.tags.map((tag) => (
            <span key={tag} className="template-card__tag">{tag}</span>
          ))}
        </div>
        <button className="orra-btn orra-btn--small orra-btn--secondary" style={{ marginTop: '0.75rem' }} onClick={handleUsePrompt}>
          Use this prompt
        </button>
      </div>
    </div>
  );
}
