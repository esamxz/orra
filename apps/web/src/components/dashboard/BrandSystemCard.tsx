import { useState } from 'react';
import { MoreVertical, Pencil, Copy, Trash2 } from 'lucide-react';
import { type MockBrandSystem } from '../../data/mockData';
import { useDashboardStore } from '../../stores/dashboardStore';
import DeleteConfirmationModal from '../ui/DeleteConfirmationModal';

interface Props {
  brand: MockBrandSystem;
}

export default function BrandSystemCard({ brand }: Props) {
  const { removeBrandSystem, duplicateBrandSystem } = useDashboardStore();
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className="brand-card">
      <div className="brand-card__header">
        <div className="brand-card__name">{brand.name}</div>
        <div className="dropdown">
          <button
            className="orra-btn orra-btn--small orra-btn--ghost"
            onClick={() => setMenuOpen((v) => !v)}
          >
            <MoreVertical size={14} />
          </button>
          {menuOpen && (
            <div className="dropdown__menu">
              <button className="dropdown__item" onClick={() => setMenuOpen(false)}>
                <Pencil size={14} /> Edit
              </button>
              <button className="dropdown__item" onClick={() => { setMenuOpen(false); duplicateBrandSystem(brand.id); }}>
                <Copy size={14} /> Duplicate
              </button>
              <button className="dropdown__item dropdown__item--danger" onClick={() => { setMenuOpen(false); setConfirmDelete(true); }}>
                <Trash2 size={14} /> Delete
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="brand-card__desc">{brand.description}</div>

      <div className="brand-card__palette">
        {brand.palette.map((color, i) => (
          <div key={i} className="brand-card__swatch" style={{ background: color }} title={color} />
        ))}
      </div>

      <div className="brand-card__fonts">
        {brand.fonts.join(', ')}
      </div>

      <DeleteConfirmationModal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => { setConfirmDelete(false); removeBrandSystem(brand.id); }}
        itemName={brand.name}
        itemType="brand system"
      />
    </div>
  );
}
