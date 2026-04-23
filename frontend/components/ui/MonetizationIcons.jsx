"use client";

function IconBase({ children, size = 18, className = "", strokeWidth = 1.9 }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export function WalletIcon(props) {
  return <IconBase {...props}><path d="M3 8.5A2.5 2.5 0 0 1 5.5 6h12A2.5 2.5 0 0 1 20 8.5V9" /><path d="M3 8.5v9A2.5 2.5 0 0 0 5.5 20h13a2.5 2.5 0 0 0 2.5-2.5v-6A2.5 2.5 0 0 0 18.5 9h-13A2.5 2.5 0 0 0 3 11.5" /><circle cx="16.8" cy="14.5" r="1" /></IconBase>;
}

export function CoinIcon(props) {
  return <IconBase {...props}><ellipse cx="12" cy="12" rx="8" ry="6.5" /><path d="M8.8 10.6c.55-.7 1.86-1.2 3.2-1.2 1.65 0 2.8.73 2.8 1.8 0 2.7-6 1.2-6 3.6 0 1.05 1.07 1.8 2.8 1.8 1.23 0 2.36-.4 3.1-1.05" /></IconBase>;
}

export function SparkIcon(props) {
  return <IconBase {...props}><path d="M12 3.8 14.4 9l5.6.56-4.2 3.66L17 19l-5-2.95L7 19l1.2-5.78L4 9.56 9.6 9 12 3.8Z" /></IconBase>;
}

export function GiftIcon(props) {
  return <IconBase {...props}><path d="M20 12v7a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-7" /><path d="M2.5 7.5h19v4h-19z" /><path d="M12 7.5V20" /><path d="M8.6 7.5c-1.38 0-2.6-.92-2.6-2.22C6 3.9 7.08 3 8.27 3c1.9 0 3.73 2.48 3.73 4.5" /><path d="M15.4 7.5c1.38 0 2.6-.92 2.6-2.22C18 3.9 16.92 3 15.73 3 13.83 3 12 5.48 12 7.5" /></IconBase>;
}

export function VideoIcon(props) {
  return <IconBase {...props}><rect x="3" y="6" width="13" height="12" rx="2" /><path d="m16 10 5-3v10l-5-3" /></IconBase>;
}

export function LockIcon(props) {
  return <IconBase {...props}><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V8a4 4 0 1 1 8 0v3" /></IconBase>;
}

export function ArrowRightIcon(props) {
  return <IconBase {...props}><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></IconBase>;
}

export function HistoryIcon(props) {
  return <IconBase {...props}><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v4h4" /><path d="M12 8v4l2.6 1.7" /></IconBase>;
}

export function ShieldIcon(props) {
  return <IconBase {...props}><path d="M12 3 5 6v6c0 5 3.3 8.3 7 9 3.7-.7 7-4 7-9V6z" /><path d="m9.3 12.2 1.7 1.7 3.8-3.9" /></IconBase>;
}

export function TrendUpIcon(props) {
  return <IconBase {...props}><path d="M4 17 10 11l4 4 6-7" /><path d="M20 11V8h-3" /></IconBase>;
}

export function CardIcon(props) {
  return <IconBase {...props}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18" /><path d="M7 15h4" /></IconBase>;
}

export function ActivityIcon(props) {
  return <IconBase {...props}><path d="M3 12h4l2-4 4 8 2-4h6" /></IconBase>;
}

export function CheckCircleIcon(props) {
  return <IconBase {...props}><circle cx="12" cy="12" r="9" /><path d="m8.8 12.2 2.3 2.3 4.2-4.2" /></IconBase>;
}

export function AlertIcon(props) {
  return <IconBase {...props}><circle cx="12" cy="12" r="9" /><path d="M12 8v5" /><circle cx="12" cy="16.8" r=".8" fill="currentColor" stroke="none" /></IconBase>;
}

export function EmptyStateIcon(props) {
  return <IconBase {...props}><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M8 9h8" /><path d="M8 13h5" /></IconBase>;
}
