import React from 'react';

interface ScolarisLogoProps {
  variant?: 'full' | 'icon' | 'text';
  size?: number | string;
  className?: string;
  colorClass?: string;
  showSubtitle?: boolean;
}

export const ScolarisLogo: React.FC<ScolarisLogoProps> = ({
  variant = 'full',
  size = 36,
  className = '',
  colorClass,
  showSubtitle = false,
}) => {
  const numericSize = typeof size === 'number' ? size : parseInt(String(size), 10) || 36;
  const height = variant === 'full' ? numericSize : numericSize;
  const width = variant === 'full' ? numericSize * 2.8 : numericSize;

  const textColor = colorClass || 'text-slate-900 dark:text-white';
  const iconFill = colorClass || 'text-indigo-600 dark:text-indigo-400';

  if (variant === 'text') {
    return (
      <div className={`flex flex-col ${className}`}>
        <span className={`font-serif font-black tracking-tight leading-none ${textColor}`} style={{ fontSize: `${numericSize * 0.6}px` }}>
          Scolaris AI
        </span>
        {showSubtitle && (
          <span className="text-[9px] font-bold tracking-[0.2em] uppercase text-slate-400 dark:text-slate-500 mt-1">
            Academic Studio
          </span>
        )}
      </div>
    );
  }

  return (
    <div className={`inline-flex items-center gap-2.5 shrink-0 select-none ${className}`}>
      {/* Official Scolaris AI Icon Mark */}
      <svg
        viewBox="0 0 512 400"
        width={numericSize}
        height={numericSize}
        className={`shrink-0 transition-transform duration-300 ${colorClass || 'text-slate-900 dark:text-white'}`}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-label="Scolaris AI Logo"
      >
        <g>
          {/* Mortarboard Diamond Top Outline */}
          <polygon points="256,20 478,130 256,240 34,130" fill="none" stroke="currentColor" strokeWidth="16" strokeLinejoin="round"/>
          
          {/* Vertical Center Divider */}
          <line x1="256" y1="20" x2="256" y2="240" stroke="currentColor" strokeWidth="8" strokeDasharray="8,6"/>

          {/* LEFT: Human Brain Anatomy Folds */}
          <g fill="none" stroke="currentColor" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M 238,48 C 195,43 155,68 125,98 C 100,123 85,148 95,173 C 105,198 135,218 175,228 C 205,236 230,223 240,203" />
            <path d="M 232,73 C 197,78 167,103 147,128 C 132,148 132,173 152,188 C 172,203 207,198 232,178" />
            <path d="M 217,98 C 187,103 172,123 167,148 C 165,168 182,178 207,168" />
            <path d="M 242,98 C 222,108 207,123 212,143 C 217,158 237,153 245,138" />
            <path d="M 192,63 C 172,78 147,108 137,133" />
            <path d="M 167,173 C 147,188 132,198 122,183" />
            <path d="M 222,213 C 197,218 172,208 157,193" />
            <path d="M 242,123 C 232,128 227,138 232,148 C 237,155 245,151 245,143" />
          </g>

          {/* RIGHT: AI Digital Circuit Board / Neural Traces */}
          <g fill="none" stroke="currentColor" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M 272,45 L 332,45 L 382,85 L 422,85" />
            <path d="M 272,80 L 312,80 L 342,110 L 392,110 L 432,135" />
            <path d="M 272,115 L 297,115 L 322,140 L 372,140 L 402,165" />
            <path d="M 272,150 L 312,150 L 337,175 L 382,175" />
            <path d="M 272,185 L 292,185 L 322,215 L 362,215" />
            <path d="M 272,220 L 302,220 L 327,235" />

            <path d="M 332,45 L 332,75" />
            <path d="M 382,85 L 382,125" />
            <path d="M 322,140 L 322,170" />
            <path d="M 372,140 L 372,195" />
            <path d="M 312,80 L 312,130" />

            <rect x="337" y="120" width="22" height="22" fill="currentColor" rx="3" stroke="none"/>
          </g>

          {/* Circuit Connection Nodes (Terminal Dots) */}
          <g fill="currentColor">
            <circle cx="332" cy="45" r="7" />
            <circle cx="422" cy="85" r="7" />
            <circle cx="392" cy="110" r="7" />
            <circle cx="432" cy="135" r="7" />
            <circle cx="402" cy="165" r="7" />
            <circle cx="382" cy="175" r="7" />
            <circle cx="362" cy="215" r="7" />
            <circle cx="327" cy="235" r="7" />
            <circle cx="382" cy="125" r="6" />
            <circle cx="322" cy="170" r="6" />
            <circle cx="312" cy="130" r="6" />
          </g>

          {/* Skullcap Base */}
          <path d="M 144,175 L 256,231 L 368,175 L 368,225 C 368,265 319,300 256,300 C 193,300 144,265 144,225 Z" fill="currentColor"/>
          <path d="M 144,175 L 256,231 L 368,175" fill="none" stroke="currentColor" strokeWidth="8"/>

          {/* Tassel Loop & Dangling String */}
          <circle cx="478" cy="130" r="9" fill="currentColor"/>
          <path d="M 478,139 C 482,185 485,225 482,270" fill="none" stroke="currentColor" strokeWidth="7" strokeLinecap="round"/>
          <circle cx="482" cy="277" r="10" fill="currentColor"/>
          <path d="M 471,287 L 493,287 L 498,345 L 466,345 Z" fill="currentColor"/>
        </g>
      </svg>

      {/* Brand Text for 'full' variant */}
      {variant === 'full' && (
        <div className="flex flex-col justify-center">
          <span 
            className={`font-serif font-bold tracking-tight leading-none ${textColor}`}
            style={{ fontSize: `${numericSize * 0.55}px` }}
          >
            Scolaris<span className="text-indigo-600 dark:text-indigo-400 font-extrabold ml-1">AI</span>
          </span>
          {showSubtitle && (
            <span className="text-[8px] font-bold tracking-[0.2em] uppercase text-slate-400 dark:text-slate-500 mt-0.5">
              Academic Studio
            </span>
          )}
        </div>
      )}
    </div>
  );
};

export default ScolarisLogo;
