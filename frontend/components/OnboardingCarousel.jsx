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
import { useLanguage } from "@/contexts/LanguageContext";
import { isApprovedCreator } from "@/lib/creatorUtils";

const getOnboardingSlidesForUser = (isCreator, t) => {
  if (isCreator) {
    return [
      {
        id: 1,
        title: t("onboardingCarousel.creator1Title"),
        subtitle: t("onboardingCarousel.creator1Subtitle"),
        description: t("onboardingCarousel.creator1Description"),
        gradient: "linear-gradient(135deg, #8B4513 0%, #D2691E 50%, #FF6347 100%)",
        icon: "🎬",
      },
      {
        id: 2,
        title: t("onboardingCarousel.creator2Title"),
        subtitle: t("onboardingCarousel.creator2Subtitle"),
        description: t("onboardingCarousel.creator2Description"),
        gradient: "linear-gradient(135deg, #1e3a8a 0%, #3b82f6 50%, #60a5fa 100%)",
        icon: "📹",
      },
      {
        id: 3,
        title: t("onboardingCarousel.creator3Title"),
        subtitle: t("onboardingCarousel.creator3Subtitle"),
        description: t("onboardingCarousel.creator3Description"),
        gradient: "linear-gradient(135deg, #6b21a8 0%, #a855f7 50%, #d946ef 100%)",
        icon: "💎",
      },
      {
        id: 4,
        title: t("onboardingCarousel.creator4Title"),
        subtitle: t("onboardingCarousel.creator4Subtitle"),
        description: t("onboardingCarousel.creator4Description"),
        gradient: "linear-gradient(135deg, #065f46 0%, #10b981 50%, #34d399 100%)",
        icon: "💰",
      },
    ];
  }

  return [
    {
      id: 1,
      title: t("onboardingCarousel.user1Title"),
      subtitle: t("onboardingCarousel.user1Subtitle"),
      description: t("onboardingCarousel.user1Description"),
      gradient: "linear-gradient(135deg, #8B4513 0%, #D2691E 50%, #FF6347 100%)",
      icon: "👋",
    },
    {
      id: 2,
      title: t("onboardingCarousel.user2Title"),
      subtitle: t("onboardingCarousel.user2Subtitle"),
      description: t("onboardingCarousel.user2Description"),
      gradient: "linear-gradient(135deg, #1e3a8a 0%, #3b82f6 50%, #60a5fa 100%)",
      icon: "📱",
    },
    {
      id: 3,
      title: t("onboardingCarousel.user3Title"),
      subtitle: t("onboardingCarousel.user3Subtitle"),
      description: t("onboardingCarousel.user3Description"),
      gradient: "linear-gradient(135deg, #6b21a8 0%, #a855f7 50%, #d946ef 100%)",
      icon: "🎁",
    },
    {
      id: 4,
      title: t("onboardingCarousel.user4Title"),
      subtitle: t("onboardingCarousel.user4Subtitle"),
      description: t("onboardingCarousel.user4Description"),
      gradient: "linear-gradient(135deg, #dc2626 0%, #f43f5e 50%, #fb7185 100%)",
      icon: "💝",
    },
  ];
};

export default function OnboardingCarousel({ onComplete }) {
  const { t } = useLanguage();
  const { data: session } = useSession();
  const [activeIndex, setActiveIndex] = useState(0);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showLater, setShowLater] = useState(false);
  
  const isCreator = session?.user && isApprovedCreator(session.user);
  const SLIDES = getOnboardingSlidesForUser(isCreator, t);

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
              {t("onboardingCarousel.startNow")} 🚀
            </button>
          ) : (
            <>
              <button className="onboarding-btn-later" onClick={handleShowLater}>
                {t("onboardingCarousel.showLater")}
              </button>
              <button className="onboarding-btn-skip" onClick={handleSkip}>
                {t("onboardingCarousel.skip")}
              </button>
            </>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
