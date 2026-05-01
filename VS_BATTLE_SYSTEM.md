# Live VS Battle System

## Overview
The VS Battle system allows two live creators to compete in real-time. Viewers send gifts to their favorite creator, and the gift coins are added to the creator's score. When the battle time expires, the system determines the winner based on total scores.

## Backend Implementation

### 1. Live Model Updates (`backend/src/models/Live.js`)
Added the following fields to the Live schema:

- `isVsActive`: Boolean - Indicates if a VS battle is currently active
- `opponentId`: ObjectId (ref: Live) - Reference to the opponent's live room
- `vsStartTime`: Date - When the battle started
- `vsDuration`: Number - Battle duration in seconds
- `vsScore`: Object
  - `host`: Number - Current score for this live's host
  - `opponent`: Number - Current score for the opponent

### 2. API Endpoint
**POST /api/live/:id/start-vs**
- Requires authentication (`verifyToken`)
- Body parameters:
  - `opponentLiveId`: String (required) - ID of the opponent's live room
  - `durationMinutes`: Number (required, 1-60) - Battle duration in minutes

Validations:
- Both lives must be active (`isLive: true`)
- Neither live can have an active battle already
- Host must be the owner of the live room
- Cannot start a battle with yourself

Response:
```json
{
  "message": "Batalla VS iniciada",
  "vsStartTime": "2026-05-01T12:00:00.000Z",
  "vsDuration": 300,
  "opponentLiveId": "507f1f77bcf86cd799439011"
}
```

### 3. Gift Scoring Logic (`backend/src/controllers/gift.controller.js`)
When a gift is sent during an active VS battle:
1. The gift's coin cost is added to the host's score (`vsScore.host`)
2. Both live rooms fetch the opponent's score
3. Each live room updates its `vsScore.opponent` field with the opponent's current host score
4. Socket events are emitted to both rooms with updated scores

### 4. Socket Events

#### `vs_battle_started`
Emitted to both live rooms when a battle starts.
```javascript
{
  vsStartTime: "2026-05-01T12:00:00.000Z",
  vsDuration: 300,
  hostLiveId: "...",
  hostUsername: "Creator1",
  opponentLiveId: "...",
  opponentUsername: "Creator2",
  role: "host" // or "opponent"
}
```

#### `vs_update`
Emitted to both live rooms whenever a gift is sent.
```javascript
{
  hostScore: 1500,
  opponentScore: 2000
}
```

#### `vs_result`
Emitted to both live rooms when the battle time expires.
```javascript
{
  winner: "host", // or "opponent" or "tie"
  hostScore: 5000,
  opponentScore: 4500,
  hostUsername: "Creator1",
  opponentUsername: "Creator2"
}
```

### 5. Automatic Battle End
When a battle is started, a timer is automatically scheduled to end the battle when the duration expires. The `endVsBattleAutomatically` function:
1. Retrieves both live rooms
2. Compares the final scores to determine the winner
3. Resets all VS battle fields to their default values
4. Emits `vs_result` events to both rooms

## Usage Flow

1. **Creator A** starts their live stream
2. **Creator B** starts their live stream
3. **Creator A** calls `POST /api/live/{liveId}/start-vs` with Creator B's live ID
4. Both live rooms receive `vs_battle_started` event
5. Viewers send gifts to their favorite creator
6. Each gift updates the scores and emits `vs_update` to both rooms
7. When the timer expires, both rooms receive `vs_result` with the final winner

## Notes

- The VS battle system is independent of the existing "battle" feature (team battle)
- Scores are tracked per live room, not per user
- All gift coins count toward the VS score, regardless of gift type
- The platform commission and agency split still apply to gifts sent during VS battles
- VS battle state is automatically cleared when the battle ends
- If either live ends before the battle timer expires, the battle continues in the other live room (but scoring stops)

## Future Enhancements

Potential improvements for future versions:
- Add a VS battle acceptance flow (require opponent approval)
- Display live VS battle UI in the frontend
- Add VS battle history and leaderboards
- Allow viewers to switch between both live rooms during battle
- Add notifications when a VS battle is started or ends
- Store VS battle results in a separate collection for analytics
