import { useNavigate } from 'react-router-dom';
import { Sparkles } from 'lucide-react';

export default function CreateProjectPanel() {
  const navigate = useNavigate();

  return (
    <div className="create-panel">
      <div className="create-panel__text">
        <h2>Start creating</h2>
        <p>Describe what you want and Orra will design it.</p>
      </div>
      <button className="orra-btn orra-btn--primary" onClick={() => navigate('/workspace')}>
        <Sparkles size={16} />
        Start creating
      </button>
    </div>
  );
}
