# Revenue Split Logic Documentation

## Overview

MeetYouLive implements a **40% platform commission** on all revenue-generating transactions. This document provides a comprehensive guide to how revenue is split between the platform, creators, and parent agencies.

## Core Rules

### 1. Platform Always Takes 40%

The platform **ALWAYS** takes exactly 40% of every transaction, calculated **FIRST** before any other splits:

```
platformShare = floor(totalCoins * 0.40)
```

This is a fixed rate that never changes, regardless of agency agreements or creator status.

### 2. Remaining 60% Distribution

After the platform takes its 40%, the remaining 60% is distributed as follows:

#### Scenario A: Creator Has No Parent Agency
```
Creator receives: 60% (the full remaining amount)
```

#### Scenario B: Creator is a SubCreator with Parent Agency
The 60% is split between the subCreator and their parent agency:

```
Parent Agency receives: percentage% of the 60% creator side
SubCreator receives:    remainder of the 60% creator side
```

**Important:** Agency commission only applies when BOTH conditions are met:
- `AgencyRelationship.status === "active"`
- `AgencyRelationship.subCreatorAgreed === true`

### 3. Calculation Order (Atomic)

All calculations follow this precise order to prevent race conditions:

```javascript
Step 1: platformShare = floor(totalCoins * 0.40)          // 40% to platform
Step 2: creatorSide = totalCoins - platformShare          // 60% remains
Step 3: agencyShare = floor(creatorSide * percentage/100) // Parent's cut from 60%
Step 4: creatorNetShare = creatorSide - agencyShare       // Creator's net from 60%
```

## Examples

### Example 1: No Agency (100 coins)
```
Total Transaction:  100 coins
Platform (40%):     40 coins
Creator (60%):      60 coins
Agency:             0 coins
```

### Example 2: With 10% Agency (100 coins)
```
Total Transaction:  100 coins
Platform (40%):     40 coins
Creator Side (60%): 60 coins
  ├─ Agency (10% of 60): 6 coins
  └─ Creator (remainder): 54 coins
```

### Example 3: With 30% Agency (1000 coins)
```
Total Transaction:   1000 coins
Platform (40%):      400 coins
Creator Side (60%):  600 coins
  ├─ Agency (30% of 600): 180 coins
  └─ Creator (remainder):  420 coins
```

### Example 4: Luxury Gift with 25% Agency (3000 coins)
```
Total Transaction:   3000 coins
Platform (40%):      1200 coins
Creator Side (60%):  1800 coins
  ├─ Agency (25% of 1800): 450 coins
  └─ Creator (remainder):   1350 coins
```

## Revenue-Generating Endpoints

All revenue endpoints use the `calculateSplit` function from `agency.service.js` to ensure consistent splits:

### 1. Gifts (gift.controller.js)

**Endpoint:** `POST /api/gifts/send`

**Flow:**
1. Sender selects a gift and quantity
2. Total cost calculated with bundle discounts
3. Deduct coins from sender atomically
4. Calculate split using `calculateSplit`
5. Credit creator's `earningsCoins`
6. Credit parent's `agencyEarningsCoins` (if applicable)
7. Record split details in Gift model
8. Create CoinTransaction records

**Models Updated:**
- `User.coinsBalance` (sender: decrement)
- `User.earningsCoins` (receiver: increment)
- `User.agencyEarningsCoins` (parent: increment if applicable)
- `Gift` (stores all split details)
- `CoinTransaction` (audit trail)

### 2. Video Calls (videoCall.controller.js)

**Endpoints:** 
- `POST /api/calls/:id/respond` (first minute)
- `POST /api/calls/:id/tick` (per-minute billing)

**Flow:**
1. Caller deducts `pricePerMinute` coins atomically
2. Calculate split using `calculateSplit`
3. Credit creator's `earningsCoins`
4. Credit parent's `agencyEarningsCoins` (if applicable)
5. Update VideoCall document with cumulative totals
6. Create CoinTransaction records

**Models Updated:**
- `User.coins` (caller: decrement)
- `User.earningsCoins` (creator: increment)
- `User.agencyEarningsCoins` (parent: increment if applicable)
- `VideoCall` (stores cumulative split totals)
- `CoinTransaction` (audit trail)

### 3. Exclusive Content (exclusiveContent.controller.js)

**Endpoint:** `POST /api/exclusive/:id/unlock`

**Flow:**
1. User deducts `coinPrice` atomically (within session)
2. Calculate split using `calculateSplit`
3. Credit creator's `earningsCoins`
4. Credit parent's `agencyEarningsCoins` (if applicable)
5. Create ExclusiveUnlock record with split details
6. Create CoinTransaction records

**Models Updated:**
- `User.coins` (buyer: decrement)
- `User.earningsCoins` (creator: increment)
- `User.agencyEarningsCoins` (parent: increment if applicable)
- `ExclusiveUnlock` (stores split details)
- `CoinTransaction` (audit trail)

### 4. Super Crush (match.controller.js)

**Endpoint:** `POST /api/matches/super-crush`

**Flow:**
1. User deducts SUPER_CRUSH_PRICE coins atomically (within session)
2. Calculate split using `calculateSplit`
3. Credit creator's `earningsCoins` (if target is approved creator)
4. Credit parent's `agencyEarningsCoins` (if applicable)
5. Create CrushTransaction record with split details

**Models Updated:**
- `User.coins` (sender: decrement)
- `User.earningsCoins` (creator: increment if applicable)
- `User.agencyEarningsCoins` (parent: increment if applicable)
- `CrushTransaction` (stores split details)

## Database Schema

### Transaction Records

All revenue transactions store the complete split breakdown:

#### Gift Model
```javascript
{
  coinCost: Number,           // Total amount
  platformShare: Number,      // Platform's 40%
  creatorShare: Number,       // Creator's net share
  agencyShare: Number,        // Parent agency's share (if any)
  referrerId: ObjectId,       // Parent agency user ID (if any)
  agencyPercentageApplied: Number // Agency percentage used (5-30)
}
```

#### VideoCall Model
```javascript
{
  totalCoinsCharged: Number,  // Cumulative total
  platformShare: Number,      // Cumulative platform 40%
  creatorShare: Number,       // Cumulative creator net
  agencyShare: Number,        // Cumulative agency share
  referrerId: ObjectId,       // Parent agency user ID
  agencyPercentageApplied: Number
}
```

#### ExclusiveUnlock Model
```javascript
{
  coinsPaid: Number,          // Total amount
  platformShare: Number,      // Platform's 40%
  creatorShare: Number,       // Creator's net share
  agencyShare: Number,        // Parent agency's share
  referrerId: ObjectId,       // Parent agency user ID
  agencyPercentageApplied: Number
}
```

### CoinTransaction Records

Every revenue event creates audit trail records:

```javascript
// Buyer/Sender (debit)
{
  userId: senderId,
  type: "gift_sent" | "private_call" | "content_unlock" | ...,
  amount: -totalAmount,
  status: "completed",
  metadata: { ... }
}

// Creator (credit)
{
  userId: creatorId,
  type: "gift_received" | "private_call" | "content_earned" | ...,
  amount: creatorNetShare,
  status: "completed",
  metadata: { ... }
}

// Parent Agency (credit, if applicable)
{
  userId: parentCreatorId,
  type: "agency_earned",
  amount: agencyShare,
  status: "completed",
  metadata: { ... }
}
```

## Security & Atomicity

### Atomic Operations

All revenue transactions use one of these atomic patterns:

#### 1. Mongoose Sessions (Transaction)
```javascript
const session = await mongoose.startSession();
await session.withTransaction(async () => {
  // 1. Deduct coins (with balance check)
  await User.findByIdAndUpdate(
    senderId, 
    { $inc: { coins: -amount } },
    { session }
  );
  
  // 2. Calculate split
  const { platformShare, creatorNetShare, agencyShare } = 
    calculateSplit(amount, agencyPercentage);
  
  // 3. Credit creator
  await User.findByIdAndUpdate(
    creatorId,
    { $inc: { earningsCoins: creatorNetShare } },
    { session }
  );
  
  // 4. Credit parent (if applicable)
  if (agencyShare > 0 && referrerId) {
    await User.findByIdAndUpdate(
      referrerId,
      { $inc: { agencyEarningsCoins: agencyShare } },
      { session }
    );
  }
});
```

#### 2. Atomic findOneAndUpdate
```javascript
// Deduct coins only if sufficient balance exists
const updated = await User.findOneAndUpdate(
  { _id: userId, coins: { $gte: amount } },
  { $inc: { coins: -amount } },
  { new: true }
);

if (!updated) {
  return res.status(402).json({ 
    message: "Monedas insuficientes" 
  });
}
```

### Agency Commission Safety Gate

All endpoints verify BOTH conditions before applying agency commission:

```javascript
const agencyRel = await AgencyRelationship.findOne({
  subCreator: creatorId,
  status: "active",
  subCreatorAgreed: true  // Required!
});

const agencyPercentage = 
  (agencyRel && agencyRel.percentage > 0) 
    ? agencyRel.percentage 
    : null;
```

### Fire-and-Forget Transaction Logging

CoinTransaction records are created with `.catch()` to prevent transaction failures from blocking revenue flow:

```javascript
CoinTransaction.create([
  { userId, type, amount, reason, status, metadata }
]).catch((err) => {
  console.error("[tx] Failed to record:", err);
});
```

## Frontend Integration

### DO NOT Calculate on Frontend

The frontend **NEVER** calculates revenue splits. It only:

1. Displays total cost to the user
2. Sends transaction request to backend
3. Shows confirmation/error messages
4. Updates UI on socket events

### Display Commission Info

The frontend can use the `calcSplit` helper from `frontend/lib/commission.js` to **display** estimated splits to users, but these are for UI purposes only. The backend always recalculates.

```javascript
import { calcSplit } from '@/lib/commission';

// For display only - backend will recalculate
const preview = calcSplit(giftCost, agencyPercentage);
// preview: { platform: 40, creator: 54, agency: 6 }
```

## Testing

### Unit Tests

Run the comprehensive test suite:

```bash
cd backend
npm test -- agency.service.test.js
```

The test suite includes 19 tests covering:
- ✓ No agency scenarios
- ✓ Various agency percentages (5-30%)
- ✓ Edge cases (odd amounts, rounding)
- ✓ Real-world scenarios (gifts, calls, content)
- ✓ Platform always gets exactly 40%
- ✓ Invalid agency percentages

### Manual Testing

1. **Create test accounts:**
   - Regular user (buyer)
   - Approved creator (receiver)
   - Parent creator with agency relationship

2. **Test each revenue endpoint:**
   - Send gift: Verify split in Gift model
   - Video call: Verify split in VideoCall model
   - Unlock content: Verify split in ExclusiveUnlock model
   - Super crush: Verify split in CrushTransaction model

3. **Verify database updates:**
   - Check `User.coinsBalance` (sender)
   - Check `User.earningsCoins` (creator)
   - Check `User.agencyEarningsCoins` (parent)
   - Check `CoinTransaction` records

4. **Test edge cases:**
   - Agency relationship with `subCreatorAgreed: false` → no agency split
   - Creator with no parent → full 60% to creator
   - Invalid agency percentage → treated as no agency

## Common Issues

### Issue 1: Agency Not Receiving Commission

**Cause:** Missing `subCreatorAgreed: true` check

**Solution:** Ensure query includes both conditions:
```javascript
AgencyRelationship.findOne({
  subCreator: creatorId,
  status: "active",
  subCreatorAgreed: true  // Must be true!
})
```

### Issue 2: Platform Share Incorrect

**Cause:** Calculating creator share first instead of platform share

**Solution:** Always use `calculateSplit` function, never calculate manually:
```javascript
// ❌ Wrong
const creatorShare = floor(amount * 0.60);
const platformShare = amount - creatorShare;

// ✓ Correct
const { platformShare, creatorNetShare, agencyShare } = 
  calculateSplit(amount, agencyPercentage);
```

### Issue 3: Rounding Errors

**Cause:** Not using `Math.floor()` consistently

**Solution:** The `calculateSplit` function handles all rounding correctly. Always use it.

## Maintenance

When adding new revenue-generating features:

1. ✅ Import `calculateSplit` from `agency.service.js`
2. ✅ Query `AgencyRelationship` with both `status: "active"` AND `subCreatorAgreed: true`
3. ✅ Use mongoose sessions or atomic updates
4. ✅ Store all split details in the transaction model
5. ✅ Create `CoinTransaction` records (fire-and-forget)
6. ✅ Add tests to verify 40% platform share
7. ✅ Update this documentation

## References

- **Service:** `/backend/src/services/agency.service.js`
- **Tests:** `/backend/src/services/__tests__/agency.service.test.js`
- **Endpoints:**
  - `/backend/src/controllers/gift.controller.js`
  - `/backend/src/controllers/videoCall.controller.js`
  - `/backend/src/controllers/exclusiveContent.controller.js`
  - `/backend/src/controllers/match.controller.js`
- **Frontend Display:** `/frontend/lib/commission.js`

---

**Last Updated:** 2026-04-30  
**Version:** 1.0
