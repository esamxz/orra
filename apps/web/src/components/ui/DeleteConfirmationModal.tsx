import Modal from './Modal';

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  itemName: string;
  itemType?: string;
}

export default function DeleteConfirmationModal({ open, onClose, onConfirm, itemName, itemType = 'item' }: Props) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Delete ${itemType}`}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" style={{background:'#b4543f'}} onClick={onConfirm}>Delete</button>
        </>
      }
    >
      <p style={{fontSize:14,lineHeight:1.6,color:'var(--muted)'}}>
        Are you sure you want to delete <strong style={{color:'var(--ink)'}}>{itemName}</strong>?<br/>
        This action cannot be undone.
      </p>
    </Modal>
  );
}
