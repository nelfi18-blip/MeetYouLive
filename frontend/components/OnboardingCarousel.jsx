"use client";

import { useState, useEffect } from "react";
import { Swiper, SwiperSlide } from 'swiper/react';
import { Pagination, EffectCards } from 'swiper/modules';
import { motion, AnimatePresence } from 'framer-motion';
import 'swiper/css';
import 'swiper/css/pagination';
import 'swiper/css/effect-cards';
import Link from "next/link";
import { useSession } from "next-auth/react";
import { isApprovedCreator } from "@/lib/creatorUtils";

const getOnboardingSlidesForUser = (isCreator) => {
  if (isCreator) {
    return [
      {
        id: 1,
        title: "Bienvenido Creador",
        subtitle: "Comparte tu\nTalento",
        description: "Transmite en vivo y conecta con tu audiencia en tiempo real",
        gradient: "linear-gradient(135deg, #8B4513 0%, #D2691E 50%, #FF6347 100%)",
        icon: "🎬",
      },
      {
        id: 2,
        title: "Transmite en Vivo",
        subtitle: "Conecta &\nEntretiene",
        description: "Inicia transmisiones HD con múltiples invitados y efectos especiales",
        gradient: "linear-gradient(135deg, #1e3a8a 0%, #3b82f6 50%, #60a5fa 100%)",
        icon: "📹",
      },
      {
        id: 3,
        title: "Recibe Regalos",
        subtitle: "Monetiza tu\nContenido",
        description: "Gana dinero real con los regalos virtuales de tus fans",
        gradient: "linear-gradient(135deg, #6b21a8 0%, #a855f7 50%, #d946ef 100%)",
        icon: "💎",
      },
      {
        id: 4,
        title: "Retira tus Ganancias",
        subtitle: "Cobra cuando\nQuieras",
        description: "Retira tus ganancias fácilmente a tu cuenta bancaria o PayPal",
        gradient: "linear-gradient(135deg, #065f46 0%, #10b981 50%, #34d399 100%)",
        icon: "💰",
      },
    ];
  }

  return [
    {
      id: 1,
      title: "Descubre Personas",
      subtitle: "Conoce &\nConecta",
      description: "Conoce personas increíbles cerca de ti o de todo el mundo",
      gradient: "linear-gradient(135deg, #8B4513 0%, #D2691E 50%, #FF6347 100%)",
      icon: "👋",
    },
    {
      id: 2,
      title: "Mira en Vivo",
      subtitle: "Disfruta\nContenido Real",
      description: "Ve transmisiones en vivo de tus creadores favoritos",
      gradient: "linear-gradient(135deg, #1e3a8a 0%, #3b82f6 50%, #60a5fa 100%)",
      icon: "📱",
    },
    {
      id: 3,
      title: "Envía Regalos",
      subtitle: "Apoya a tus\nFavoritos",
      description: "Envía regalos virtuales y destaca en los lives",
      gradient: "linear-gradient(135deg, #6b21a8 0%, #a855f7 50%, #d946ef 100%)",
      icon: "🎁",
    },
    {
      id: 4,
      title: "Haz Matches",
      subtitle: "Encuentra tu\nMedia Naranja",
      description: "Da like, chatea y conoce personas especiales",
      gradient: "linear-gradient(135deg, #dc2626 0%, #f43f5e 50%, #fb7185 100%)",
      icon: "💝",
    },
  ];
};

export default function OnboardingCarousel({ onComplete }) {
  const { data: session } = useSession();
  const [activeIndex, setActiveIndex] = useState(0);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showLater, setShowLater] = useState(false);
  
  const isCreator = session?.user && isApprovedCreator(session.user);
  const SLIDES = getOnboardingSlidesForUser(isCreator);

  useEffect(() => {
    // Check if user has seen onboarding
    const hasSeenOnboarding = localStorage.getItem("hasSeenOnboarding");
    const showLaterTime = localStorage.getItem("showOnboardingLater");
    
    if (!hasSeenOnboarding) {
      // If user chose "Show later", check if 24h has passed
      if (showLaterTime) {
        const hoursPassed = (Date.now() - parseInt(showLaterTime)) / (1000 * 60 * 60);
        if (hoursPassed >= 24) {
          setShowOnboarding(true);
          localStorage.removeItem("showOnboardingLater");
        }
      } else {
        setShowOnboarding(true);
      }
    }
  }, []);

  const handleComplete = () => {
    localStorage.setItem("hasSeenOnboarding", "true");
    localStorage.removeItem("showOnboardingLater");
    setShowOnboarding(false);
    onComplete?.();
  };

  const handleSkip = () => {
    handleComplete();
  };
  
  const handleShowLater = () => {
    localStorage.setItem("showOnboardingLater", Date.now().toString());
    setShowOnboarding(false);
    onComplete?.();
  };

  if (!showOnboarding) return null;

  const isLastSlide = activeIndex === SLIDES.length - 1;

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
          {SLIDES.map((slide, index) => (
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
              ¡Comenzar Ahora! 🚀
            </button>
          ) : (
            <>
              <button className="onboarding-btn-later" onClick={handleShowLater}>
                Mostrar Después
              </button>
              <button className="onboarding-btn-skip" onClick={handleSkip}>
                Saltar
              </button>
            </>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
