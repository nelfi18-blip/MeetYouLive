const AnalyticsEvent = require("../models/AnalyticsEvent.js");
const User = require("../models/User.js");
const {
  DETAIL_RETENTION_DAYS,
  recordPublicAnalyticsEvent,
  safePercent,
} = require("../services/analytics.service.js");

const MAX_ANALYTICS_PAYLOAD_BYTES = 4096;
const MAX_RANGE_DAYS = 90;
const SOURCE_ORDER = ["instagram", "facebook", "tiktok", "whatsapp", "google", "direct", "other"];
const FUNNEL_EVENTS = [
  { key: "visitors", event: "landing_view" },
  { key: "registerClicks", event: "register_cta_click" },
  { key: "registrationStarted", event: "registration_started" },
  { key: "registrationCompleted", event: "registration_submitted" },
  { key: "emailVerified", event: "email_verified" },
  { key: "onboardingCompleted", event: "onboarding_completed" },
  { key: "feedReached", event: "feed_reached" },
];

const getStartOfDay = (date = new Date()) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

const getPeriodStart = (period) => {
  const now = new Date();
  const today = getStartOfDay(now);
  if (period === "today") return today;
  const days = period === "30d" ? 30 : 7;
  return new Date(today.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
};

const parseRange = (query = {}) => {
  const period = ["today", "7d", "30d"].includes(query.period) ? query.period : "7d";
  let start = getPeriodStart(period);
  let end = new Date();
  if (query.startDate && query.endDate) {
    const customStart = new Date(`${query.startDate}T00:00:00.000Z`);
    const customEnd = new Date(`${query.endDate}T23:59:59.999Z`);
    if (!Number.isNaN(customStart.getTime()) && !Number.isNaN(customEnd.getTime()) && customEnd >= customStart) {
      const spanDays = Math.ceil((customEnd - customStart) / (24 * 60 * 60 * 1000));
      if (spanDays <= MAX_RANGE_DAYS) {
        start = customStart;
        end = customEnd;
      }
    }
  }
  return { period, start, end };
};

const baseMatch = (start, end) => ({
  createdAt: { $gte: start, $lte: end },
  excluded: { $ne: true },
});

const uniqueVisitorCountForEvent = (event, start, end) =>
  AnalyticsEvent.distinct("anonymousVisitorId", {
    ...baseMatch(start, end),
    event,
    anonymousVisitorId: { $nin: [null, ""] },
  }).then((ids) => ids.length);

const countEvent = (event, start, end) => AnalyticsEvent.countDocuments({ ...baseMatch(start, end), event });

const buildFunnel = async (start, end) => {
  const counts = {};
  await Promise.all(
    FUNNEL_EVENTS.map(async ({ key, event }) => {
      counts[key] = event === "landing_view"
        ? await uniqueVisitorCountForEvent(event, start, end)
        : await countEvent(event, start, end);
    })
  );

  return FUNNEL_EVENTS.map((step, index) => {
    const count = counts[step.key] || 0;
    const previousCount = index === 0 ? count : counts[FUNNEL_EVENTS[index - 1].key] || 0;
    const conversionFromPrevious = index === 0 ? 100 : safePercent(count, previousCount);
    return {
      ...step,
      count,
      conversionFromPrevious,
      dropoffFromPrevious: index === 0 ? 0 : Math.max(0, previousCount - count),
      dropoffPercent: index === 0 ? 0 : Number((100 - conversionFromPrevious).toFixed(1)),
    };
  });
};

const getDailyTrend = async (start, end) => {
  const rows = await AnalyticsEvent.aggregate([
    { $match: { ...baseMatch(start, end), event: { $in: ["landing_view", "registration_submitted"] } } },
    {
      $group: {
        _id: {
          day: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          event: "$event",
        },
        count: { $sum: 1 },
        visitors: { $addToSet: "$anonymousVisitorId" },
      },
    },
    { $sort: { "_id.day": 1 } },
  ]);

  const byDay = new Map();
  for (const row of rows) {
    const day = row._id.day;
    if (!byDay.has(day)) {
      byDay.set(day, { day, label: day.slice(5), visits: 0, uniqueVisitors: 0, registrations: 0, conversion: 0 });
    }
    const item = byDay.get(day);
    if (row._id.event === "landing_view") {
      item.visits = row.count;
      item.uniqueVisitors = (row.visitors || []).filter(Boolean).length;
    }
    if (row._id.event === "registration_submitted") {
      item.registrations = row.count;
    }
  }
  return Array.from(byDay.values()).map((item) => ({
    ...item,
    conversion: safePercent(item.registrations, item.uniqueVisitors),
  }));
};

const getSources = async (start, end) => {
  const rows = await AnalyticsEvent.aggregate([
    { $match: { ...baseMatch(start, end), event: { $in: ["landing_view", "registration_submitted"] } } },
    {
      $group: {
        _id: { source: "$source", event: "$event" },
        visitors: { $addToSet: "$anonymousVisitorId" },
        count: { $sum: 1 },
      },
    },
  ]);
  const bySource = new Map(SOURCE_ORDER.map((source) => [source, { source, visitors: 0, registrations: 0, conversion: 0 }]));
  for (const row of rows) {
    const source = SOURCE_ORDER.includes(row._id.source) ? row._id.source : "other";
    const item = bySource.get(source);
    if (row._id.event === "landing_view") item.visitors = (row.visitors || []).filter(Boolean).length;
    if (row._id.event === "registration_submitted") item.registrations = row.count;
  }
  return Array.from(bySource.values()).map((item) => ({
    ...item,
    conversion: safePercent(item.registrations, item.visitors),
  }));
};

const getDeviceBreakdown = async (start, end) =>
  AnalyticsEvent.aggregate([
    { $match: { ...baseMatch(start, end), event: "landing_view" } },
    { $group: { _id: "$deviceCategory", visitors: { $addToSet: "$anonymousVisitorId" }, views: { $sum: 1 } } },
    { $project: { _id: 0, deviceCategory: "$_id", visitors: { $size: "$visitors" }, views: 1 } },
    { $sort: { visitors: -1 } },
  ]);

const getLocaleBreakdown = async (start, end) =>
  AnalyticsEvent.aggregate([
    { $match: { ...baseMatch(start, end), event: "landing_view", locale: { $nin: [null, ""] } } },
    { $group: { _id: "$locale", visitors: { $addToSet: "$anonymousVisitorId" }, views: { $sum: 1 } } },
    { $project: { _id: 0, locale: "$_id", visitors: { $size: "$visitors" }, views: 1 } },
    { $sort: { visitors: -1 } },
    { $limit: 10 },
  ]);

exports.createAnalyticsEvent = async (req, res) => {
  try {
    const byteLength = Buffer.byteLength(JSON.stringify(req.body || {}), "utf8");
    if (byteLength > MAX_ANALYTICS_PAYLOAD_BYTES) {
      return res.status(413).json({ ok: false, message: "Payload demasiado grande" });
    }
    const result = await recordPublicAnalyticsEvent(req.body || {}, req);
    return res.status(202).json({ ok: true, accepted: !result.excluded, duplicate: Boolean(result.duplicate) });
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) console.error("[analytics] event ingestion error:", error.message);
    return res.status(status).json({ ok: false, message: status >= 500 ? "No se pudo registrar analítica" : error.message });
  }
};

exports.getGrowthAnalytics = async (req, res) => {
  try {
    const { period, start, end } = parseRange(req.query);
    const today = getStartOfDay(new Date());
    const sevenDaysAgo = new Date(today.getTime() - 6 * 24 * 60 * 60 * 1000);
    const [
      visitorsToday,
      uniqueVisitorsToday,
      visitors7d,
      registrationsToday,
      registerClicks,
      registrationStarted,
      registrationCompleted,
      emailVerified,
      onboardingCompleted,
      feedReached,
      funnel,
      sources,
      trend,
      devices,
      locales,
    ] = await Promise.all([
      countEvent("landing_view", today, new Date()),
      uniqueVisitorCountForEvent("landing_view", today, new Date()),
      uniqueVisitorCountForEvent("landing_view", sevenDaysAgo, new Date()),
      User.countDocuments({ createdAt: { $gte: today } }),
      countEvent("register_cta_click", start, end),
      countEvent("registration_started", start, end),
      countEvent("registration_submitted", start, end),
      countEvent("email_verified", start, end),
      countEvent("onboarding_completed", start, end),
      countEvent("feed_reached", start, end),
      buildFunnel(start, end),
      getSources(start, end),
      getDailyTrend(start, end),
      getDeviceBreakdown(start, end),
      getLocaleBreakdown(start, end),
    ]);

    return res.json({
      ok: true,
      analytics: {
        period,
        range: { start: start.toISOString(), end: end.toISOString() },
        retention: {
          detailedEventsDays: DETAIL_RETENTION_DAYS,
          note: "Eventos detallados anónimos expiran a los 90 días; los agregados administrativos pueden conservarse más tiempo.",
        },
        summary: {
          visitorsToday,
          uniqueVisitorsToday,
          visitors7d,
          registerClicks,
          registrationStarted,
          registrationCompleted,
          registrationsToday,
          emailVerified,
          onboardingCompleted,
          feedReached,
          conversion: safePercent(registrationCompleted, funnel[0]?.count || 0),
        },
        funnel,
        sources,
        trend,
        devices,
        locales,
      },
    });
  } catch (error) {
    console.error("[analytics] growth metrics error:", error);
    return res.status(500).json({ ok: false, message: "Error obteniendo analíticas de crecimiento" });
  }
};
