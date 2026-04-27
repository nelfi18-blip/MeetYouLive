const Sentry = require("@sentry/node");

/**
 * Initialize Sentry for the Express app.
 * Gracefully skips initialization if SENTRY_DSN is not set.
 * Must be called immediately after creating the Express app, before other middleware.
 *
 * @param {import('express').Application} app
 */
function initSentry(app) {
  if (!process.env.SENTRY_DSN) {
    console.warn("[sentry] SENTRY_DSN not set — error monitoring disabled");
    return;
  }

  const isProd = process.env.NODE_ENV === "production";

  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || "development",
    tracesSampleRate: isProd ? 0.2 : 1.0,
    integrations: [
      Sentry.httpIntegration(),
      Sentry.expressIntegration({ app }),
      Sentry.mongooseIntegration(),
    ],
    beforeSend(event) {
      if (event.request) {
        if (event.request.headers) {
          delete event.request.headers.authorization;
          delete event.request.headers.cookie;
        }
      }
      return event;
    },
  });
}

/**
 * Express error handler middleware that reports errors to Sentry.
 * Captures both 4xx and 5xx errors.
 * Must be added before the generic 404/error handler.
 *
 * @returns {import('express').ErrorRequestHandler}
 */
function sentryErrorHandler() {
  return Sentry.expressErrorHandler();
}

module.exports = { initSentry, sentryErrorHandler };
