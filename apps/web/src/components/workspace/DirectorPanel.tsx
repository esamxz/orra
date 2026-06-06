import { useRef, useEffect, useState } from 'react';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import Composer from './Composer';
import ApprovalCard from './ApprovalCard';

export default function DirectorPanel() {
  const { chatMessages, isPlanning, panelWidth, setPanelWidth } = useWorkspaceStore();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, isPlanning]);

  useEffect(() => {
    if (!isDragging) return;
    const onMove = (e: MouseEvent) => {
      setPanelWidth(e.clientX);
    };
    const onUp = () => setIsDragging(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [isDragging, setPanelWidth]);

  return (
    <>
      <div className="director-panel" style={{ width: panelWidth }}>
        <div className="director-panel__header">
          <span className="director-panel__title">Director</span>
        </div>

        <div className="director-panel__messages">
          {chatMessages.map((msg) => (
            <div key={msg.id} className={`chat-message chat-message--${msg.role}`}>
              <div className="chat-message__bubble">
                {msg.kind === 'approval_summary' ? (
                  <ApprovalCard />
                ) : (
                  msg.content.split('\n').map((line, i) => (
                    <div key={i}>{line}</div>
                  ))
                )}
              </div>
            </div>
          ))}

          {isPlanning && (
            <div className="planning-state">
              <div className="planning-state__spinner" />
              Planning your design...
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        <Composer />
      </div>

      <div
        className={`resizable-divider ${isDragging ? 'resizable-divider--dragging' : ''}`}
        onMouseDown={() => setIsDragging(true)}
      />
    </>
  );
}
