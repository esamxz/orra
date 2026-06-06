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
          <button className="orra-btn orra-btn--secondary" onClick={onClose}>Cancel</button>
          <button className="orra-btn orra-btn--danger" onClick={onConfirm}>Delete</button>
        </>
      }
    >
      <p>
        Are you sure you want to delete <strong>{itemName}</strong>?
        This action cannot be undone.
      </p>
    </Modal>
  );
}
