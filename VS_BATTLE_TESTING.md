# VS Battle System - Testing Scenarios

## Prerequisites
- Two live streams must be active
- Both creators must be authenticated
- Gift catalog must be seeded

## Test Scenarios

### Scenario 1: Start VS Battle Successfully
**Steps:**
1. Creator A starts a live stream (Live A)
2. Creator B starts a live stream (Live B)
3. Creator A calls: `POST /api/live/{liveAId}/start-vs`
   ```json
   {
     "opponentLiveId": "liveB_id",
     "durationMinutes": 5
   }
   ```

**Expected Results:**
- Status 200 response with battle details
- Both rooms receive `vs_battle_started` socket event
- Both Live documents have `isVsActive: true`
- Timer scheduled for 5 minutes

### Scenario 2: Send Gifts During Battle
**Steps:**
1. After starting a VS battle
2. Viewer in Live A sends a gift worth 100 coins to Creator A
3. Viewer in Live B sends a gift worth 150 coins to Creator B

**Expected Results:**
- Live A: `vsScore.host = 100`, `vsScore.opponent = 150`
- Live B: `vsScore.host = 150`, `vsScore.opponent = 100`
- Both rooms receive `vs_update` events with current scores
- Standard gift animations and notifications still work

### Scenario 3: Battle End (Host Wins)
**Steps:**
1. Start a VS battle with 1 minute duration
2. Creator A receives gifts totaling 1000 coins
3. Creator B receives gifts totaling 800 coins
4. Wait for 1 minute to elapse

**Expected Results:**
- Both lives receive `vs_result` event
- Live A sees: `winner: "host"`, `hostScore: 1000`, `opponentScore: 800`
- Live B sees: `winner: "opponent"`, `hostScore: 800`, `opponentScore: 1000`
- Both lives reset: `isVsActive: false`, scores reset to 0

### Scenario 4: Battle End (Tie)
**Steps:**
1. Start a VS battle
2. Both creators receive exactly 500 coins
3. Wait for battle to end

**Expected Results:**
- Both lives receive `vs_result` with `winner: "tie"`
- Both scores are 500

### Scenario 5: Validation - Already Active Battle
**Steps:**
1. Creator A starts VS battle with Creator B
2. Creator A tries to start another VS battle with Creator C

**Expected Results:**
- Status 400: "Ya tienes una batalla activa"
- No new battle is created

### Scenario 6: Validation - Opponent Already in Battle
**Steps:**
1. Creator A starts VS battle with Creator B
2. Creator C tries to start a VS battle with Creator B

**Expected Results:**
- Status 400: "El oponente ya tiene una batalla activa"
- No new battle is created

### Scenario 7: Validation - Invalid Duration
**Steps:**
1. Try to start VS battle with `durationMinutes: 0`
2. Try to start VS battle with `durationMinutes: 100`

**Expected Results:**
- Status 400: "durationMinutes debe estar entre 1 y 60"

### Scenario 8: Validation - Invalid Live ID
**Steps:**
1. Try to start VS battle with non-existent live ID
2. Try to start VS battle with inactive live

**Expected Results:**
- Status 404: "Directo oponente no encontrado o no está en vivo"

### Scenario 9: Validation - Self Battle
**Steps:**
1. Creator A tries to start a VS battle with their own live room

**Expected Results:**
- Status 400: "No puedes iniciar una batalla contigo mismo"

### Scenario 10: Multiple Viewers Sending Gifts
**Steps:**
1. Start VS battle
2. 5 viewers in Live A each send 100 coin gifts
3. 3 viewers in Live B each send 200 coin gifts

**Expected Results:**
- Live A score: 500 coins
- Live B score: 600 coins
- All viewers see updated scores via `vs_update` events
- No race conditions or score inconsistencies

## Socket Event Listeners (Frontend Testing)

```javascript
// Listen for battle started
socket.on("vs_battle_started", (data) => {
  console.log("Battle started:", data);
  // data: { vsStartTime, vsDuration, hostLiveId, hostUsername, opponentLiveId, opponentUsername, role }
});

// Listen for score updates
socket.on("vs_update", (data) => {
  console.log("Scores updated:", data);
  // data: { hostScore, opponentScore }
});

// Listen for battle result
socket.on("vs_result", (data) => {
  console.log("Battle ended:", data);
  // data: { winner, hostScore, opponentScore, hostUsername, opponentUsername }
});
```

## API Testing with cURL

```bash
# Start VS battle
curl -X POST http://localhost:10000/api/live/{liveId}/start-vs \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "opponentLiveId": "OPPONENT_LIVE_ID",
    "durationMinutes": 5
  }'

# Send a gift during battle
curl -X POST http://localhost:10000/api/gifts/send \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "receiverId": "CREATOR_USER_ID",
    "giftSlug": "neon-heart",
    "liveId": "LIVE_ID",
    "quantity": 1
  }'
```

## Notes
- VS battles are independent of the existing "battle" system (team battles)
- Gifts sent during VS battles still count toward creator earnings, top supporter, combos, etc.
- The 40% platform commission and agency splits still apply
- VS battle scores are reset when a new battle starts or when one ends
