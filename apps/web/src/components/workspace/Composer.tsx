import { useState } from 'react';
import { Send } from 'lucide-react';
import { useWorkspaceStore } from '../../stores/workspaceStore';

export default function Composer() {
  const { composerValue, sendMessage, setComposerValue, isPlanning } = useWorkspaceStore();
  const [rows, setRows] = useState(1);

  const handleSend = () => {
    if (!composerValue.trim() || isPlanning) return;
    sendMessage(composerValue.trim());
    setRows(1);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="composer">
      <textarea
        className="composer__input"
        placeholder="Describe what you want to create..."
        value={composerValue}
        onChange={(e) => {
          setComposerValue(e.target.value);
          setRows(Math.min(5, e.target.value.split('\n').length));
        }}
        onKeyDown={handleKeyDown}
        rows={rows}
        disabled={isPlanning}
      />
      <button
        className="composer__send"
        onClick={handleSend}
        disabled={!composerValue.trim() || isPlanning}
        title="Send"
      >
        <Send size={16} />
      </button>
    </div>
  );
}
