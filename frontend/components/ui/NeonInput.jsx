"use client";

export default function NeonInput({
  type = "text",
  value,
  onChange,
  onKeyDown,
  placeholder,
  icon,
  endSlot,
  autoComplete,
}) {
  return (
    <div className="ninput-wrap">
      {icon ? <span className="ninput-icon">{icon}</span> : null}
      <input
        type={type}
        className={`ninput ${icon ? "ninput-with-icon" : ""} ${endSlot ? "ninput-with-end" : ""}`}
        value={value}
        onChange={onChange}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        autoComplete={autoComplete}
      />
      {endSlot ? <span className="ninput-end">{endSlot}</span> : null}

      <style jsx>{`
        .ninput-wrap {
          position: relative;
          display: flex;
          align-items: center;
        }
        .ninput {
          width: 100%;
          min-height: 48px;
          border-radius: 14px;
          border: 1px solid rgba(139, 92, 246, 0.28);
          background: rgba(8, 5, 20, 0.84);
          color: var(--text);
          font-size: 0.92rem;
          font-family: inherit;
          outline: none;
          padding: 0.75rem 0.95rem;
          transition: border-color var(--transition), box-shadow var(--transition), background var(--transition);
        }
        .ninput::placeholder {
          color: rgba(148, 163, 184, 0.8);
        }
        .ninput:hover {
          border-color: rgba(224, 64, 251, 0.42);
        }
        .ninput:focus {
          border-color: rgba(224, 64, 251, 0.68);
          background: rgba(13, 8, 30, 0.94);
          box-shadow: 0 0 0 3px rgba(224, 64, 251, 0.16), 0 0 18px rgba(224, 64, 251, 0.16);
        }
        .ninput-with-icon {
          padding-left: 2.75rem;
        }
        .ninput-with-end {
          padding-right: 2.85rem;
        }
        .ninput-icon,
        .ninput-end {
          position: absolute;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          color: #c4b5fd;
          pointer-events: none;
        }
        .ninput-icon {
          left: 0.9rem;
        }
        .ninput-end {
          right: 0.75rem;
          pointer-events: auto;
        }
        .ninput-icon :global(svg),
        .ninput-end :global(svg) {
          width: 18px;
          height: 18px;
        }
      `}</style>
    </div>
  );
}
