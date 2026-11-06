import React from 'react';
import { BRAND_NAME, TAGLINE } from '../lib/brand';

interface KorsIQLogoProps {
  variant?: 'full' | 'icon' | 'text';
  size?: number | string;
  className?: string;
  /** Use on backgrounds that are always dark (swaps to the light version of the mark and wordmark). */
  onDark?: boolean;
  /** Overrides the wordmark text colour. */
  colorClass?: string;
  showSubtitle?: boolean;
}

const Mark: React.FC<{ size: number; onDark?: boolean }> = ({ size, onDark }) => {
  const common = { width: size, height: size, draggable: false, className: 'shrink-0 select-none' } as const;
  if (onDark) {
    return <img src="/korsiq-logo-light.png" alt={`${BRAND_NAME} logo`} {...common} />;
  }
  return (
    <>
      <img src="/korsiq-logo.png" alt={`${BRAND_NAME} logo`} {...common} className={`${common.className} dark:hidden`} />
      <img src="/korsiq-logo-light.png" alt="" aria-hidden="true" {...common} className={`${common.className} hidden dark:block`} />
    </>
  );
};

export const KorsIQLogo: React.FC<KorsIQLogoProps> = ({
  variant = 'full',
  size = 36,
  className = '',
  onDark = false,
  colorClass,
  showSubtitle = false,
}) => {
  const numericSize = typeof size === 'number' ? size : parseInt(String(size), 10) || 36;
  const textColor = colorClass || (onDark ? 'text-white' : 'text-slate-900 dark:text-white');
  const accent = onDark ? 'text-blue-400' : 'text-blue-600 dark:text-blue-400';

  const wordmark = (fontPx: number) => (
    <span className={`font-serif font-black tracking-tight leading-none ${textColor}`} style={{ fontSize: `${fontPx}px` }}>
      Kors<span className={accent}>IQ</span>
    </span>
  );

  if (variant === 'icon') {
    return (
      <span className={`inline-flex shrink-0 ${className}`}>
        <Mark size={numericSize} onDark={onDark} />
      </span>
    );
  }

  if (variant === 'text') {
    return (
      <div className={`flex flex-col ${className}`}>
        {wordmark(numericSize * 0.6)}
        {showSubtitle && (
          <span className="text-[9px] font-bold tracking-[0.2em] uppercase text-slate-400 dark:text-slate-500 mt-1">
            {TAGLINE.replace(/\.$/, '')}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className={`inline-flex items-center gap-2.5 shrink-0 select-none ${className}`}>
      <Mark size={numericSize} onDark={onDark} />
      <div className="flex flex-col">
        {wordmark(numericSize * 0.62)}
        {showSubtitle && (
          <span className="text-[9px] font-bold tracking-[0.2em] uppercase text-slate-400 dark:text-slate-500 mt-1">
            {TAGLINE.replace(/\.$/, '')}
          </span>
        )}
      </div>
    </div>
  );
};

export default KorsIQLogo;
