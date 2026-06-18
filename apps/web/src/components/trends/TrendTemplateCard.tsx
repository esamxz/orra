import { useState } from 'react';

// ---------------------------------------------------------------------------
// Orra — Trend template visual card
// ---------------------------------------------------------------------------
// Compact image-preview card for trend/style templates. Background image from
// template.previewUrl with a calm fallback gradient. No prompt text is rendered.
// The whole card is a keyboard-accessible button.

export type TrendTemplateCardSize = 'sm' | 'md';

export interface TrendTemplateCardProps {
  title: string;
  label?: string | null;
  previewUrl?: string | null;
  disabled?: boolean;
  size?: TrendTemplateCardSize;
  onClick?: () => void;
  className?: string;
}

function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}

const HEIGHT_BY_SIZE: Record<TrendTemplateCardSize, string> = {
  sm: 'h-[200px]',
  md: 'h-[240px]',
};

export function TrendTemplateCard({
  title,
  label,
  previewUrl,
  disabled = false,
  size = 'md',
  onClick,
  className,
}: TrendTemplateCardProps) {
  const [imageError, setImageError] = useState(false);
  const hasPreview = Boolean(previewUrl) && !imageError;
  const displayLabel = label?.trim() || 'Template';

  return (
    <button
      type="button"
      className={cn(
        'group relative w-full overflow-hidden rounded-2xl text-left outline-none',
        'border border-[rgba(164,183,189,0.32)]',
        'shadow-[0_1px_2px_rgba(29,42,48,0.05)]',
        'transition-all duration-200 ease-out',
        'hover:-translate-y-1 hover:shadow-[0_4px_8px_rgba(29,42,48,0.05),0_18px_48px_rgba(29,42,48,0.10)]',
        'focus-visible:ring-2 focus-visible:ring-[#5e7680] focus-visible:ring-offset-2 focus-visible:ring-offset-[#eceff0]',
        'disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0',
        HEIGHT_BY_SIZE[size],
        className
      )}
      onClick={onClick}
      disabled={disabled}
      aria-label={`Use ${title} trend template`}
    >
      {/* Preview image or fallback gradient */}
      {hasPreview ? (
        <img
          src={previewUrl!}
          alt={title}
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
          onError={() => setImageError(true)}
        />
      ) : (
        <div
          className="absolute inset-0 bg-gradient-to-br from-[#1d2a30] via-[#354e53] to-[#5e7680]"
          aria-hidden="true"
        />
      )}

      {/* Bottom gradient overlay for text readability */}
      <div
        className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-transparent"
        aria-hidden="true"
      />

      {/* Text content */}
      <div className="absolute bottom-0 left-0 right-0 p-4">
        <span className="block text-[10px] font-bold uppercase tracking-[0.12em] text-[#c8d1d8]/80">
          {displayLabel}
        </span>
        <h3 className="mt-1 text-lg font-semibold leading-tight tracking-[-0.01em] text-[#f1f4f4]">
          {title}
        </h3>
      </div>
    </button>
  );
}
