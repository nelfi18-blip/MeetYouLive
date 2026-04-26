const User = require("../models/User.js");
const { createNotification } = require("./notification.service.js");

/**
 * XP thresholds for each level (total accumulated XP needed to reach that level).
 * Level 1 starts at 0 XP. Formula: Math.floor(50 * n^1.75) for n >= 2.
 */
const LEVEL_THRESHOLDS = (() => {
  const thresholds = [0, 0]; // index 0 unused; level 1 = 0 XP
  for (let n = 2; n <= 50; n++) {
    thresholds.push(Math.floor(50 * Math.pow(n, 1.75)));
  }
  return thresholds;
})();

const MAX_LEVEL = LEVEL_THRESHOLDS.length - 1;

/**
 * Returns the level for a given total XP amount.
 */
function calculateLevel(xp) {
  let level = 1;
  for (let n = MAX_LEVEL; n >= 2; n--) {
    if (xp >= LEVEL_THRESHOLDS[n]) {
      level = n;
      break;
    }
  }
  return level;
}

/**
 * Returns how much XP is needed to reach the next level from the current one.
 */
function xpToNextLevel(currentLevel, currentXP) {
  if (currentLevel >= MAX_LEVEL) return 0;
  return LEVEL_THRESHOLDS[currentLevel + 1] - currentXP;
}

/**
 * Achievement definitions.
 * id must be unique and stable — it is stored in the DB.
 */
const ACHIEVEMENT_DEFINITIONS = [
  { id: "streak_3",             icon: "⚡", label: "Racha de 3 días",     description: "Mantén una racha de 3 días seguidos" },
  { id: "streak_7",             icon: "🔥", label: "Racha de 7 días",     description: "Mantén una racha de 7 días seguidos" },
  { id: "streak_14",            icon: "💎", label: "Racha de 14 días",    description: "Mantén una racha de 14 días seguidos" },
  { id: "streak_30",            icon: "🏆", label: "Racha de 30 días",    description: "Mantén una racha de 30 días seguidos" },
  { id: "missions_first",       icon: "🎯", label: "Primera misión",      description: "Completa todas las misiones del día por primera vez" },
  { id: "gift_first_sent",      icon: "🎁", label: "Primer regalo",       description: "Envía tu primer regalo a un creador" },
  { id: "top_fan_first",        icon: "👑", label: "Top Fan",             description: "Sé el fan #1 en un live" },
  { id: "level_5",              icon: "🌟", label: "Nivel 5",             description: "Alcanza el nivel 5" },
  { id: "level_10",             icon: "💫", label: "Nivel 10",            description: "Alcanza el nivel 10" },
];

/**
 * XP rewards per event type.
 */
const XP_REWARDS = {
  daily_reward_tier1:  10,  // streak 1-2
  daily_reward_tier2:  15,  // streak 3-6
  daily_reward_tier3:  25,  // streak 7-13
  daily_reward_tier4:  40,  // streak 14-29
  daily_reward_tier5:  60,  // streak 30+
  mission_complete:    10,  // per mission completed
  all_missions_bonus:  25,  // all missions complete
};

/**
 * Get XP for a daily reward claim based on streak length.
 */
function getDailyRewardXP(streak) {
  if (streak >= 30) return XP_REWARDS.daily_reward_tier5;
  if (streak >= 14) return XP_REWARDS.daily_reward_tier4;
  if (streak >= 7)  return XP_REWARDS.daily_reward_tier3;
  if (streak >= 3)  return XP_REWARDS.daily_reward_tier2;
  return XP_REWARDS.daily_reward_tier1;
}

/**
 * Atomically adds XP to a user, recalculates their level, and sends a
 * level-up notification if the level changed.
 *
 * Returns { xp, level, leveledUp, newLevel } or null on error.
 * Fire-and-forget safe — callers should .catch(() => {}) this.
 */
async function addXP(userId, amount) {
  if (!amount || amount <= 0) return null;
  try {
    const before = await User.findById(userId).select("xp level").lean();
    if (!before) return null;

    const newXP = (before.xp || 0) + amount;
    const oldLevel = before.level || 1;
    const newLevel = calculateLevel(newXP);
    const leveledUp = newLevel > oldLevel;

    const update = { $inc: { xp: amount } };
    if (leveledUp) update.$set = { level: newLevel };

    await User.findByIdAndUpdate(userId, update);

    if (leveledUp) {
      // Check level-based achievements
      if (newLevel >= 10 && oldLevel < 10) {
        await unlockAchievement(userId, "level_10");
      } else if (newLevel >= 5 && oldLevel < 5) {
        await unlockAchievement(userId, "level_5");
      }

      createNotification(userId, {
        type: "level_up",
        title: `⬆️ ¡Subiste al nivel ${newLevel}!`,
        message: `Felicidades, has alcanzado el nivel ${newLevel}. ¡Sigue así!`,
        data: { level: newLevel },
      }).catch(() => {});
    }

    return { xp: newXP, level: newLevel, leveledUp, newLevel };
  } catch (err) {
    console.error("[progression] addXP error:", err.message);
    return null;
  }
}

/**
 * Atomically unlocks an achievement for a user if not already unlocked.
 * Sends a real-time in-app notification when newly unlocked.
 *
 * Returns true if the achievement was just unlocked, false if already owned or on error.
 */
async function unlockAchievement(userId, achievementId) {
  const def = ACHIEVEMENT_DEFINITIONS.find((a) => a.id === achievementId);
  if (!def) return false;
  try {
    const result = await User.findOneAndUpdate(
      { _id: userId, "unlockedAchievements.id": { $ne: achievementId } },
      { $push: { unlockedAchievements: { id: achievementId, unlockedAt: new Date() } } },
      { new: false }
    );
    if (!result) return false; // already unlocked

    createNotification(userId, {
      type: "achievement_unlocked",
      title: `${def.icon} ¡Logro desbloqueado!`,
      message: `"${def.label}" — ${def.description}`,
      data: { achievementId },
    }).catch(() => {});

    return true;
  } catch (err) {
    console.error("[progression] unlockAchievement error:", err.message);
    return false;
  }
}

/**
 * Returns the full progression data for a user.
 */
async function getProgression(userId) {
  const user = await User.findById(userId).select("xp level unlockedAchievements").lean();
  if (!user) return null;

  const xp = user.xp || 0;
  const level = user.level || 1;
  const xpForNextLevel = level < MAX_LEVEL ? LEVEL_THRESHOLDS[level + 1] : null;
  const xpForCurrentLevel = LEVEL_THRESHOLDS[level] || 0;
  const xpInLevel = xp - xpForCurrentLevel;
  const xpNeededForLevel = xpForNextLevel != null ? xpForNextLevel - xpForCurrentLevel : null;

  const unlockedIds = new Set((user.unlockedAchievements || []).map((a) => a.id));
  const achievements = ACHIEVEMENT_DEFINITIONS.map((def) => ({
    ...def,
    unlocked: unlockedIds.has(def.id),
    unlockedAt: user.unlockedAchievements?.find((a) => a.id === def.id)?.unlockedAt ?? null,
  }));

  return {
    xp,
    level,
    maxLevel: MAX_LEVEL,
    xpForNextLevel,
    xpInLevel,
    xpNeededForLevel,
    progressPct: xpNeededForLevel ? Math.min(100, Math.floor((xpInLevel / xpNeededForLevel) * 100)) : 100,
    achievements,
  };
}

module.exports = {
  addXP,
  unlockAchievement,
  getProgression,
  getDailyRewardXP,
  calculateLevel,
  ACHIEVEMENT_DEFINITIONS,
  LEVEL_THRESHOLDS,
  XP_REWARDS,
};
