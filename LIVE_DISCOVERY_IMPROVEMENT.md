# Live Discovery Improvement (Tango-Style Structure)

## Overview
This feature enhances the live feed to increase engagement and monetization without relying on NSFW content. It implements a Tango-style discovery interface with rich metadata, dynamic tags, and improved visual hierarchy.

## Backend Changes

### 1. Live Model Extensions (`backend/src/models/Live.js`)
- **New Field**: `isTrending` (Boolean, default: false) - Flag to mark trending streams

### 2. API Enhancements (`backend/src/controllers/live.controller.js`)

#### GET `/api/lives`
Now includes:
- `viewerCount` - Current number of viewers
- `totalCoinsEarned` - Total coins earned from gifts in this live session
- `isTrending` - Computed flag based on engagement metrics
- `creatorStatus` - Approval status of the creator

**Trending Logic:**
A live stream is marked as trending if:
- Viewer count >= 10 viewers, OR
- Total coins earned >= 500 coins

These thresholds can be adjusted in the controller:
```javascript
const TRENDING_VIEWER_THRESHOLD = 10;
const TRENDING_COINS_THRESHOLD = 500;
```

## Frontend Changes

### 1. LiveCard Component (`frontend/components/LiveCard.jsx`)

#### New Visual Elements

**Tags** (displayed in top-right corner):
- 🔥 **TRENDING** - Shows when `isTrending` is true
  - Red gradient background with pulse animation
  - Highest visual priority
- ⭐ **TOP** - Shows for approved creators with 50+ viewers
  - Gold gradient background
  - Indicates high-quality, popular streams
- ✨ **NUEVO** - Shows for streams created less than 10 minutes ago
  - Purple gradient background
  - Helps discovery of new content

**Battle Mode Indicator:**
- ⚔️ **VS** - Shows when `battle.active` is true
  - Red gradient, displayed next to category tag
  - Indicates competitive/battle streams

**Enhanced Stats Display:**
- 👁️ Viewer count - Already existed, now with enhanced styling
- 💎 Total coins earned - NEW, replaces gift count
  - Purple gradient background
  - Shows monetization activity

**Layout Improvements:**
- Thumbnail height increased: 162px → 200px (23% larger)
- Stronger contrast with enhanced gradient backgrounds
- Better backdrop blur effects (8px → 10px)
- Improved stat chip visibility with bolder fonts

### 2. Explore Page (`frontend/app/explore/page.jsx`)

#### Category Filters
Updated categories to match requirements:
- 🌐 Todos (All)
- 🎵 Música (Music)
- 🎮 Gaming
- 💬 Chat
- 💕 Dating

Previous categories (Arte, Educación, Otro) were replaced to focus on core engagement categories.

## User Experience

### Discovery Flow
1. **Trending Streams** - Immediately visible with 🔥 badge
2. **Top Creators** - Established creators with high engagement get ⭐ badge
3. **New Content** - Fresh streams get ✨ badge for 10 minutes
4. **Battle Modes** - Competitive streams clearly marked with ⚔️ VS

### Engagement Metrics
- **Viewer Count** - Social proof, shown prominently
- **Coins Earned** - Monetization indicator, encourages gifting
- **Creator Badge** - Verified approved creators (⭐ in user row)
- **Live Status** - Pulsing "EN VIVO" badge with red dot

### Visual Hierarchy
1. Trending tag (top-right, animated)
2. Top creator / New tags (below trending)
3. EN VIVO badge (top-left, pulsing)
4. VS badge (next to category, if battle active)
5. Stats (bottom-right: viewers, coins)

## Technical Details

### Data Flow
```
Backend:
1. Live.find({ isLive: true })
2. Aggregate gift totals by liveId
3. Calculate isTrending based on thresholds
4. Attach totalCoinsEarned to each live
5. Return sanitized live objects

Frontend:
1. Fetch /api/lives
2. LiveCard receives live object with new fields
3. Compute display flags (isNew, isApprovedCreator)
4. Render tags conditionally based on flags
5. Display enhanced stats with icons
```

### Performance Considerations
- Gift aggregation runs once per API call (not per live)
- Uses MongoDB aggregation pipeline for efficiency
- Frontend computes display flags client-side (no extra API calls)
- Tags are conditionally rendered (no DOM overhead when not shown)

## Future Enhancements

### Potential Improvements
1. **Personalization** - Show "Recommended for You" tag based on user preferences
2. **Time-based Trending** - Adjust thresholds based on time of day
3. **Category-specific Thresholds** - Different trending rules per category
4. **Trending Duration** - Auto-reset trending flag after X hours
5. **Live Goals Integration** - Show goal progress in card
6. **Multi-creator Highlights** - Special badges for multi-guest streams

### Monitoring Metrics
Track:
- Click-through rate by tag type (trending vs top vs new)
- Average session duration by discovery method
- Gift conversion rate from trending streams
- Category filter usage patterns

## Testing

### Backend Testing
```bash
# Test API response
curl http://localhost:10000/api/lives | jq '.[] | {title, viewerCount, totalCoinsEarned, isTrending}'
```

### Frontend Testing
1. Start multiple lives with varying viewer counts
2. Send gifts to create totalCoinsEarned variance
3. Verify tags appear/disappear based on thresholds
4. Test category filters
5. Verify responsive layout on mobile

### Edge Cases
- ✅ Live with 0 viewers - Shows but not trending
- ✅ Live with 0 coins - Shows only viewer count
- ✅ New live (<10min) with high engagement - Shows both NUEVO and TRENDING
- ✅ Battle mode active - Shows VS badge
- ✅ Private live - Shows private badge, works with new layout

## Deployment Notes

### Backend
- No database migration required (isTrending is optional field)
- Existing lives will show isTrending: false until engagement thresholds met
- Backward compatible with existing clients

### Frontend
- Build verified successful
- All 58 pages build without errors
- New fields gracefully degrade if backend not updated (shows 0)

## Conclusion

This implementation transforms the live discovery experience with:
- **Clear visual signals** for trending/quality content
- **Monetization visibility** through coin display
- **Competitive indicators** for battle modes
- **Focused categories** for better discovery
- **Enhanced layout** for stronger presence

All changes maintain backward compatibility and follow existing conventions (CommonJS backend, client components, styled-jsx).
