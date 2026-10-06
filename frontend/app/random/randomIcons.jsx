// Lightweight inline SVG icon set for the Random stage controls.
// Presentational only — no new dependency, replaces the previous emoji
// icons with accessible, visually coherent strokes matching the premium
// violet/magenta/electric-blue direction.

const base = {
  width: 22,
  height: 22,
  viewBox: "0 0 24 24",
  fill: "none",
  "aria-hidden": "true",
};

export function MicIcon(props) {
  return (
    <svg {...base} {...props}>
      <rect x="9" y="2.5" width="6" height="11" rx="3" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3.5M9 21.5h6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function MicOffIcon(props) {
  return (
    <svg {...base} {...props}>
      <path
        d="M9 5a3 3 0 0 1 6 0v6c0 .51-.1 1-.28 1.44M12 13.5a3 3 0 0 1-3-3v-1"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M5.5 11.5a6.5 6.5 0 0 0 9.9 5.53M18.5 11.5a6.48 6.48 0 0 1-.78 3.1M12 18v3.5M9 21.5h6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path d="M3.5 3.5l17 17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function CameraIcon(props) {
  return (
    <svg {...base} {...props}>
      <rect x="2.5" y="6.5" width="13" height="11" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M15.5 10.2l4.6-2.6a.8.8 0 0 1 1.2.7v7.4a.8.8 0 0 1-1.2.7l-4.6-2.6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function CameraOffIcon(props) {
  return (
    <svg {...base} {...props}>
      <path
        d="M2.5 9v8.5A2.5 2.5 0 0 0 5 20h8l2-2M15.5 10.2l4.6-2.6a.8.8 0 0 1 1.2.7v7.4a.8.8 0 0 1-1.2.7l-4.6-2.6M9.5 6.5h3.5A2.5 2.5 0 0 1 15.5 9v2"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M3.5 3.5l17 17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function SwitchCameraIcon(props) {
  return (
    <svg {...base} {...props}>
      <path
        d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path
        d="M9 13.2a3 3 0 0 1 5.5-1.6M15 13.2a3 3 0 0 1-5.5 1.6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path d="M14 10.8l.9.9.9-1.5M10 15.6l-.9-.9-.9 1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function NextIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M5 5l7 7-7 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13 5l7 7-7 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ExitIcon(props) {
  return (
    <svg {...base} {...props}>
      <path
        d="M9 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M14 8l4 4-4 4M18 12H9" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function SafetyIcon(props) {
  return (
    <svg {...base} {...props}>
      <path
        d="M12 2.5l7.5 3v5.3c0 5-3.2 8.7-7.5 10.2-4.3-1.5-7.5-5.2-7.5-10.2V5.5l7.5-3z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M9 12l2 2 4-4.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function PersonIcon(props) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="8" r="3.4" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M5 19.5c0-3.6 3.1-6.2 7-6.2s7 2.6 7 6.2"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function CloseIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}
