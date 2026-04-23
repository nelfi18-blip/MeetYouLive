"use client";

import FuturisticCard from "@/components/ui/FuturisticCard";
import PremiumSectionHeader from "@/components/ui/PremiumSectionHeader";
import NeonBadge from "@/components/ui/NeonBadge";
import { ActivityIcon, CheckCircleIcon, TrendUpIcon } from "@/components/ui/MonetizationIcons";

const TIPS = [
  "Haz más directos durante la semana",
  "Mantén los regalos activos en tus lives",
  "Completa y actualiza tu perfil de creador",
  "Promueve llamadas privadas en tu bio",
];
const CONSISTENCY_PERIOD_DAYS = 30;

export default function CreatorProgressCard({ creatorLevel, consistencyDays }) {
  const progress = Math.max(0, Math.min(100, Number(creatorLevel?.progressPercent || 0)));
  const hasLevelData = Boolean(creatorLevel?.current?.label);

  return (
    <FuturisticCard className="progress-card" accent="purple" hover={false}>
      <PremiumSectionHeader
        title="Progresión y motivación"
        subtitle="Una guía clara para subir nivel y monetizar más de forma consistente."
      />

      {hasLevelData ? (
        <div className="level-block">
          <div className="level-row">
            <NeonBadge tone="purple">Nivel actual · {creatorLevel.current.label}</NeonBadge>
            <NeonBadge tone="cyan">
              Días activos · {consistencyDays || 0} / {CONSISTENCY_PERIOD_DAYS}
            </NeonBadge>
          </div>
          <p className="level-copy">
            {creatorLevel?.next?.label
              ? `Te faltan ${creatorLevel.pointsToNext || 0} puntos para llegar a ${creatorLevel.next.label}.`
              : "Ya alcanzaste el nivel máximo disponible por ahora."}
          </p>
          <div className="progress-track" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
            <div className="progress-fill" style={{ width: `${progress}%` }} />
          </div>
          <div className="progress-meta">
            <span>{creatorLevel?.points || 0} pts</span>
            <span>{creatorLevel?.next ? `${progress}%` : "MAX"}</span>
          </div>
        </div>
      ) : (
        <div className="roadmap-block">
          <NeonBadge tone="cyan">Roadmap creator activo</NeonBadge>
          <p>
            Tu progreso avanzado estará visible aquí cuando se complete la siguiente fase de datos de nivel.
          </p>
        </div>
      )}

      <div className="tips-grid">
        {TIPS.map((tip, index) => (
          <div key={tip} className="tip-row">
            <span className="tip-icon">
              {index < 2 ? <TrendUpIcon size={14} /> : index === 2 ? <CheckCircleIcon size={14} /> : <ActivityIcon size={14} />}
            </span>
            <span>{tip}</span>
          </div>
        ))}
      </div>

      <style jsx>{`
        .progress-card {
          padding: 1rem;
          display: flex;
          flex-direction: column;
          gap: 0.82rem;
        }
        .level-block,
        .roadmap-block {
          border-radius: 14px;
          border: 1px solid rgba(148, 163, 184, 0.23);
          background: rgba(255, 255, 255, 0.03);
          padding: 0.8rem;
          display: flex;
          flex-direction: column;
          gap: 0.55rem;
        }
        .level-row {
          display: flex;
          align-items: center;
          gap: 0.38rem;
          flex-wrap: wrap;
        }
        .level-copy,
        .roadmap-block p {
          margin: 0;
          color: var(--text-muted);
          font-size: 0.8rem;
          line-height: 1.45;
        }
        .progress-track {
          width: 100%;
          border-radius: 999px;
          height: 0.58rem;
          border: 1px solid rgba(139, 92, 246, 0.4);
          background: rgba(139, 92, 246, 0.1);
          overflow: hidden;
        }
        .progress-fill {
          height: 100%;
          border-radius: inherit;
          background: linear-gradient(90deg, #a855f7, #22d3ee);
          transition: width var(--transition-slow);
        }
        .progress-meta {
          display: flex;
          align-items: center;
          justify-content: space-between;
          color: var(--text-muted);
          font-size: 0.75rem;
          font-weight: 700;
        }
        .tips-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 0.45rem;
        }
        .tip-row {
          border-radius: 10px;
          border: 1px solid rgba(148, 163, 184, 0.22);
          background: rgba(255, 255, 255, 0.02);
          padding: 0.56rem 0.62rem;
          display: flex;
          align-items: center;
          gap: 0.46rem;
          color: #e2e8f0;
          font-size: 0.78rem;
        }
        .tip-icon {
          width: 1.55rem;
          height: 1.55rem;
          border-radius: 10px;
          border: 1px solid rgba(224, 64, 251, 0.34);
          background: rgba(224, 64, 251, 0.12);
          color: #f5d0fe;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        @media (min-width: 860px) {
          .tips-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }
      `}</style>
    </FuturisticCard>
  );
}
