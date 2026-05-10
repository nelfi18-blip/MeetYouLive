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
  disabled = false,
  superLikesLeft = 5,
  boostsLeft = 3 
}) {
  const [activeButton, setActiveButton] = useState(null);
  const [showTooltip, setShowTooltip] = useState(null);

  const handleButtonClick = (action, callback) => {
    if (disabled) return;
    
    // Haptic feedback (vibration) on mobile
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(30);
    }
    
    setActiveButton(action);
    callback?.();
    setTimeout(() => setActiveButton(null), 300);
  };

  const buttonVariants = {
    initial: { scale: 1 },
    active: { scale: 0.85 },
    hover: { scale: 1.1 }
  };

  const tooltips = {
    rewind: 'Deshacer último swipe',
    pass: 'FADE - Pasar perfil',
    star: `MAGNET - Super atracción (${superLikesLeft} restantes)`,
    like: 'SPARK - Me gusta',
    boost: `PULSE - Impulsar perfil (${boostsLeft} restantes)`
  };

  return (
    <div className="swipe-actions-modern">
      {/* Rewind Button */}
      <div className="swipe-action-wrapper">
        <motion.button
          className={`swipe-action-btn swipe-action-rewind ${!canRewind ? 'disabled' : ''}`}
          onClick={() => handleButtonClick('rewind', onRewind)}
          disabled={!canRewind || disabled}
          variants={buttonVariants}
          initial="initial"
          animate={activeButton === 'rewind' ? 'active' : 'initial'}
          whileHover={!disabled && canRewind ? "hover" : {}}
          whileTap={!disabled && canRewind ? "active" : {}}
          onMouseEnter={() => setShowTooltip('rewind')}
          onMouseLeave={() => setShowTooltip(null)}
          aria-label={tooltips.rewind}
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 7v6h6"/>
            <path d="M21 17a9 9 0 00-9-9 9 9 0 00-6 2.3L3 13"/>
          </svg>
        </motion.button>
        {showTooltip === 'rewind' && (
          <motion.div
            className="swipe-action-tooltip"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            {tooltips.rewind}
          </motion.div>
        )}
      </div>

      {/* Pass Button */}
      <div className="swipe-action-wrapper">
        <motion.button
          className="swipe-action-btn swipe-action-pass"
          onClick={() => handleButtonClick('pass', onPass)}
          disabled={disabled}
          variants={buttonVariants}
          initial="initial"
          animate={activeButton === 'pass' ? 'active' : 'initial'}
          whileHover={!disabled ? "hover" : {}}
          whileTap={!disabled ? "active" : {}}
          onMouseEnter={() => setShowTooltip('pass')}
          onMouseLeave={() => setShowTooltip(null)}
          aria-label={tooltips.pass}
        >
          {/* FADE - Eclipse style icon */}
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" opacity="0.3" />
            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
          </svg>
        </motion.button>
        {showTooltip === 'pass' && (
          <motion.div
            className="swipe-action-tooltip"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            {tooltips.pass}
          </motion.div>
        )}
      </div>

      {/* Star Button */}
      <div className="swipe-action-wrapper">
        <motion.button
          className="swipe-action-btn swipe-action-star"
          onClick={() => handleButtonClick('star', onStar)}
          disabled={disabled || superLikesLeft <= 0}
          variants={buttonVariants}
          initial="initial"
          animate={activeButton === 'star' ? 'active' : 'initial'}
          whileHover={!disabled && superLikesLeft > 0 ? "hover" : {}}
          whileTap={!disabled && superLikesLeft > 0 ? "active" : {}}
          onMouseEnter={() => setShowTooltip('star')}
          onMouseLeave={() => setShowTooltip(null)}
          aria-label={tooltips.star}
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" stroke="none">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
          </svg>
          {superLikesLeft > 0 && superLikesLeft < 10 && (
            <span className="action-counter">{superLikesLeft}</span>
          )}
        </motion.button>
        {showTooltip === 'star' && (
          <motion.div
            className="swipe-action-tooltip"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            {tooltips.star}
          </motion.div>
        )}
      </div>

      {/* Like Button */}
      <div className="swipe-action-wrapper">
        <motion.button
          className="swipe-action-btn swipe-action-like"
          onClick={() => handleButtonClick('like', onLike)}
          disabled={disabled}
          variants={buttonVariants}
          initial="initial"
          animate={activeButton === 'like' ? 'active' : 'initial'}
          whileHover={!disabled ? "hover" : {}}
          whileTap={!disabled ? "active" : {}}
          onMouseEnter={() => setShowTooltip('like')}
          onMouseLeave={() => setShowTooltip(null)}
          aria-label={tooltips.like}
        >
          <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor" stroke="none">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
          </svg>
        </motion.button>
        {showTooltip === 'like' && (
          <motion.div
            className="swipe-action-tooltip"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            {tooltips.like}
          </motion.div>
        )}
      </div>

      {/* Boost Button */}
      <div className="swipe-action-wrapper">
        <motion.button
          className="swipe-action-btn swipe-action-boost"
          onClick={() => handleButtonClick('boost', onBoost)}
          disabled={disabled || boostsLeft <= 0}
          variants={buttonVariants}
          initial="initial"
          animate={activeButton === 'boost' ? 'active' : 'initial'}
          whileHover={!disabled && boostsLeft > 0 ? "hover" : {}}
          whileTap={!disabled && boostsLeft > 0 ? "active" : {}}
          onMouseEnter={() => setShowTooltip('boost')}
          onMouseLeave={() => setShowTooltip(null)}
          aria-label={tooltips.boost}
        >
          {/* PULSE - Energy Reactor Ring icon */}
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" fill="currentColor" />
            <circle cx="12" cy="12" r="8" opacity="0.5" />
            <circle cx="12" cy="12" r="11" opacity="0.2" />
          </svg>
          {boostsLeft > 0 && boostsLeft < 10 && (
            <span className="action-counter">{boostsLeft}</span>
          )}
        </motion.button>
        {showTooltip === 'boost' && (
          <motion.div
            className="swipe-action-tooltip"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            {tooltips.boost}
          </motion.div>
        )}
      </div>
    </div>
  );
}
