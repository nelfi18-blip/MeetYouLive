const CREATOR_LEVELS = [
  { key: "bronze", label: "Bronze", minPoints: 0, badge: "🥉" },
  { key: "silver", label: "Silver", minPoints: 1200, badge: "🥈" },
  { key: "gold", label: "Gold", minPoints: 5000, badge: "🥇" },
  { key: "platinum", label: "Platinum", minPoints: 12000, badge: "💎" },
  { key: "elite", label: "Elite", minPoints: 25000, badge: "👑" },
];

function clampNumber(value) {
  const n = Number(value) || 0;
  return n < 0 ? 0 : n;
}

function computeCreatorProgress(metrics = {}) {
  const totalCoinsReceived = clampNumber(metrics.totalCoinsReceived);
  const totalCreatorShare = clampNumber(metrics.totalCreatorShare);
  const totalGifts = clampNumber(metrics.totalGifts);
  const totalLives = clampNumber(metrics.totalLives);
  const consistencyDays = clampNumber(metrics.consistencyDays);
  const followersCount = clampNumber(metrics.followersCount);

  const points =
    totalCoinsReceived +
    totalCreatorShare * 2 +
    totalGifts * 35 +
    totalLives * 300 +
    consistencyDays * 60 +
    followersCount * 25;

  let currentIndex = 0;
  for (let i = 0; i < CREATOR_LEVELS.length; i += 1) {
    if (points >= CREATOR_LEVELS[i].minPoints) currentIndex = i;
  }

  const current = CREATOR_LEVELS[currentIndex];
  const next = CREATOR_LEVELS[currentIndex + 1] || null;
  const pointsIntoLevel = points - current.minPoints;
  const pointsNeeded = next ? next.minPoints - current.minPoints : 0;
  const progressPercent = next
    ? Math.max(0, Math.min(100, Math.round((pointsIntoLevel / pointsNeeded) * 100)))
    : 100;

  return {
    points: Math.round(points),
    current,
    next,
    pointsIntoLevel: Math.round(pointsIntoLevel),
    pointsToNext: next ? Math.max(0, Math.round(next.minPoints - points)) : 0,
    progressPercent,
    metricsUsed: {
      totalCoinsReceived,
      totalCreatorShare,
      totalGifts,
      totalLives,
      consistencyDays,
      followersCount,
    },
  };
}

module.exports = {
  CREATOR_LEVELS,
  computeCreatorProgress,
};
