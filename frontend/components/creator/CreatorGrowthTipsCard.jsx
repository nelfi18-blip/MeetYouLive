"use client";

import FuturisticCard from "@/components/ui/FuturisticCard";
import PremiumSectionHeader from "@/components/ui/PremiumSectionHeader";
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
      <PremiumSectionHeader
        title={t("creatorPage.growthTipsTitle")}
        subtitle={t("creatorPage.growthTipsSubtitle")}
      />
      <div className="tips-grid">
        {TIPS.map(({ key, icon: Icon }) => (
          <div key={key} className="tip-card">
            <span className="tip-icon"><Icon size={16} /></span>
            <p>{t(`creatorProgress.${key}`)}</p>
          </div>
        ))}
      </div>

      <style jsx>{`
        .tips-card {
          padding: 1rem;
          display: flex;
          flex-direction: column;
          gap: 0.82rem;
        }
        .tips-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 0.55rem;
        }
        .tip-card {
          border-radius: 14px;
          border: 1px solid rgba(224, 64, 251, 0.26);
          background: rgba(224, 64, 251, 0.08);
          padding: 0.75rem 0.65rem;
          display: flex;
          flex-direction: column;
          gap: 0.45rem;
        }
        .tip-icon {
          width: 1.8rem;
          height: 1.8rem;
          border-radius: 10px;
          border: 1px solid rgba(224, 64, 251, 0.34);
          background: rgba(224, 64, 251, 0.14);
          color: #f5d0fe;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .tip-card p {
          margin: 0;
          color: #e2e8f0;
          font-size: 0.76rem;
          line-height: 1.4;
          font-weight: 600;
        }
        @media (max-width: 640px) {
          .tips-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </FuturisticCard>
  );
}
