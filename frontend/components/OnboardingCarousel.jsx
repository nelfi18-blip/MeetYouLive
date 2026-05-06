"use client";

import { useState, useEffect } from "react";
import { Swiper, SwiperSlide } from 'swiper/react';
import { Pagination, EffectCards } from 'swiper/modules';
import { motion, AnimatePresence } from 'framer-motion';
import 'swiper/css';
import 'swiper/css/pagination';
import 'swiper/css/effect-cards';
import Link from "next/link";

const ONBOARDING_SLIDES = [
  {
    id: 1,
    title: "Discover",
    subtitle: "Share, Follow\nYour World",
    description: "Conoce personas increíbles y conecta en tiempo real",
    gradient: "linear-gradient(135deg, #8B4513 0%, #D2691E 50%, #FF6347 100%)",
    icon: "👋",
  },
  {
    id: 2,
    title: "Watch Live",
    subtitle: "Connect &\nInteract",
    description: "Transmite en vivo o mira a tus creadores favoritos",
    gradient: "linear-gradient(135deg, #1e3a8a 0%, #3b82f6 50%, #60a5fa 100%)",
    icon: "📹",
  },
  {
    id: 3,
    title: "Send Gifts",
    subtitle: "Support Your\nFavorites",
    description: "Envía regalos virtuales y apoya a los creadores",
    gradient: "linear-gradient(135deg, #6b21a8 0%, #a855f7 50%, #d946ef 100%)",
    icon: "🎁",
  },
  {
    id: 4,
    title: "Earn Money",
    subtitle: "Become a\nCreator",
    description: "Transmite en vivo y gana dinero con tu contenido",
    gradient: "linear-gradient(135deg, #065f46 0%, #10b981 50%, #34d399 100%)",
    icon: "💰",
  },
];

export default function OnboardingCarousel({ onComplete }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    // Check if user has seen onboarding
    const hasSeenOnboarding = localStorage.getItem("hasSeenOnboarding");
    if (!hasSeenOnboarding) {
      setShowOnboarding(true);
    }
  }, []);

  const handleComplete = () => {
    localStorage.setItem("hasSeenOnboarding", "true");
    setShowOnboarding(false);
    onComplete?.();
  };

  const handleSkip = () => {
    handleComplete();
  };

  if (!showOnboarding) return null;

  const isLastSlide = activeIndex === ONBOARDING_SLIDES.length - 1;

  return (
    <AnimatePresence>
      <motion.div
        className="onboarding-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <button className="onboarding-close" onClick={handleSkip}>
          ✕
        </button>

        <Swiper
          modules={[Pagination, EffectCards]}
          effect="cards"
          grabCursor={true}
          pagination={{
            clickable: true,
            dynamicBullets: true,
          }}
          onSlideChange={(swiper) => setActiveIndex(swiper.activeIndex)}
          className="onboarding-swiper"
        >
          {ONBOARDING_SLIDES.map((slide, index) => (
            <SwiperSlide key={slide.id}>
              <motion.div
                className="onboarding-slide"
                style={{ background: slide.gradient }}
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.2 }}
              >
                <motion.div
                  className="onboarding-icon"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{
                    type: "spring",
                    stiffness: 200,
                    delay: 0.3,
                  }}
                >
                  {slide.icon}
                </motion.div>

                <motion.h1
                  className="onboarding-title"
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.4 }}
                >
                  {slide.title}
                </motion.h1>

                <motion.h2
                  className="onboarding-subtitle"
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.5 }}
                >
                  {slide.subtitle.split('\n').map((line, i) => (
                    <span key={i}>
                      {line}
                      {i === 0 && <br />}
                    </span>
                  ))}
                </motion.h2>

                <motion.p
                  className="onboarding-description"
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.6 }}
                >
                  {slide.description}
                </motion.p>
              </motion.div>
            </SwiperSlide>
          ))}
        </Swiper>

        <motion.div
          className="onboarding-actions"
          initial={{ y: 50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.7 }}
        >
          {isLastSlide ? (
            <button className="onboarding-btn-primary" onClick={handleComplete}>
              Get Started 🚀
            </button>
          ) : (
            <>
              <button className="onboarding-btn-skip" onClick={handleSkip}>
                Skip
              </button>
              <button className="onboarding-btn-next">
                Next →
              </button>
            </>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
