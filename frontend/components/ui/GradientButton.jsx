"use client";

import Link from "next/link";

export default function GradientButton({
  children,
  href,
  className = "",
  type = "button",
  disabled = false,
  onClick,
  variant = "primary",
}) {
  const classes = `gbtn gbtn-${variant} ${className}`.trim();

  if (href) {
    return (
      <>
        <Link href={href} className={classes}>{children}</Link>
        <ButtonStyles />
      </>
    );
  }

  return (
    <>
      <button type={type} className={classes} disabled={disabled} onClick={onClick}>
        {children}
      </button>
      <ButtonStyles />
    </>
  );
}

function ButtonStyles() {
  return (
    <style jsx global>{`
      .gbtn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 0.5rem;
        width: 100%;
        padding: 0.9rem 1.1rem;
        border-radius: 14px;
        border: 1px solid transparent;
        font-size: 0.92rem;
        font-weight: 700;
        line-height: 1.2;
        cursor: pointer;
        transition: transform var(--transition), filter var(--transition), box-shadow var(--transition-slow), border-color var(--transition);
        text-decoration: none;
      }
      .gbtn:disabled {
        opacity: 0.5;
        pointer-events: none;
      }
      .gbtn-primary {
        color: #fff;
        background: linear-gradient(135deg, #ff2d78 0%, #c040ff 55%, #5b6cff 100%);
        box-shadow: 0 10px 34px rgba(224, 64, 251, 0.36);
      }
      .gbtn-primary:hover {
        transform: translateY(-2px);
        filter: brightness(1.06);
        box-shadow: 0 14px 42px rgba(224, 64, 251, 0.5);
      }
      .gbtn-ghost {
        color: var(--text);
        background: rgba(255, 255, 255, 0.06);
        border-color: rgba(255, 255, 255, 0.16);
      }
      .gbtn-ghost:hover {
        transform: translateY(-2px);
        border-color: rgba(224, 64, 251, 0.42);
        box-shadow: 0 10px 28px rgba(224, 64, 251, 0.2);
      }
    `}</style>
  );
}
