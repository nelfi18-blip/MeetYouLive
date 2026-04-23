"use client";

import Image from "next/image";

const SIZE_MAP = {
  sm: { icon: 34, text: "1rem" },
  md: { icon: 44, text: "1.22rem" },
  lg: { icon: 58, text: "1.52rem" },
};

export default function Logo({ size = "md" }) {
  const selected = SIZE_MAP[size] || SIZE_MAP.md;

  return (
    <div className="logo-wrap" aria-label="MeetYouLive">
      <Image
        src="/logo.svg"
        alt="MeetYouLive"
        width={selected.icon}
        height={selected.icon}
        className="logo-icon"
        priority
      />
      <span className="logo-text">
        MeetYou<span className="logo-accent">Live</span>
      </span>

      <style jsx>{`
        .logo-wrap {
          display: inline-flex;
          align-items: center;
          gap: 0.58rem;
        }
        .logo-icon {
          filter: drop-shadow(0 0 14px rgba(224,64,251,0.45));
        }
        .logo-text {
          font-size: ${selected.text};
          color: #fff;
          font-weight: 800;
          letter-spacing: -0.03em;
          line-height: 1;
        }
        .logo-accent {
          font-style: italic;
          background: linear-gradient(135deg, #ff2d78 0%, #e040fb 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
      `}</style>
    </div>
  );
}
