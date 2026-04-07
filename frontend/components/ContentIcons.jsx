export function VideoIcon({ size = 10 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="23 7 16 12 23 17 23 7" />
      <rect x="1" y="5" width="15" height="14" rx="2" />
    </svg>
  );
}

export function PhotoIcon({ size = 10 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </svg>
  );
}

export function TypeBadge({ type, className = "" }) {
  return (
    <span className={`type-badge-root ${className}`}>
      {type === "video" ? <><VideoIcon /><span>Vídeo</span></> : <><PhotoIcon /><span>Foto</span></>}
      <style jsx>{`
        .type-badge-root {
          display: inline-flex;
          align-items: center;
          gap: 0.25rem;
        }
      `}</style>
    </span>
  );
}
