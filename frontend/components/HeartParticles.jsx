"use client";

import { useEffect, useRef } from 'react';

/**
 * Heart particle explosion effect for likes
 * Displays when user likes a profile
 */
export default function HeartParticles({ active = false, position = { x: 0, y: 0 }, onComplete }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!active) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const particles = [];
    const particleCount = 30;
    const colors = ['#e040fb', '#ff4fa3', '#c040ff', '#ff6bb8', '#ff9bde'];

    class HeartParticle {
      constructor() {
        this.x = position.x;
        this.y = position.y;
        this.size = Math.random() * 15 + 10;
        this.speedX = (Math.random() - 0.5) * 8;
        this.speedY = (Math.random() - 0.5) * 8 - 3;
        this.color = colors[Math.floor(Math.random() * colors.length)];
        this.gravity = 0.3;
        this.opacity = 1;
        this.fadeRate = Math.random() * 0.02 + 0.01;
        this.rotation = Math.random() * 360;
        this.rotationSpeed = (Math.random() - 0.5) * 10;
      }

      update() {
        this.speedY += this.gravity;
        this.x += this.speedX;
        this.y += this.speedY;
        this.opacity -= this.fadeRate;
        this.rotation += this.rotationSpeed;
      }

      draw() {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rotation * Math.PI / 180);
        ctx.globalAlpha = this.opacity;

        // Draw heart shape
        ctx.fillStyle = this.color;
        ctx.beginPath();
        const size = this.size;
        ctx.moveTo(0, size * 0.3);
        ctx.bezierCurveTo(-size * 0.5, -size * 0.2, -size, 0, 0, size * 0.8);
        ctx.bezierCurveTo(size, 0, size * 0.5, -size * 0.2, 0, size * 0.3);
        ctx.fill();

        // Add glow
        ctx.shadowBlur = 20;
        ctx.shadowColor = this.color;
        ctx.fill();

        ctx.restore();
      }
    }

    // Initialize particles
    for (let i = 0; i < particleCount; i++) {
      particles.push(new HeartParticle());
    }

    let animationFrameId;
    let startTime = Date.now();

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      particles.forEach((particle, index) => {
        particle.update();
        particle.draw();

        // Remove dead particles
        if (particle.opacity <= 0) {
          particles.splice(index, 1);
        }
      });

      // Stop after 2 seconds or all particles gone
      if (particles.length > 0 && Date.now() - startTime < 2000) {
        animationFrameId = requestAnimationFrame(animate);
      } else {
        if (onComplete) onComplete();
      }
    };

    animate();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [active, position, onComplete]);

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
        zIndex: 9998
      }}
    />
  );
}
