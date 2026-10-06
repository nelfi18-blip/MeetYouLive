"use client";

import FuturisticCard from "@/components/ui/FuturisticCard";
import { ActivityIcon, CheckCircleIcon, TrendUpIcon } from "@/components/ui/MonetizationIcons";
import { useLanguage } from "@/contexts/LanguageContext";

const TIPS = [
  { key: "tip1", icon: TrendUpIcon },
  { key: "tip4", icon: ActivityIcon },
  { key: "tip3", icon: CheckCircleIcon },
];

export default function CreatorGrowthTipsCard() {
  const { t } = useLanguage();

  return (
    <FuturisticCard className="tips-card" accent="purple" hover={false}>
      <span className="tips-title">{t("creatorPage.growthTipsTitle")}</span>
      <div className="tips-scroll">
        {TIPS.map(({ key, icon: Icon }) => (
          <div key={key} className="tip-chip">
            <span className="tip-icon"><Icon size={13} /></span>
            <p>{t(`creatorProgress.${key}`)}</p>
          </div>
        ))}
      </div>

      <style jsx>{`
        .tips-card {
          padding: 0.8rem 0.9rem;
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
        .tips-title {
          color: #fff;
          font-size: 0.82rem;
          font-weight: 800;
        }
        .tips-scroll {
          display: flex;
          gap: 0.5rem;
          overflow-x: auto;
          scrollbar-width: none;
          padding-bottom: 0.1rem;
        }
        .tips-scroll::-webkit-scrollbar {
          display: none;
        }
        .tip-chip {
          flex: 0 0 auto;
          width: 175px;
          border-radius: 12px;
          border: 1px solid rgba(224, 64, 251, 0.26);
          background: rgba(224, 64, 251, 0.08);
          padding: 0.55rem 0.6rem;
          display: flex;
          align-items: center;
          gap: 0.4rem;
        }
        .tip-icon {
          width: 1.55rem;
          height: 1.55rem;
          border-radius: 9px;
          border: 1px solid rgba(224, 64, 251, 0.34);
          background: rgba(224, 64, 251, 0.14);
          color: #f5d0fe;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .tip-chip p {
          margin: 0;
          color: #e2e8f0;
          font-size: 0.7rem;
          line-height: 1.3;
          font-weight: 600;
        }
      `}</style>
    </FuturisticCard>
  );
}
