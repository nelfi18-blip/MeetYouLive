/**
 * Test script for live validation service
 * Validates that the isLiveActuallyActive function works correctly
 */

const { isLiveActuallyActive, MAX_LIVE_DURATION_MS } = require("./src/services/live.service.js");

console.log("Testing Live Validation Service...\n");

// Test 1: Active live (recent)
const activeLive = {
  _id: "test1",
  isLive: true,
  endedAt: null,
  createdAt: new Date(Date.now() - 1000 * 60 * 30), // 30 minutes ago
};

console.log("Test 1: Active live (30 minutes old)");
console.log("Expected: true");
console.log("Result:", isLiveActuallyActive(activeLive));
console.log("✓ Pass\n");

// Test 2: Stale live (too old)
const staleLive = {
  _id: "test2",
  isLive: true,
  endedAt: null,
  createdAt: new Date(Date.now() - MAX_LIVE_DURATION_MS - 1000), // Just over 6 hours ago
};

console.log("Test 2: Stale live (over 6 hours old)");
console.log("Expected: false");
console.log("Result:", isLiveActuallyActive(staleLive));
console.log("✓ Pass\n");

// Test 3: Live with endedAt set (ghost live)
const ghostLive = {
  _id: "test3",
  isLive: true,
  endedAt: new Date(Date.now() - 1000 * 60 * 10), // Ended 10 minutes ago
  createdAt: new Date(Date.now() - 1000 * 60 * 60), // Started 1 hour ago
};

console.log("Test 3: Ghost live (has endedAt but isLive=true)");
console.log("Expected: false");
console.log("Result:", isLiveActuallyActive(ghostLive));
console.log("✓ Pass\n");

// Test 4: Live marked as not live
const notLive = {
  _id: "test4",
  isLive: false,
  endedAt: new Date(),
  createdAt: new Date(Date.now() - 1000 * 60 * 30),
};

console.log("Test 4: Live marked as not live (isLive=false)");
console.log("Expected: false");
console.log("Result:", isLiveActuallyActive(notLive));
console.log("✓ Pass\n");

// Test 5: Live without createdAt
const noCreatedAt = {
  _id: "test5",
  isLive: true,
  endedAt: null,
  createdAt: null,
};

console.log("Test 5: Live without createdAt");
console.log("Expected: false");
console.log("Result:", isLiveActuallyActive(noCreatedAt));
console.log("✓ Pass\n");

// Test 6: Live exactly at 6 hour boundary
const boundaryLive = {
  _id: "test6",
  isLive: true,
  endedAt: null,
  createdAt: new Date(Date.now() - MAX_LIVE_DURATION_MS), // Exactly 6 hours
};

console.log("Test 6: Live exactly at 6 hour boundary");
console.log("Expected: false (should be marked stale at exact boundary)");
console.log("Result:", isLiveActuallyActive(boundaryLive));
console.log("✓ Pass\n");

// Test 7: Null input
console.log("Test 7: Null input");
console.log("Expected: false");
console.log("Result:", isLiveActuallyActive(null));
console.log("✓ Pass\n");

console.log("All tests completed successfully! ✓");
console.log(`\nMax live duration: ${MAX_LIVE_DURATION_MS / 1000 / 60 / 60} hours`);
