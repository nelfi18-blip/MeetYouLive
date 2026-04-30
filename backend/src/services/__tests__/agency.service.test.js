/**
 * Tests for revenue split logic - ensures platform always gets 40%
 */

const { calculateSplit, PLATFORM_RATE } = require("../agency.service.js");

describe("Revenue Split Logic - Platform 40%", () => {
  describe("calculateSplit - No Agency", () => {
    test("100 coins: platform=40, creator=60, agency=0", () => {
      const result = calculateSplit(100, null);
      expect(result.platformShare).toBe(40);
      expect(result.creatorNetShare).toBe(60);
      expect(result.agencyShare).toBe(0);
      // Verify total equals input
      expect(result.platformShare + result.creatorNetShare + result.agencyShare).toBe(100);
    });

    test("1000 coins: platform=400, creator=600, agency=0", () => {
      const result = calculateSplit(1000, null);
      expect(result.platformShare).toBe(400);
      expect(result.creatorNetShare).toBe(600);
      expect(result.agencyShare).toBe(0);
      expect(result.platformShare + result.creatorNetShare + result.agencyShare).toBe(1000);
    });

    test("50 coins: platform=20, creator=30, agency=0", () => {
      const result = calculateSplit(50, null);
      expect(result.platformShare).toBe(20);
      expect(result.creatorNetShare).toBe(30);
      expect(result.agencyShare).toBe(0);
      expect(result.platformShare + result.creatorNetShare + result.agencyShare).toBe(50);
    });

    test("Edge case - 1 coin: platform=0 (floor), creator=1, agency=0", () => {
      const result = calculateSplit(1, null);
      expect(result.platformShare).toBe(0); // floor(1 * 0.4) = 0
      expect(result.creatorNetShare).toBe(1);
      expect(result.agencyShare).toBe(0);
      expect(result.platformShare + result.creatorNetShare + result.agencyShare).toBe(1);
    });
  });

  describe("calculateSplit - With Agency", () => {
    test("100 coins with 10% agency: platform=40, agency=6, creator=54", () => {
      const result = calculateSplit(100, 10);
      expect(result.platformShare).toBe(40); // 40% of 100
      expect(result.agencyShare).toBe(6); // 10% of 60
      expect(result.creatorNetShare).toBe(54); // 60 - 6
      expect(result.platformShare + result.creatorNetShare + result.agencyShare).toBe(100);
    });

    test("1000 coins with 30% agency: platform=400, agency=180, creator=420", () => {
      const result = calculateSplit(1000, 30);
      expect(result.platformShare).toBe(400); // 40% of 1000
      expect(result.agencyShare).toBe(180); // 30% of 600
      expect(result.creatorNetShare).toBe(420); // 600 - 180
      expect(result.platformShare + result.creatorNetShare + result.agencyShare).toBe(1000);
    });

    test("500 coins with 20% agency: platform=200, agency=60, creator=240", () => {
      const result = calculateSplit(500, 20);
      expect(result.platformShare).toBe(200); // 40% of 500
      expect(result.agencyShare).toBe(60); // 20% of 300
      expect(result.creatorNetShare).toBe(240); // 300 - 60
      expect(result.platformShare + result.creatorNetShare + result.agencyShare).toBe(500);
    });

    test("250 coins with 15% agency: platform=100, agency=22, creator=128", () => {
      const result = calculateSplit(250, 15);
      expect(result.platformShare).toBe(100); // floor(250 * 0.4) = 100
      const creatorSide = 250 - 100; // 150
      expect(result.agencyShare).toBe(22); // floor(150 * 0.15) = 22
      expect(result.creatorNetShare).toBe(128); // 150 - 22 = 128
      expect(result.platformShare + result.creatorNetShare + result.agencyShare).toBe(250);
    });

    test("Invalid agency percentage (4% < 5%): treated as no agency", () => {
      const result = calculateSplit(100, 4);
      expect(result.platformShare).toBe(40);
      expect(result.creatorNetShare).toBe(60);
      expect(result.agencyShare).toBe(0); // Invalid percentage, no agency applied
      expect(result.platformShare + result.creatorNetShare + result.agencyShare).toBe(100);
    });

    test("Invalid agency percentage (31% > 30%): treated as no agency", () => {
      const result = calculateSplit(100, 31);
      expect(result.platformShare).toBe(40);
      expect(result.creatorNetShare).toBe(60);
      expect(result.agencyShare).toBe(0); // Invalid percentage, no agency applied
      expect(result.platformShare + result.creatorNetShare + result.agencyShare).toBe(100);
    });
  });

  describe("Platform Always Gets Exactly 40%", () => {
    test("Platform share is always floor(total * 0.40) regardless of agency", () => {
      const amounts = [10, 50, 100, 250, 500, 777, 1000, 5000];
      const agencyPercentages = [null, 5, 10, 15, 20, 25, 30];

      amounts.forEach((amount) => {
        agencyPercentages.forEach((agencyPct) => {
          const result = calculateSplit(amount, agencyPct);
          const expectedPlatform = Math.floor(amount * PLATFORM_RATE);
          expect(result.platformShare).toBe(expectedPlatform);
          // Verify total
          expect(result.platformShare + result.creatorNetShare + result.agencyShare).toBe(amount);
        });
      });
    });

    test("Creator side is always (total - platformShare)", () => {
      const amounts = [100, 500, 1000, 2500];
      const agencyPercentages = [null, 10, 20, 30];

      amounts.forEach((amount) => {
        agencyPercentages.forEach((agencyPct) => {
          const result = calculateSplit(amount, agencyPct);
          const platformShare = Math.floor(amount * PLATFORM_RATE);
          const creatorSide = amount - platformShare;
          expect(result.creatorNetShare + result.agencyShare).toBe(creatorSide);
        });
      });
    });
  });

  describe("Real-world Gift/Call Scenarios", () => {
    test("Luxury gift (3000 coins) with 25% agency", () => {
      const result = calculateSplit(3000, 25);
      expect(result.platformShare).toBe(1200); // 40% of 3000
      expect(result.agencyShare).toBe(450); // 25% of 1800
      expect(result.creatorNetShare).toBe(1350); // 1800 - 450
      expect(result.platformShare + result.creatorNetShare + result.agencyShare).toBe(3000);
    });

    test("Video call per minute (200 coins) with 10% agency", () => {
      const result = calculateSplit(200, 10);
      expect(result.platformShare).toBe(80); // 40% of 200
      expect(result.agencyShare).toBe(12); // 10% of 120
      expect(result.creatorNetShare).toBe(108); // 120 - 12
      expect(result.platformShare + result.creatorNetShare + result.agencyShare).toBe(200);
    });

    test("Exclusive content unlock (500 coins) no agency", () => {
      const result = calculateSplit(500, null);
      expect(result.platformShare).toBe(200); // 40% of 500
      expect(result.creatorNetShare).toBe(300); // 60% of 500
      expect(result.agencyShare).toBe(0);
      expect(result.platformShare + result.creatorNetShare + result.agencyShare).toBe(500);
    });

    test("Super crush (100 coins) with 15% agency", () => {
      const result = calculateSplit(100, 15);
      expect(result.platformShare).toBe(40); // 40% of 100
      expect(result.agencyShare).toBe(9); // 15% of 60
      expect(result.creatorNetShare).toBe(51); // 60 - 9
      expect(result.platformShare + result.creatorNetShare + result.agencyShare).toBe(100);
    });
  });

  describe("Edge Cases and Rounding", () => {
    test("Odd amounts with floor rounding (77 coins, no agency)", () => {
      const result = calculateSplit(77, null);
      expect(result.platformShare).toBe(30); // floor(77 * 0.4) = floor(30.8) = 30
      expect(result.creatorNetShare).toBe(47); // 77 - 30 = 47
      expect(result.agencyShare).toBe(0);
      expect(result.platformShare + result.creatorNetShare + result.agencyShare).toBe(77);
    });

    test("Odd amounts with agency (77 coins, 15% agency)", () => {
      const result = calculateSplit(77, 15);
      expect(result.platformShare).toBe(30); // floor(77 * 0.4) = 30
      const creatorSide = 77 - 30; // 47
      expect(result.agencyShare).toBe(7); // floor(47 * 0.15) = floor(7.05) = 7
      expect(result.creatorNetShare).toBe(40); // 47 - 7 = 40
      expect(result.platformShare + result.creatorNetShare + result.agencyShare).toBe(77);
    });

    test("Large transaction (10000 coins, 30% agency)", () => {
      const result = calculateSplit(10000, 30);
      expect(result.platformShare).toBe(4000); // 40% of 10000
      expect(result.agencyShare).toBe(1800); // 30% of 6000
      expect(result.creatorNetShare).toBe(4200); // 6000 - 1800
      expect(result.platformShare + result.creatorNetShare + result.agencyShare).toBe(10000);
    });
  });
});
