"use client";

/**
 * TypingIndicator - Animated typing indicator for chat
 * Shows when the other user is typing a message
 */
export default function TypingIndicator({ username = "Usuario" }) {
  return (
    <>
      <div className="typing-indicator">
        <div className="typing-avatar">
          {username[0].toUpperCase()}
        </div>
        <div className="typing-bubble">
          <div className="typing-dots">
            <span className="typing-dot"></span>
            <span className="typing-dot"></span>
            <span className="typing-dot"></span>
          </div>
        </div>
      </div>

      <style jsx>{`
        .typing-indicator {
          display: flex;
          align-items: flex-end;
          gap: 0.5rem;
          margin: 0.75rem 0;
          animation: slideInLeft 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }

        @keyframes slideInLeft {
          from {
            opacity: 0;
            transform: translateX(-20px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }

        .typing-avatar {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          background: var(--grad-primary);
          display: flex;
          align-items: center;
          justify-content: center;
          color: #fff;
          font-weight: 800;
          font-size: 0.75rem;
          flex-shrink: 0;
          box-shadow: 0 2px 8px rgba(224, 64, 251, 0.3);
        }

        .typing-bubble {
          background: linear-gradient(135deg, rgba(30, 12, 60, 0.95) 0%, rgba(20, 12, 46, 0.95) 100%);
          border: 1px solid rgba(139, 92, 246, 0.3);
          border-radius: 18px;
          padding: 0.75rem 1rem;
          max-width: 80px;
          box-shadow: 0 2px 12px rgba(0, 0, 0, 0.3);
        }

        .typing-dots {
          display: flex;
          gap: 0.3rem;
          align-items: center;
        }

        .typing-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: var(--accent-2);
          animation: typingBounce 1.4s ease-in-out infinite;
          box-shadow: 0 0 8px rgba(224, 64, 251, 0.4);
        }

        .typing-dot:nth-child(1) {
          animation-delay: 0s;
        }

        .typing-dot:nth-child(2) {
          animation-delay: 0.2s;
        }

        .typing-dot:nth-child(3) {
          animation-delay: 0.4s;
        }

        @keyframes typingBounce {
          0%, 60%, 100% {
            transform: translateY(0);
            opacity: 0.7;
          }
          30% {
            transform: translateY(-8px);
            opacity: 1;
          }
        }
      `}</style>
    </>
  );
}
