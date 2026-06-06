import { useEffect, type ReactNode } from 'react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
}

export default function Modal({ open, onClose, title, children, footer }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="orra-modal-overlay" onClick={onClose}>
      <div className="orra-modal" onClick={(e) => e.stopPropagation()}>
        {title && (
          <div className="orra-modal__header">
            <h3>{title}</h3>
          </div>
        )}
        <div className="orra-modal__body">{children}</div>
        {footer && <div className="orra-modal__footer">{footer}</div>}
      </div>
    </div>
  );
}
