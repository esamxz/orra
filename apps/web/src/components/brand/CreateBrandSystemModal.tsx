import { useState, useCallback, useMemo } from 'react';
import { Upload, X } from 'lucide-react';
import Modal from '../ui/Modal';
import {
  FONT_CATALOG,
  getFontByFamily,
} from '@orra/shared';
import { type BrandTypography } from '../../stores/dashboardStore';
import { BRAND_TYPOGRAPHY_PRESETS, type BrandPresetKey } from '../../data/brandPresets';

export interface BrandSystemFormData {
  name: string;
  description: string;
  palette: string[];
  toneOfVoice: string;
  visualDirection: string;
  typography: BrandTypography;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onCreate: (brand: BrandSystemFormData) => void;
}

const PRESETS = BRAND_TYPOGRAPHY_PRESETS;

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
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
      {children}
    </div>
  );
}

function FontSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (family: string) => void;
}) {
  return (
    <div>
      <div
        style={{
          fontSize: '0.75rem',
          fontWeight: 600,
          color: 'var(--muted)',
          marginBottom: '0.35rem',
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
        {FONT_CATALOG.map((font) => (
          <option key={font.id} value={font.family} style={{ fontFamily: font.family }}>
            {font.family}
          </option>
        ))}
      </select>
    </div>
  );
}

function WeightSelect({
  label,
  value,
  fontFamily,
  onChange,
}: {
  label: string;
  value: number;
  fontFamily: string;
  onChange: (weight: number) => void;
}) {
  const meta = getFontByFamily(fontFamily);
  const weights = meta?.weights ?? [400];
  return (
    <div>
      <div
        style={{
          fontSize: '0.75rem',
          fontWeight: 600,
          color: 'var(--muted)',
          marginBottom: '0.35rem',
        }}
      >
        {label}
      </div>
      <select
        className="insp-select"
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value, 10))}
        style={{ width: '100%', cursor: 'pointer' }}
      >
        {weights.map((w) => (
          <option key={w} value={w}>
            {w}
          </option>
        ))}
      </select>
    </div>
  );
}

function RoleRow({
  roleLabel,
  font,
  weight,
  onFontChange,
  onWeightChange,
}: {
  roleLabel: string;
  font: string;
  weight: number;
  onFontChange: (f: string) => void;
  onWeightChange: (w: number) => void;
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px', gap: '10px' }}>
      <FontSelect label={roleLabel} value={font} onChange={onFontChange} />
      <WeightSelect label="Weight" value={weight} fontFamily={font} onChange={onWeightChange} />
    </div>
  );
}

export default function CreateBrandSystemModal({ open, onClose, onCreate }: Props) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [tone, setTone] = useState('');
  const [visual, setVisual] = useState('');
  const [palette, setPalette] = useState(['#1d2a30', '#5e7680', '#a4b7bd', '#c8d1d8', '#f5f7f8']);
  const [preset, setPreset] = useState<BrandPresetKey>('editorial-calm');
  const [titleFont, setTitleFont] = useState(PRESETS['editorial-calm'].titleFont);
  const [titleWeight, setTitleWeight] = useState(PRESETS['editorial-calm'].titleWeight);
  const [bodyFont, setBodyFont] = useState(PRESETS['editorial-calm'].bodyFont);
  const [bodyWeight, setBodyWeight] = useState(PRESETS['editorial-calm'].bodyWeight);
  const [accentFont, setAccentFont] = useState(PRESETS['editorial-calm'].accentFont);
  const [accentWeight, setAccentWeight] = useState(PRESETS['editorial-calm'].accentWeight);
  const [captionFont, setCaptionFont] = useState(PRESETS['editorial-calm'].captionFont);
  const [captionWeight, setCaptionWeight] = useState(PRESETS['editorial-calm'].captionWeight);
  const [notes, setNotes] = useState('');

  const applyPreset = useCallback((key: BrandPresetKey) => {
    setPreset(key);
    if (key === 'custom') return;
    const p = PRESETS[key];
    setTitleFont(p.titleFont);
    setTitleWeight(p.titleWeight);
    setBodyFont(p.bodyFont);
    setBodyWeight(p.bodyWeight);
    setAccentFont(p.accentFont);
    setAccentWeight(p.accentWeight);
    setCaptionFont(p.captionFont);
    setCaptionWeight(p.captionWeight);
  }, []);

  const typography: BrandTypography = useMemo(
    () => ({
      preset,
      titleFont,
      titleWeight,
      bodyFont,
      bodyWeight,
      accentFont,
      accentWeight,
      captionFont,
      captionWeight,
      notes: notes.trim(),
    }),
    [preset, titleFont, titleWeight, bodyFont, bodyWeight, accentFont, accentWeight, captionFont, captionWeight, notes],
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onCreate({
      name: name.trim(),
      description: description.trim(),
      palette,
      toneOfVoice: tone.trim(),
      visualDirection: visual.trim(),
      typography,
    });
    // Reset
    setName('');
    setDescription('');
    setTone('');
    setVisual('');
    setPalette(['#1d2a30', '#5e7680', '#a4b7bd', '#c8d1d8', '#f5f7f8']);
    setPreset('editorial-calm');
    const p = PRESETS['editorial-calm'];
    setTitleFont(p.titleFont);
    setTitleWeight(p.titleWeight);
    setBodyFont(p.bodyFont);
    setBodyWeight(p.bodyWeight);
    setAccentFont(p.accentFont);
    setAccentWeight(p.accentWeight);
    setCaptionFont(p.captionFont);
    setCaptionWeight(p.captionWeight);
    setNotes('');
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
            <SectionLabel>Brand name</SectionLabel>
            <input
              className="insp-select"
              placeholder="Enter brand name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div>
            <SectionLabel>Description</SectionLabel>
            <input
              className="insp-select"
              placeholder="Short description of your brand"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div>
            <SectionLabel>Logo</SectionLabel>
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
            <SectionLabel>Color palette</SectionLabel>
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

          {/* Typography */}
          <div>
            <SectionLabel>Typography</SectionLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
              {/* Preset */}
              <div>
                <div
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    color: 'var(--muted)',
                    marginBottom: '0.35rem',
                  }}
                >
                  Preset
                </div>
                <div className="insp-seg">
                  {Object.entries(PRESETS).map(([key, p]) => (
                    <button
                      key={key}
                      type="button"
                      className={preset === key ? 'on' : ''}
                      onClick={() => applyPreset(key as BrandPresetKey)}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              <RoleRow
                roleLabel="Title style"
                font={titleFont}
                weight={titleWeight}
                onFontChange={setTitleFont}
                onWeightChange={setTitleWeight}
              />
              <RoleRow
                roleLabel="Body style"
                font={bodyFont}
                weight={bodyWeight}
                onFontChange={setBodyFont}
                onWeightChange={setBodyWeight}
              />
              <RoleRow
                roleLabel="Accent style"
                font={accentFont}
                weight={accentWeight}
                onFontChange={setAccentFont}
                onWeightChange={setAccentWeight}
              />
              <RoleRow
                roleLabel="Caption style"
                font={captionFont}
                weight={captionWeight}
                onFontChange={setCaptionFont}
                onWeightChange={setCaptionWeight}
              />

              {/* Notes */}
              <div>
                <div
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    color: 'var(--muted)',
                    marginBottom: '0.35rem',
                  }}
                >
                  Typography notes
                </div>
                <textarea
                  className="insp-select"
                  placeholder="Use title style for strong hooks. Keep body text clean and readable."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  style={{
                    resize: 'vertical',
                    minHeight: '60px',
                    padding: '9px 11px',
                    lineHeight: 1.4,
                    width: '100%',
                  }}
                />
              </div>

              <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
                {FONT_CATALOG.length} curated fonts available
              </div>
            </div>
          </div>

          <div>
            <SectionLabel>Tone of voice</SectionLabel>
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
            <SectionLabel>Visual direction</SectionLabel>
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
            <SectionLabel>Reference images</SectionLabel>
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
