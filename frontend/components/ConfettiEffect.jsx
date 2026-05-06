"use client";

import { useEffect, useRef } from 'react';

/**
 * Confetti celebration effect
 * Triggered on successful actions (matches, gifts, etc.)
 */
export default function ConfettiEffect({ active = false, onComplete }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!active) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const confetti = [];
    const confettiCount = 150;
    const gravity = 0.5;
    const terminalVelocity = 5;
    const drag = 0.075;
    const colors = [
      '#e040fb', '#ff4fa3', '#22d3ee', '#7c3aed', 
      '#fbbf24', '#34d399', '#fb923c'
    ];

    class ConfettiPiece {
      constructor() {
        this.x = Math.random() * canvas.width;
        this.y = -20;
        this.w = Math.random() * 8 + 5;
        this.h = Math.random() * 6 + 3;
        this.d = Math.random() * confettiCount;
        this.color = colors[Math.floor(Math.random() * colors.length)];
        this.tilt = Math.floor(Math.random() * 10) - 10;
        this.tiltAngleIncremental = (Math.random() * 0.07) + 0.05;
        this.tiltAngle = 0;
        this.velocityY = Math.random() * 3 + 4;
        this.velocityX = Math.random() * 2 - 1;
      }

      update() {
        this.tiltAngle += this.tiltAngleIncremental;
        this.y += this.velocityY;
        this.x += this.velocityX;
        this.velocityY += gravity;
        this.velocityY = Math.min(this.velocityY, terminalVelocity);
        this.velocityX *= (1 - drag);
        this.tilt = Math.sin(this.tiltAngle) * 15;
      }

      draw() {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.tilt * Math.PI / 180);
        ctx.fillStyle = this.color;
        ctx.fillRect(-this.w / 2, -this.h / 2, this.w, this.h);
        ctx.restore();
      }
    }

    // Initialize confetti
    for (let i = 0; i < confettiCount; i++) {
      confetti.push(new ConfettiPiece());
    }

    let animationFrameId;
    let startTime = Date.now();

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      confetti.forEach((piece, index) => {
        piece.update();
        piece.draw();

        // Remove pieces that have fallen off screen
        if (piece.y > canvas.height) {
          confetti.splice(index, 1);
        }
      });

      // Stop after 3 seconds or all confetti gone
      if (confetti.length > 0 && Date.now() - startTime < 3000) {
        animationFrameId = requestAnimationFrame(animate);
      } else {
        if (onComplete) onComplete();
      }
    };

    animate();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [active, onComplete]);

  if (!active) return null;

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 9999
      }}
    />
  );
}
