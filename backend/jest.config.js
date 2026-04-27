/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: "node",
  testMatch: ["**/tests/**/*.test.js"],
  collectCoverageFrom: [
    "src/controllers/**/*.js",
    "src/middlewares/**/*.js",
    "src/services/**/*.js",
  ],
  testTimeout: 15000,
};
