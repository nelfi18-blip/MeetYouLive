"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useLanguage } from "@/contexts/LanguageContext";

export default function ModePage() {
  const router = useRouter();
  const { t } = useLanguage();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleModeSelect = (mode, targetPath) => {
    if (mounted) {
      localStorage.setItem("preferredMode", mode);
    }
    router.push(targetPath);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[var(--bg)] via-[var(--bg-2)] to-[var(--bg-3)] flex flex-col items-center justify-center p-4">
      {/* Header */}
      <div className="text-center mb-8 md:mb-12">
        <h1 className="text-3xl md:text-4xl font-bold text-white mb-3">
          {t("mode.title")}
        </h1>
        <p className="text-[var(--text-muted)] text-sm md:text-base">
          {t("mode.subtitle")}
        </p>
      </div>

      {/* Mode Cards */}
      <div className="w-full max-w-md grid gap-4 md:gap-6">
        {/* Match Mode Card */}
        <button
          onClick={() => handleModeSelect("match", "/explore")}
          className="group relative bg-gradient-to-br from-pink-500/20 via-[var(--card)] to-purple-500/20 
                     rounded-2xl md:rounded-3xl p-6 md:p-8 border border-pink-500/30 
                     hover:border-pink-500/60 transition-all duration-300 
                     hover:shadow-[0_0_30px_rgba(236,72,153,0.3)] 
                     hover:scale-[1.02] active:scale-[0.98]"
        >
          {/* Glow Effect */}
          <div className="absolute inset-0 bg-gradient-to-br from-pink-500/0 to-pink-500/10 
                          rounded-2xl md:rounded-3xl opacity-0 group-hover:opacity-100 
                          transition-opacity duration-300" />
          
          <div className="relative z-10">
            {/* Icon */}
            <div className="text-6xl md:text-7xl mb-4">❤️</div>
            
            {/* Title */}
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-3">
              {t("mode.connectTitle")}
            </h2>
            
            {/* Description */}
            <p className="text-[var(--text-muted)] text-sm md:text-base">
              {t("mode.connectDescription")}
            </p>
          </div>

          {/* Arrow Indicator */}
          <div className="absolute right-6 top-1/2 -translate-y-1/2 text-pink-400 
                          opacity-0 group-hover:opacity-100 transition-all duration-300 
                          group-hover:translate-x-1">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="5" y1="12" x2="19" y2="12"/>
              <polyline points="12 5 19 12 12 19"/>
            </svg>
          </div>
        </button>

        {/* Live Mode Card */}
        <button
          onClick={() => handleModeSelect("live", "/live")}
          className="group relative bg-gradient-to-br from-red-500/20 via-[var(--card)] to-orange-500/20 
                     rounded-2xl md:rounded-3xl p-6 md:p-8 border border-red-500/30 
                     hover:border-red-500/60 transition-all duration-300 
                     hover:shadow-[0_0_30px_rgba(239,68,68,0.3)] 
                     hover:scale-[1.02] active:scale-[0.98]"
        >
          {/* Glow Effect */}
          <div className="absolute inset-0 bg-gradient-to-br from-red-500/0 to-red-500/10 
                          rounded-2xl md:rounded-3xl opacity-0 group-hover:opacity-100 
                          transition-opacity duration-300" />
          
          <div className="relative z-10">
            {/* Icon */}
            <div className="text-6xl md:text-7xl mb-4">🔴</div>
            
            {/* Title */}
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-3">
              {t("mode.liveTitle")}
            </h2>
            
            {/* Description */}
            <p className="text-[var(--text-muted)] text-sm md:text-base">
              {t("mode.liveDescription")}
            </p>
          </div>

          {/* Arrow Indicator */}
          <div className="absolute right-6 top-1/2 -translate-y-1/2 text-red-400 
                          opacity-0 group-hover:opacity-100 transition-all duration-300 
                          group-hover:translate-x-1">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="5" y1="12" x2="19" y2="12"/>
              <polyline points="12 5 19 12 12 19"/>
            </svg>
          </div>
        </button>
      </div>

      {/* Footer Note */}
      <div className="mt-8 md:mt-12 text-center">
        <p className="text-xs md:text-sm text-[var(--text-dim)]">
          {t("mode.footer")}
        </p>
      </div>
    </div>
  );
}
