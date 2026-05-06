"use client";

import { motion } from "framer-motion";
import { useState } from "react";

export default function SwipeActions({ 
  onRewind, 
  onPass, 
  onStar, 
  onLike, 
  onBoost,
  canRewind = true,
  disabled = false 
}) {
  const [activeButton, setActiveButton] = useState(null);

  const handleButtonClick = (action, callback) => {
    if (disabled) return;
    setActiveButton(action);
    callback?.();
    setTimeout(() => setActiveButton(null), 300);
  };

  const buttonVariants = {
    initial: { scale: 1 },
    active: { scale: 0.85 },
    hover: { scale: 1.1 }
  };

  return (
    <div className="swipe-actions-modern">
      {/* Rewind Button */}
      <motion.button
        className={`swipe-action-btn swipe-action-rewind ${!canRewind ? 'disabled' : ''}`}
        onClick={() => handleButtonClick('rewind', onRewind)}
        disabled={!canRewind || disabled}
        variants={buttonVariants}
        initial="initial"
        animate={activeButton === 'rewind' ? 'active' : 'initial'}
        whileHover={!disabled && canRewind ? "hover" : {}}
        whileTap={!disabled && canRewind ? "active" : {}}
      >
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 7v6h6"/>
          <path d="M21 17a9 9 0 00-9-9 9 9 0 00-6 2.3L3 13"/>
        </svg>
      </motion.button>

      {/* Pass Button */}
      <motion.button
        className="swipe-action-btn swipe-action-pass"
        onClick={() => handleButtonClick('pass', onPass)}
        disabled={disabled}
        variants={buttonVariants}
        initial="initial"
        animate={activeButton === 'pass' ? 'active' : 'initial'}
        whileHover={!disabled ? "hover" : {}}
        whileTap={!disabled ? "active" : {}}
      >
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"/>
          <line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </motion.button>

      {/* Star Button */}
      <motion.button
        className="swipe-action-btn swipe-action-star"
        onClick={() => handleButtonClick('star', onStar)}
        disabled={disabled}
        variants={buttonVariants}
        initial="initial"
        animate={activeButton === 'star' ? 'active' : 'initial'}
        whileHover={!disabled ? "hover" : {}}
        whileTap={!disabled ? "active" : {}}
      >
        <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" stroke="none">
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
        </svg>
      </motion.button>

      {/* Like Button */}
      <motion.button
        className="swipe-action-btn swipe-action-like"
        onClick={() => handleButtonClick('like', onLike)}
        disabled={disabled}
        variants={buttonVariants}
        initial="initial"
        animate={activeButton === 'like' ? 'active' : 'initial'}
        whileHover={!disabled ? "hover" : {}}
        whileTap={!disabled ? "active" : {}}
      >
        <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor" stroke="none">
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
        </svg>
      </motion.button>

      {/* Boost Button */}
      <motion.button
        className="swipe-action-btn swipe-action-boost"
        onClick={() => handleButtonClick('boost', onBoost)}
        disabled={disabled}
        variants={buttonVariants}
        initial="initial"
        animate={activeButton === 'boost' ? 'active' : 'initial'}
        whileHover={!disabled ? "hover" : {}}
        whileTap={!disabled ? "active" : {}}
      >
        <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" stroke="none">
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
        </svg>
      </motion.button>
    </div>
  );
}
