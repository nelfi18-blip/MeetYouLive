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
        <span className="gold-coin-symbol">¢</span>
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
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 800;
          font-size: 0.52em;
          line-height: 1;
          color: #7a4a0a;
          text-shadow: 0 1px 0 rgba(255, 244, 214, 0.6);
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
