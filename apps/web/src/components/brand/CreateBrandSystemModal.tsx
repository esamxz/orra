import { useState } from 'react';
import { Upload, X } from 'lucide-react';
import Modal from '../ui/Modal';
import { APP_FONT_CATALOG } from '../../data/fonts';
import { type MockBrandSystem } from '../../data/mockData';

interface Props {
  open: boolean;
  onClose: () => void;
  onCreate: (brand: MockBrandSystem) => void;
}

export default function CreateBrandSystemModal({ open, onClose, onCreate }: Props) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [tone, setTone] = useState('');
  const [visual, setVisual] = useState('');
  const [palette, setPalette] = useState(['#1d2a30', '#5e7680', '#a4b7bd', '#c8d1d8', '#f5f7f8']);
  const [fonts, setFonts] = useState<string[]>(['Inter']);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onCreate({
      id: `brand-${Date.now()}`,
      name: name.trim(),
      description: description.trim(),
      palette,
      fonts,
      toneOfVoice: tone.trim(),
      visualDirection: visual.trim(),
    });
    setName('');
    setDescription('');
    setTone('');
    setVisual('');
    setPalette(['#1d2a30', '#5e7680', '#a4b7bd', '#c8d1d8', '#f5f7f8']);
    setFonts(['Inter']);
    onClose();
  };

  const toggleFont = (font: string) => {
    setFonts((prev) =>
      prev.includes(font) ? prev.filter((f) => f !== font) : [...prev, font],
    );
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Create brand system"
      footer={
        <>
          <button type="button" className="orra-btn orra-btn--secondary" onClick={onClose}>Cancel</button>
          <button type="submit" form="brand-form" className="orra-btn orra-btn--primary">Create</button>
        </>
      }
    >
      <form id="brand-form" onSubmit={handleSubmit}>
        <div className="brand-modal__section">
          <div className="brand-modal__section-title">Brand name</div>
          <input
            className="orra-input"
            placeholder="Enter brand name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>

        <div className="brand-modal__section">
          <div className="brand-modal__section-title">Description</div>
          <input
            className="orra-input"
            placeholder="Short description of your brand"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div className="brand-modal__section">
          <div className="brand-modal__section-title">Logo</div>
          <div className="brand-modal__upload">
            <Upload size={20} />
            <span>Upload logo image</span>
          </div>
        </div>

        <div className="brand-modal__section">
          <div className="brand-modal__section-title">Color palette</div>
          <div className="brand-modal__color-grid">
            {palette.map((color, i) => (
              <div key={i} style={{ position: 'relative' }}>
                <input
                  type="color"
                  value={color}
                  onChange={(e) => {
                    const next = [...palette];
                    next[i] = e.target.value;
                    setPalette(next);
                  }}
                  className="brand-modal__color-swatch"
                  style={{ padding: 0, border: 'none', cursor: 'pointer' }}
                />
                {palette.length > 1 && (
                  <button
                    type="button"
                    className="orra-btn orra-btn--small orra-btn--ghost"
                    style={{ position: 'absolute', top: '-6px', right: '-6px', padding: '2px', background: 'var(--bg-primary)' }}
                    onClick={() => setPalette(palette.filter((_, idx) => idx !== i))}
                  >
                    <X size={10} />
                  </button>
                )}
              </div>
            ))}
            {palette.length < 8 && (
              <button
                type="button"
                className="brand-modal__color-swatch"
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-tertiary)', border: '1px dashed var(--border-color)' }}
                onClick={() => setPalette([...palette, '#ffffff'])}
              >
                +
              </button>
            )}
          </div>
        </div>

        <div className="brand-modal__section">
          <div className="brand-modal__section-title">Typography</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {APP_FONT_CATALOG.map((font) => (
              <button
                key={font}
                type="button"
                className={`orra-btn orra-btn--small ${fonts.includes(font) ? 'orra-btn--primary' : 'orra-btn--secondary'}`}
                onClick={() => toggleFont(font)}
              >
                {font}
              </button>
            ))}
          </div>
        </div>

        <div className="brand-modal__section">
          <div className="brand-modal__section-title">Tone of voice</div>
          <textarea
            className="orra-textarea"
            placeholder="How should your brand sound?"
            value={tone}
            onChange={(e) => setTone(e.target.value)}
            rows={3}
          />
        </div>

        <div className="brand-modal__section">
          <div className="brand-modal__section-title">Visual direction</div>
          <textarea
            className="orra-textarea"
            placeholder="Describe the visual style"
            value={visual}
            onChange={(e) => setVisual(e.target.value)}
            rows={3}
          />
        </div>

        <div className="brand-modal__section">
          <div className="brand-modal__section-title">Reference images</div>
          <div className="brand-modal__upload">
            <Upload size={20} />
            <span>Upload reference images</span>
          </div>
        </div>
      </form>
    </Modal>
  );
}
