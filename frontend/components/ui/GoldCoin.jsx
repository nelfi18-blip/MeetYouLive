"use client";

/**
 * Premium animated gold coin visual used to make coin packages/balances feel
 * tangible and valuable. Purely decorative (aria-hidden) — never carries the
 * real coin amount, which is always rendered as text next to it.
 *
 * - `stacked` renders two extra coins behind the main one for extra depth.
 * - `spin` adds a slow specular shine sweep; disabled automatically when the
 *   user prefers reduced motion.
 */
export default function GoldCoin({ size = 48, stacked = false, spin = true, className = "" }) {
  return (
    <span
      aria-hidden="true"
      className={`gold-coin-wrap ${stacked ? "is-stacked" : ""} ${className}`.trim()}
      style={{ width: size, height: size }}
    >
      {stacked ? (
        <>
          <span className="gold-coin gold-coin-back gold-coin-b" />
          <span className="gold-coin gold-coin-back gold-coin-a" />
        </>
      ) : null}
      <span className={`gold-coin gold-coin-main ${spin ? "gold-coin-shine" : ""}`}>
        <span className="gold-coin-ring" />
        <svg className="gold-coin-symbol" viewBox="0 0 24 24" aria-hidden="true">
          <path
            className="gold-coin-heart-shadow"
            d="M12 19.2s-5.6-3.55-8-6.95C2.2 9.7 3.15 6.9 5.65 6.05c1.7-.58 3.35.1 4.3 1.45.4.56.67 1.1.8 1.4.14-.3.42-.85.82-1.42.95-1.33 2.6-2 4.3-1.43 2.5.85 3.45 3.65 1.65 6.2-2.4 3.4-7.52 6.95-7.52 6.95Z"
          />
          <path
            className="gold-coin-heart-main"
            d="M12 18.4s-5.3-3.36-7.56-6.57C2.6 9.1 3.5 6.5 5.85 5.7c1.6-.55 3.16.1 4.06 1.38.38.53.63 1.04.76 1.33.13-.29.4-.8.78-1.33.9-1.28 2.46-1.93 4.06-1.38 2.35.8 3.26 3.4 1.56 5.82C14.63 15.03 12 18.4 12 18.4Z"
          />
          <path
            className="gold-coin-heart-highlight"
            d="M8.1 7.9c-1.2.08-2.2.86-2.46 2.02"
            fill="none"
          />
        </svg>
      </span>

      <style jsx>{`
        .gold-coin-wrap {
          position: relative;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .gold-coin-wrap.is-stacked {
          margin-left: 0.3em;
        }
        .gold-coin {
          position: absolute;
          inset: 0;
          border-radius: 50%;
          background:
            radial-gradient(circle at 30% 26%, #fff8dd 0%, #ffe9a8 16%, #f7cb5b 36%, #e3a52c 58%, #9c6a12 86%, #7a5109 100%);
          box-shadow:
            inset 0 2px 3px rgba(255, 255, 255, 0.75),
            inset 0 -5px 8px rgba(96, 58, 9, 0.55),
            0 3px 8px rgba(0, 0, 0, 0.45);
          border: 1px solid rgba(255, 229, 153, 0.65);
        }
        .gold-coin-main {
          overflow: hidden;
        }
        .gold-coin-back {
          opacity: 0.85;
          filter: saturate(0.9) brightness(0.92);
        }
        .gold-coin-a {
          transform: translate(-18%, 10%) scale(0.92);
          z-index: 1;
        }
        .gold-coin-b {
          transform: translate(-32%, 20%) scale(0.84);
          z-index: 0;
          opacity: 0.65;
        }
        .gold-coin-main {
          z-index: 2;
        }
        .gold-coin-ring {
          position: absolute;
          inset: 14%;
          border-radius: 50%;
          border: 1.5px dashed rgba(122, 74, 10, 0.4);
          pointer-events: none;
        }
        .gold-coin-symbol {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          padding: 28%;
          box-sizing: border-box;
        }
        .gold-coin-heart-shadow {
          fill: rgba(96, 58, 9, 0.55);
          transform: translate(0.4px, 1.1px);
        }
        .gold-coin-heart-main {
          fill: #7a4a0a;
        }
        .gold-coin-heart-highlight {
          stroke: rgba(255, 244, 214, 0.7);
          stroke-width: 0.9;
          stroke-linecap: round;
        }
        .gold-coin-shine::after {
          content: "";
          position: absolute;
          top: -60%;
          left: -160%;
          width: 55%;
          height: 220%;
          background: linear-gradient(105deg, transparent, rgba(255, 255, 255, 0.75), transparent);
          transform: rotate(18deg);
          animation: gold-coin-shine-sweep 3.4s ease-in-out infinite;
        }
        @keyframes gold-coin-shine-sweep {
          0% {
            left: -160%;
          }
          42% {
            left: 160%;
          }
          100% {
            left: 160%;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .gold-coin-shine::after {
            animation: none !important;
            display: none;
          }
        }
      `}</style>
    </span>
  );
}
