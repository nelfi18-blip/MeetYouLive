"use client";

import { useState, useRef, useEffect } from "react";

// Typing timeout duration in milliseconds
const TYPING_TIMEOUT_MS = 2000;

/**
 * SmartChatInput - Advanced chat input with emoji picker, typing indicator, and suggestions
 * Enhanced input field for both private chat and live chat
 */
export default function SmartChatInput({
  value,
  onChange,
  onSubmit,
  placeholder = "Escribe un mensaje...",
  disabled = false,
  onTyping = null,
  maxLength = 2000,
  showGiftButton = false,
  onGiftClick = null,
}) {
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  const emojis = [
    "😀", "😂", "❤️", "🔥", "👍", "👏",
    "😍", "🎉", "💎", "✨", "🌟", "⚡",
    "💯", "🙌", "💪", "😎", "🤩", "😭",
  ];

  const handleInputChange = (e) => {
    const newValue = e.target.value;
    onChange(newValue);

    // Notify typing
    if (onTyping) {
      onTyping(true);
      
      // Clear existing timeout
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }

      // Stop typing after inactivity
      typingTimeoutRef.current = setTimeout(() => {
        onTyping(false);
      }, TYPING_TIMEOUT_MS);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (value.trim() && !disabled) {
      onSubmit(e);
      setShowEmojiPicker(false);
      
      // Stop typing indicator
      if (onTyping) {
        onTyping(false);
      }
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    }
  };

  const insertEmoji = (emoji) => {
    const newValue = value + emoji;
    onChange(newValue);
    inputRef.current?.focus();
    setShowEmojiPicker(false);
  };

  const charCount = value.length;
  const isNearLimit = charCount > maxLength * 0.8;

  return (
    <>
      <form className={`smart-chat-input ${isFocused ? "focused" : ""}`} onSubmit={handleSubmit}>
        {/* Left buttons */}
        <div className="input-controls left">
          {showGiftButton && (
            <button
              type="button"
              className="control-btn gift-btn"
              onClick={onGiftClick}
              title="Enviar regalo"
            >
              🎁
            </button>
          )}
          
          <button
            type="button"
            className={`control-btn emoji-btn ${showEmojiPicker ? "active" : ""}`}
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            title="Emojis"
          >
            😊
          </button>
        </div>

        {/* Input field */}
        <div className="input-wrapper">
          <input
            ref={inputRef}
            className="chat-input"
            type="text"
            value={value}
            onChange={handleInputChange}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder={placeholder}
            maxLength={maxLength}
            disabled={disabled}
          />
          
          {isNearLimit && (
            <span className={`char-count ${charCount >= maxLength ? "limit" : ""}`}>
              {charCount}/{maxLength}
            </span>
          )}
        </div>

        {/* Send button */}
        <button
          type="submit"
          className={`send-btn ${value.trim() && !disabled ? "active" : ""}`}
          disabled={!value.trim() || disabled}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>

        {/* Emoji picker */}
        {showEmojiPicker && (
          <div className="emoji-picker-popup animate-bounce-in">
            <div className="emoji-grid">
              {emojis.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  className="emoji-option"
                  onClick={() => insertEmoji(emoji)}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        )}
      </form>

      <style jsx>{`
        .smart-chat-input {
          display: flex;
          align-items: center;
          gap: 0.6rem;
          padding: 0.8rem 1rem;
          background: linear-gradient(135deg, rgba(20, 8, 42, 0.95) 0%, rgba(15, 8, 33, 0.95) 100%);
          border: 1.5px solid rgba(139, 92, 246, 0.3);
          border-radius: var(--radius);
          backdrop-filter: blur(16px);
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          position: relative;
        }

        .smart-chat-input.focused {
          border-color: rgba(224, 64, 251, 0.6);
          box-shadow: 0 0 20px rgba(224, 64, 251, 0.2), 0 4px 12px rgba(0, 0, 0, 0.3);
        }

        .input-controls {
          display: flex;
          gap: 0.4rem;
          align-items: center;
        }

        .control-btn {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          background: rgba(139, 92, 246, 0.1);
          border: 1px solid rgba(139, 92, 246, 0.25);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.2s;
          font-size: 1.2rem;
        }

        .control-btn:hover {
          background: rgba(139, 92, 246, 0.2);
          border-color: rgba(139, 92, 246, 0.4);
          transform: scale(1.05);
        }

        .control-btn.active {
          background: rgba(224, 64, 251, 0.25);
          border-color: rgba(224, 64, 251, 0.5);
          box-shadow: 0 0 12px rgba(224, 64, 251, 0.3);
        }

        .input-wrapper {
          flex: 1;
          position: relative;
          display: flex;
          align-items: center;
        }

        .chat-input {
          width: 100%;
          background: rgba(15, 8, 33, 0.6);
          border: 1px solid rgba(139, 92, 246, 0.2);
          border-radius: 999px;
          padding: 0.7rem 1rem;
          color: var(--text);
          font-size: 0.9rem;
          transition: all 0.2s;
        }

        .chat-input:focus {
          outline: none;
          border-color: rgba(224, 64, 251, 0.4);
          background: rgba(15, 8, 33, 0.8);
        }

        .chat-input::placeholder {
          color: var(--text-dim);
        }

        .chat-input:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .char-count {
          position: absolute;
          right: 1rem;
          font-size: 0.7rem;
          color: var(--text-dim);
          font-weight: 600;
          pointer-events: none;
        }

        .char-count.limit {
          color: var(--error);
          animation: limitPulse 1s ease-in-out infinite;
        }

        @keyframes limitPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.6; }
        }

        .send-btn {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          background: rgba(139, 92, 246, 0.2);
          border: 1.5px solid rgba(139, 92, 246, 0.3);
          color: var(--text-muted);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .send-btn:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }

        .send-btn.active {
          background: linear-gradient(135deg, rgba(224, 64, 251, 0.4), rgba(139, 92, 246, 0.4));
          border-color: rgba(224, 64, 251, 0.6);
          color: #fff;
          box-shadow: 0 0 16px rgba(224, 64, 251, 0.4);
        }

        .send-btn.active:hover {
          transform: scale(1.1) rotate(15deg);
          box-shadow: 0 0 24px rgba(224, 64, 251, 0.6);
        }

        .emoji-picker-popup {
          position: absolute;
          bottom: calc(100% + 0.75rem);
          left: 4rem;
          background: linear-gradient(135deg, rgba(30, 12, 60, 0.98) 0%, rgba(20, 12, 46, 0.98) 100%);
          border: 1.5px solid rgba(139, 92, 246, 0.4);
          border-radius: 12px;
          padding: 0.8rem;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5), 0 0 20px rgba(139, 92, 246, 0.3);
          backdrop-filter: blur(16px);
          z-index: 100;
        }

        .emoji-grid {
          display: grid;
          grid-template-columns: repeat(6, 1fr);
          gap: 0.5rem;
          max-width: 280px;
        }

        .emoji-option {
          width: 40px;
          height: 40px;
          background: transparent;
          border: none;
          cursor: pointer;
          font-size: 1.4rem;
          transition: transform 0.2s;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .emoji-option:hover {
          transform: scale(1.3);
          background: rgba(139, 92, 246, 0.15);
        }
      `}</style>
    </>
  );
}
