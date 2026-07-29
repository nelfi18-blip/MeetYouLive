"use strict";

const PlatformSettings = require("../models/PlatformSettings.js");

const SETTINGS_KEY = "global";

const DEFAULT_CHAT_PROTECTION_SETTINGS = Object.freeze({
  chatProtectionEnabled: true,
  blockPhones: true,
  blockEmails: true,
  blockUrls: true,
  blockSocialMedia: true,
  minimumDaysSinceMatch: 7,
  minimumMessages: 20,
  minimumCompletedCalls: 0,
  minimumCoinsSpent: 0,
  trustRuleMode: "all",
});

const DEFAULT_SETTINGS = Object.freeze({
  boostPriceCrush: 50,
  boostPackPrice: 200,
  hiddenLikePrice: 20,
  dailyRewardBaseCoins: 20,
  referralRewardCoins: 50,
  creatorPlatformSplitPercent: 40,
  chatProtection: DEFAULT_CHAT_PROTECTION_SETTINGS,
});

const NUMERIC_LIMITS = Object.freeze({
  boostPriceCrush: { min: 1, max: 1000000 },
  boostPackPrice: { min: 1, max: 1000000 },
  hiddenLikePrice: { min: 1, max: 1000000 },
  dailyRewardBaseCoins: { min: 1, max: 1000000 },
  referralRewardCoins: { min: 0, max: 1000000 },
  creatorPlatformSplitPercent: { min: 0, max: 100 },
});

const CHAT_NUMERIC_LIMITS = Object.freeze({
  minimumDaysSinceMatch: { min: 0, max: 3650 },
  minimumMessages: { min: 0, max: 100000 },
  minimumCompletedCalls: { min: 0, max: 10000 },
  minimumCoinsSpent: { min: 0, max: 100000000 },
});

const CHAT_BOOLEAN_KEYS = Object.freeze([
  "chatProtectionEnabled",
  "blockPhones",
  "blockEmails",
  "blockUrls",
  "blockSocialMedia",
]);

const cloneDefaults = () => ({
  ...DEFAULT_SETTINGS,
  chatProtection: { ...DEFAULT_CHAT_PROTECTION_SETTINGS },
});

const toPlainSettings = (doc) => {
  const defaults = cloneDefaults();
  if (!doc) return defaults;
  const obj = typeof doc.toObject === "function" ? doc.toObject() : doc;
  const chatProtection = {
    ...defaults.chatProtection,
    ...(obj.chatProtection || {}),
  };
  return {
    ...defaults,
    ...Object.fromEntries(Object.keys(NUMERIC_LIMITS).map((key) => [key, obj[key] ?? defaults[key]])),
    chatProtection,
  };
};

const validateNumber = (key, value, limits) => {
  const num = Number(value);
  if (!Number.isFinite(num) || num < limits.min || num > limits.max) {
    const err = new Error(`Valor inválido para ${key}`);
    err.status = 400;
    throw err;
  }
  return num;
};

const normalizeUpdates = (input = {}) => {
  const updates = {};
  for (const [key, limits] of Object.entries(NUMERIC_LIMITS)) {
    if (input[key] !== undefined) updates[key] = validateNumber(key, input[key], limits);
  }

  const rawChat = input.chatProtection && typeof input.chatProtection === "object"
    ? input.chatProtection
    : input;
  const chatUpdates = {};
  for (const key of CHAT_BOOLEAN_KEYS) {
    if (rawChat[key] !== undefined) chatUpdates[key] = rawChat[key] === true || rawChat[key] === "true";
  }
  for (const [key, limits] of Object.entries(CHAT_NUMERIC_LIMITS)) {
    if (rawChat[key] !== undefined) chatUpdates[key] = validateNumber(key, rawChat[key], limits);
  }
  if (rawChat.trustRuleMode !== undefined) {
    if (!["all", "any"].includes(rawChat.trustRuleMode)) {
      const err = new Error("Valor inválido para trustRuleMode");
      err.status = 400;
      throw err;
    }
    chatUpdates.trustRuleMode = rawChat.trustRuleMode;
  }

  if (Object.keys(chatUpdates).length > 0) {
    updates.chatProtection = chatUpdates;
  }
  return updates;
};

async function getPlatformSettings() {
  const doc = await PlatformSettings.findOne({ key: SETTINGS_KEY }).lean();
  return toPlainSettings(doc);
}

async function updatePlatformSettings(input, updatedBy) {
  const updates = normalizeUpdates(input);
  const set = {};
  for (const [key, value] of Object.entries(updates)) {
    if (key === "chatProtection") {
      for (const [chatKey, chatValue] of Object.entries(value)) {
        set[`chatProtection.${chatKey}`] = chatValue;
      }
    } else {
      set[key] = value;
    }
  }
  if (updatedBy) set.updatedBy = updatedBy;

  const doc = await PlatformSettings.findOneAndUpdate(
    { key: SETTINGS_KEY },
    { $set: set, $setOnInsert: { key: SETTINGS_KEY } },
    { new: true, upsert: true, runValidators: true }
  ).lean();
  return toPlainSettings(doc);
}

module.exports = {
  DEFAULT_SETTINGS,
  DEFAULT_CHAT_PROTECTION_SETTINGS,
  getPlatformSettings,
  updatePlatformSettings,
  normalizeUpdates,
  toPlainSettings,
};
