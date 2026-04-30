# Gift Combo System

## Overview
The Gift Combo System encourages rapid gift sending by tracking consecutive gifts sent by users within a 3-second window and displaying animated combo notifications.

## Backend Implementation

### 1. Data Model (`backend/src/models/Live.js`)
- Added `userComboSchema` to track combo state per user
- Added `userCombos` Map field to Live model
- Schema includes:
  - `userId`: User ID (String)
  - `username`: User's display name
  - `comboCount`: Current combo streak count
  - `lastGiftAt`: Timestamp of last gift

### 2. Combo Tracking Logic (`backend/src/controllers/gift.controller.js`)
- Implemented in the `sendGift` function after transaction completion
- **Combo Window**: 3 seconds (3000ms)
- **Logic**:
  1. Check if user has an existing combo entry
  2. If last gift was within 3 seconds: increment combo count
  3. Otherwise: reset to 1
  4. Update combo state in database
  5. Emit `GIFT_COMBO` socket event if combo >= 2

### 3. Socket Event
- **Event Name**: `GIFT_COMBO`
- **Payload**:
  ```javascript
  {
    liveId: String,
    userId: String,
    username: String,
    comboCount: Number
  }
  ```

## Frontend Implementation

### 1. Component (`frontend/components/GiftComboNotification.jsx`)
- Client-side component with real-time animations
- **Display Format**: "🔥 {username} x{N} COMBO!"
- **Animations**:
  - Slide-in with bounce effect
  - Shake animation on entry
  - Pulse effect for high combos (5+)
  - Fire emoji spin animation
- **Intensity Levels**:
  - Normal: 2-4 combo
  - Big: 5-9 combo (with pulse)
  - Huge: 10-19 combo (enhanced glow)
  - Mega: 20+ combo (mega pulse, gold accent)
- **Auto-hide**: 3 seconds after display

### 2. Integration (`frontend/app/live/[id]/page.jsx`)
- State variable: `currentCombo`
- Socket event handler: `onGiftCombo`
- Component rendered in live page overlay layer
- Positioned at top center (20% from top)

## Usage Flow

### User Experience
1. User sends a gift in a live stream
2. If user sends another gift within 3 seconds:
   - Backend increments combo count
   - `GIFT_COMBO` event emitted to all viewers
   - Notification appears: "🔥 Juan x2 COMBO!"
3. If user waits >3 seconds:
   - Combo resets to 1 (no notification shown)
4. Combo continues to grow with each rapid gift
5. Higher combos trigger more intense animations

### Expected Behavior
- **Minimum combo**: 2 (first rapid gift)
- **No maximum**: Combo can grow indefinitely
- **Reset trigger**: Any gap >3 seconds between gifts
- **Visual feedback**: Increases excitement and encourages continued gifting
- **Social proof**: All viewers see the combo, creating FOMO

## Testing

### Manual Test Steps
1. **Setup**: Start backend server and open a live stream in two browser tabs
2. **Test Combo Increment**:
   - Send a gift from user A
   - Within 3 seconds, send another gift from user A
   - ✅ Verify "🔥 UserA x2 COMBO!" appears
   - Send another gift within 3 seconds
   - ✅ Verify "🔥 UserA x3 COMBO!" appears
3. **Test Combo Reset**:
   - Wait 4+ seconds
   - Send another gift from user A
   - ✅ Verify combo resets (no notification or back to x1)
4. **Test Multiple Users**:
   - User A sends gifts rapidly (builds combo)
   - User B sends gifts rapidly (builds separate combo)
   - ✅ Verify both users can have independent combos
5. **Test Animation Intensity**:
   - Build combo to 5+
   - ✅ Verify pulse animation appears
   - Build combo to 10+
   - ✅ Verify enhanced glow
   - Build combo to 20+
   - ✅ Verify mega pulse with gold tones

### Database Verification
```javascript
// Check combo state in MongoDB
db.lives.findOne({ _id: ObjectId("liveId") }, { userCombos: 1 })

// Expected structure:
{
  userCombos: {
    "userId1": {  // String key (user ID)
      userId: "userId1",  // String value (matches key)
      username: "Juan",
      comboCount: 5,
      lastGiftAt: ISODate("2026-04-30T...")
    }
  }
}
```

### Socket Event Verification
```javascript
// Listen for GIFT_COMBO events in browser console
socket.on("GIFT_COMBO", (data) => {
  console.log("Combo event:", data);
  // Expected: { liveId, userId, username, comboCount }
});
```

## Performance Considerations

### Backend
- **Fire-and-forget**: Combo tracking is async, doesn't block gift transaction
- **Database operations**: Single document update per gift
  - **Note**: Current implementation queries and updates the database for every gift. For high-traffic scenarios, consider using Redis or in-memory caching for temporary combo state, then periodically syncing to MongoDB.
- **Memory**: Mongoose Map stores combos in-memory until save
- **Cleanup**: Old combo entries remain until overwritten (acceptable for short-lived live sessions)

### Frontend
- **State updates**: Single state variable for current combo
- **Animation overhead**: CSS-only animations (no JS animation loops)
- **Memory**: Auto-cleanup via setTimeout after 3 seconds
- **Socket listeners**: Proper cleanup in useEffect return

## Future Enhancements

### Potential Improvements
1. **Combo rewards**: Award bonus coins or badges for high combos
2. **Leaderboard**: Track highest combo per live stream
3. **Sound effects**: Add audio cues for combo milestones
4. **Combo multipliers**: Increase gift value with combo count
5. **Combo decay**: Gradual decrease instead of instant reset
6. **Combo challenges**: Time-limited combo goals for viewers
7. **Persistent combos**: Store combo history in user profile
8. **Multi-user combos**: Collaborative combo counting

### Known Limitations
1. **No persistence**: Combos reset when live stream ends
2. **No combo history**: Only current combo is tracked
3. **Single live scope**: Combos don't carry across different lives
4. **No server-side cleanup**: Old combo entries remain in Live document
5. **Race conditions**: Rapid concurrent gifts might have timing edge cases

## Related Features
- **Gift System**: Core gift sending functionality
- **Top Supporter**: Tracks highest spender (similar tracking pattern)
- **Live Goals**: Uses similar fire-and-forget update pattern
- **Socket Events**: Consistent real-time event pattern

## Code References
- Backend Model: `backend/src/models/Live.js`
- Backend Controller: `backend/src/controllers/gift.controller.js` (combo tracking in sendGift function)
- Frontend Component: `frontend/components/GiftComboNotification.jsx`
- Live Page Integration: `frontend/app/live/[id]/page.jsx`
