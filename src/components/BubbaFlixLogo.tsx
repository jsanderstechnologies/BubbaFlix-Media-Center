import React from 'react';

interface BubbaFlixLogoProps {
  className?: string;
  idPrefix?: string;
  onClick?: () => void;
}

export default function BubbaFlixLogo({ className = "w-44 h-12", idPrefix = "bf", onClick }: BubbaFlixLogoProps) {
  const curveId = `${idPrefix}-curve`;
  const gradId = `${idPrefix}-grad`;
  const glowId = `${idPrefix}-glow`;

  return (
    <svg 
      viewBox="0 0 320 70" 
      className={`select-none drop-shadow-[0_0_20px_rgba(229,9,20,0.35)] ${className}`}
      onClick={onClick}
    >
      <defs>
        <path id={curveId} d="M 12,56 Q 160,20 308,56" fill="none" />
        <linearGradient id={gradId} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#ff4d4d" />
          <stop offset="35%" stopColor="#e50914" />
          <stop offset="75%" stopColor="#b30000" />
          <stop offset="100%" stopColor="#7a0000" />
        </linearGradient>
        <filter id={glowId} x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="3" stdDeviation="2.5" floodColor="#000000" floodOpacity="0.95"/>
          <feDropShadow dx="0" dy="0" stdDeviation="5.5" floodColor="#e50914" floodOpacity="0.45"/>
        </filter>
      </defs>
      <text 
        fontFamily="'Bebas Neue', 'Impact', sans-serif" 
        fontSize="56" 
        fontWeight="900" 
        fill={`url(#${gradId})`} 
        stroke={`url(#${gradId})`} 
        strokeWidth="2.8" 
        strokeLinejoin="round"
        letterSpacing="-1.2"
        filter={`url(#${glowId})`}
      >
        <textPath href={`#${curveId}`} startOffset="50%" textAnchor="middle">
          BUBBAFLIX
        </textPath>
      </text>
    </svg>
  );
}
