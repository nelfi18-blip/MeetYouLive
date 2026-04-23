"use client";

import Image from "next/image";

const SIZE_MAP = {
  sm: { icon: 52, iconH: 36, name: "1.3rem" },
  md: { icon: 66, iconH: 46, name: "1.65rem" },
  lg: { icon: 82, iconH: 58, name: "2rem" },
};

/**
 * Shared brand logo block for auth screens.
 * Renders: icon → "MeetYouLive" name → "CONECTA • EN VIVO • VIVE" tagline
 * Zero functional logic – purely visual.
 */
export default function AuthBrandLogo({ size = "md" }) {
  const s = SIZE_MAP[size] || SIZE_MAP.md;

  return (
    <div className="auth-brand">
      <Image
        src="/logo.svg"
        alt="MeetYouLive"
        width={s.icon}
        height={s.iconH}
        priority
        className="auth-brand-icon"
      />
      <div className="auth-brand-name">
        MeetYou<span className="auth-brand-live">Live</span>
      </div>
      <div className="auth-brand-tagline">
        CONECTA&nbsp;•&nbsp;EN&nbsp;VIVO&nbsp;•&nbsp;VIVE
      </div>

      <style jsx>{`
        .auth-brand {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.25rem;
        }
        .auth-brand-icon {
          filter: drop-shadow(0 0 22px rgba(255, 26, 140, 0.65))
                  drop-shadow(0 0 44px rgba(64, 80, 255, 0.35));
          margin-bottom: 0.3rem;
        }
        .auth-brand-name {
          font-size: ${s.name};
          font-weight: 800;
          letter-spacing: -0.04em;
          color: #ffffff;
          line-height: 1;
        }
        .auth-brand-live {
          font-style: italic;
          background: linear-gradient(135deg, #ff2d78 0%, #e040fb 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        .auth-brand-tagline {
          font-size: 0.6rem;
          font-weight: 700;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          background: linear-gradient(90deg, #ff2d78 0%, #e040fb 55%, #818cf8 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          margin-top: 0.2rem;
        }
      `}</style>
    </div>
  );
}
