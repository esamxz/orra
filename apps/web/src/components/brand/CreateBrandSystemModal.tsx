import { useState } from 'react';
import { Upload, X } from 'lucide-react';
import Modal from '../ui/Modal';
import {
  APP_FONT_CATALOG,
  getFontsByRole,
  type FontEntry,
} from '@orra/shared';
import { type MockBrandSystem } from '../../stores/dashboardStore';

interface Props {
  open: boolean;
  onClose: () => void;
  onCreate: (brand: MockBrandSystem) => void;
}

function FontSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: FontEntry[];
  onChange: (family: string) => void;
}) {
  return (
    <div>
      <div
        style={{
          fontSize: '0.8rem',
          fontWeight: 600,
          color: 'var(--muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          marginBottom: '0.5rem',
        }}
      >
        {label}
      </div>
      <select
        className="insp-select"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ width: '100%', cursor: 'pointer' }}
      >
        {options.map((font) => (
          <option key={font.id} value={font.family}>
            {font.family}
          </option>
        ))}
      </select>
    </div>
  );
}

export default function CreateBrandSystemModal({ open, onClose, onCreate }: Props) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [tone, setTone] = useState('');
  const [visual, setVisual] = useState('');
  const [palette, setPalette] = useState(['#1d2a30', '#5e7680', '#a4b7bd', '#c8d1d8', '#f5f7f8']);
  const [displayFont, setDisplayFont] = useState('Newsreader');
  const [bodyFont, setBodyFont] = useState('Inter');

  const displayFonts = getFontsByRole('display');
  const bodyFonts = getFontsByRole('body');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const fonts = Array.from(new Set([displayFont, bodyFont]));
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
    setDisplayFont('Newsreader');
    setBodyFont('Inter');
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Create brand system"
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="brand-form" className="btn btn-primary">
            Create
          </button>
        </>
      }
    >
      <form id="brand-form" onSubmit={handleSubmit}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div>
            <div
              style={{
                fontSize: '0.8rem',
                fontWeight: 600,
                color: 'var(--muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                marginBottom: '0.5rem',
              }}
            >
              Brand name
            </div>
            <input
              className="insp-select"
              placeholder="Enter brand name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div>
            <div
              style={{
                fontSize: '0.8rem',
                fontWeight: 600,
                color: 'var(--muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                marginBottom: '0.5rem',
              }}
            >
              Description
            </div>
            <input
              className="insp-select"
              placeholder="Short description of your brand"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div>
            <div
              style={{
                fontSize: '0.8rem',
                fontWeight: 600,
                color: 'var(--muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                marginBottom: '0.5rem',
              }}
            >
              Logo
            </div>
            <div
              style={{
                width: '100%',
                height: '120px',
                border: '2px dashed var(--line-soft)',
                borderRadius: '9px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                color: 'var(--muted)',
                fontSize: '0.85rem',
                cursor: 'pointer',
              }}
            >
              <Upload size={20} />
              <span>Upload logo image</span>
            </div>
          </div>

          <div>
            <div
              style={{
                fontSize: '0.8rem',
                fontWeight: 600,
                color: 'var(--muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                marginBottom: '0.5rem',
              }}
            >
              Color palette
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
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
                    style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '7px',
                      border: '1px solid var(--line-soft)',
                      cursor: 'pointer',
                      padding: 0,
                    }}
                  />
                  {palette.length > 1 && (
                    <button
                      type="button"
                      className="btn-icon"
                      style={{
                        position: 'absolute',
                        top: '-6px',
                        right: '-6px',
                        width: '18px',
                        height: '18px',
                        background: 'var(--panel)',
                      }}
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
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '7px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'var(--inset)',
                    border: '1px dashed var(--line-soft)',
                    cursor: 'pointer',
                  }}
                  onClick={() => setPalette([...palette, '#ffffff'])}
                >
                  +
                </button>
              )}
            </div>
          </div>

          <div>
            <div
              style={{
                fontSize: '0.8rem',
                fontWeight: 600,
                color: 'var(--muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                marginBottom: '0.5rem',
              }}
            >
              Typography
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <FontSelect
                label="Display font"
                value={displayFont}
                options={displayFonts}
                onChange={setDisplayFont}
              />
              <FontSelect
                label="Body / UI font"
                value={bodyFont}
                options={bodyFonts}
                onChange={setBodyFont}
              />
            </div>
            <div
              style={{
                fontSize: '0.75rem',
                color: 'var(--muted)',
                marginTop: '0.5rem',
              }}
            >
              {APP_FONT_CATALOG.length} curated fonts available
            </div>
          </div>

          <div>
            <div
              style={{
                fontSize: '0.8rem',
                fontWeight: 600,
                color: 'var(--muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                marginBottom: '0.5rem',
              }}
            >
              Tone of voice
            </div>
            <textarea
              className="insp-select"
              placeholder="How should your brand sound?"
              value={tone}
              onChange={(e) => setTone(e.target.value)}
              rows={3}
              style={{ resize: 'vertical', minHeight: '60px', padding: '9px 11px', lineHeight: 1.4 }}
            />
          </div>

          <div>
            <div
              style={{
                fontSize: '0.8rem',
                fontWeight: 600,
                color: 'var(--muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                marginBottom: '0.5rem',
              }}
            >
              Visual direction
            </div>
            <textarea
              className="insp-select"
              placeholder="Describe the visual style"
              value={visual}
              onChange={(e) => setVisual(e.target.value)}
              rows={3}
              style={{ resize: 'vertical', minHeight: '60px', padding: '9px 11px', lineHeight: 1.4 }}
            />
          </div>

          <div>
            <div
              style={{
                fontSize: '0.8rem',
                fontWeight: 600,
                color: 'var(--muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                marginBottom: '0.5rem',
              }}
            >
              Reference images
            </div>
            <div
              style={{
                width: '100%',
                height: '120px',
                border: '2px dashed var(--line-soft)',
                borderRadius: '9px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                color: 'var(--muted)',
                fontSize: '0.85rem',
                cursor: 'pointer',
              }}
            >
              <Upload size={20} />
              <span>Upload reference images</span>
            </div>
          </div>
        </div>
      </form>
    </Modal>
  );
}
