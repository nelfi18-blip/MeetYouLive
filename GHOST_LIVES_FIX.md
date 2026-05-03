# Ghost Lives / Old Videos Fix

## Problem
Old videos or old live sessions were appearing as if they were currently live, showing "EN VIVO" badges even after the stream had ended or became stale. This created a poor user experience where users would click on "live" streams that were actually ended or inactive.

## Root Cause
The system was relying solely on the `isLive` boolean flag in the database without validating:
1. Whether the live stream had actually ended (`endedAt` not set)
2. Whether the live stream was too old to be considered active (> 6 hours)
3. Whether the socket connection was still valid

This led to "ghost lives" - database records marked as active but representing ended or stale streams.

## Solution

### 1. Live Validation Service
Created a new service (`backend/src/services/live.service.js`) with:

#### `isLiveActuallyActive(live)`
A helper function that validates if a live stream is truly active by checking:
- `isLive === true` (database flag)
- `endedAt` is null or missing (not ended)
- `createdAt` exists (has a start time)
- Stream duration < 6 hours (not stale)

#### `MAX_LIVE_DURATION_MS`
Constant set to 6 hours (21,600,000 ms). Any live stream older than this is automatically considered stale and invalid.

#### `cleanupStaleLives()`
Background function that finds all stale lives and marks them as ended by setting:
- `isLive = false`
- `endedAt = new Date()`

This runs automatically when live listing endpoints are called.

#### `markLiveAsEnded(liveId)`
Utility function to mark a specific live as ended.

### 2. Backend Updates

#### Live Controller (`backend/src/controllers/live.controller.js`)
- **`getLives()`** - Public live listing endpoint
  - Runs `cleanupStaleLives()` in background (fire-and-forget)
  - Filters lives using `isLiveActuallyActive()` helper
  - Removes stale/ghost lives from public view
  
- **`getLiveById()`** - Single live detail endpoint
  - Validates live is active before returning details
  - Marks stale lives as ended if detected
  - Returns 404 for inactive/stale lives
  
- **`joinLive()`** - Join live stream endpoint
  - Validates live is active before allowing join
  - Marks stale lives as ended if detected
  - Prevents joining ended/stale streams

- **`endLive()`** - Already correctly sets both `isLive=false` and `endedAt`

#### Admin Controller (`backend/src/controllers/admin.controller.js`)
- **`getActiveLives()`** - Admin live monitoring
  - Runs `cleanupStaleLives()` in background
  - Filters lives using `isLiveActuallyActive()`
  - Shows only truly active lives to admins
  
- **`getOverview()`** - Admin dashboard stats
  - Runs `cleanupStaleLives()` before counting
  - Counts only truly active lives in statistics
  - Ensures accurate "active lives" metric

#### Rankings Controller (`backend/src/controllers/rankings.controller.js`)
- **`getFeaturedCreators()`** - Featured/trending lives
  - Filters live streams using `isLiveActuallyActive()`
  - Shows only active lives in featured section

#### Creator Discovery Controller (`backend/src/controllers/creatorDiscovery.controller.js`)
- **`getCreatorsForDiscovery()`** - Public creator discovery
  - Fetches full live documents (not aggregates)
  - Validates each live with `isLiveActuallyActive()`
  - Filters out stale lives from creator cards

### 3. Frontend Updates

#### Explore Page (`frontend/app/explore/page.jsx`)
- Updated empty state message to "No hay directos ahora mismo" (more natural Spanish)
- Removed redundant word "activos" from the message

#### Component Validation
All frontend components that show "EN VIVO" already rely on backend data:
- **LiveCard** - Shows "EN VIVO" only for lives returned by backend
- **ProfileCard** - Checks `isLive` flag from backend user data
- **CreatorDiscoveryCard** - Checks `isLive` flag from backend
- **Badge component** - Used only when backend confirms live status

No frontend changes needed since all components correctly trust backend data.

## Implementation Details

### Validation Logic
```javascript
function isLiveActuallyActive(live) {
  if (!live) return false;
  if (live.isLive !== true) return false;
  if (live.endedAt != null) return false;
  if (!live.createdAt) return false;
  
  const duration = Date.now() - new Date(live.createdAt).getTime();
  if (duration > MAX_LIVE_DURATION_MS) return false;
  
  return true;
}
```

### Cleanup Strategy
- **Automatic**: Runs in background when live endpoints are called
- **Non-blocking**: Uses `.catch()` to prevent errors from breaking requests
- **Efficient**: Uses `updateMany()` for batch updates
- **Safe**: Only updates lives that meet strict stale criteria

### Why 6 Hours?
- Covers longest realistic live streams (marathons, special events)
- Prevents indefinite ghost lives from accumulating
- Balances between safety and cleanup frequency
- Can be adjusted via `MAX_LIVE_DURATION_MS` constant

## Testing

### Test Coverage
Created comprehensive test suite (`backend/test-live-validation.js`):
1. ✓ Active live (recent) - Returns true
2. ✓ Stale live (>6 hours) - Returns false
3. ✓ Ghost live (has endedAt) - Returns false
4. ✓ Not live (isLive=false) - Returns false
5. ✓ Missing createdAt - Returns false
6. ✓ Boundary case (exactly 6 hours) - Returns true
7. ✓ Null input - Returns false

### Build Validation
- ✓ Backend syntax check passed
- ✓ Frontend build successful (no errors)
- ✓ All dependencies installed correctly

## Expected Results

### Before Fix
- Old lives showed as "EN VIVO" for hours/days
- Clicking on "live" streams showed ended content
- Admin dashboard showed inflated active live counts
- Featured/trending sections showed stale content

### After Fix
- Only truly active lives appear as "EN VIVO"
- Stale lives automatically cleaned up
- Admin dashboard shows accurate counts
- All discovery/ranking features show current lives only
- Empty state shows when no active lives exist

## Impact Analysis

### User Experience
- ✓ No false "live" indicators
- ✓ Accurate live stream discovery
- ✓ Better empty state messaging
- ✓ Improved trust in platform

### Performance
- Minimal impact - cleanup runs in background
- Fire-and-forget design prevents blocking
- Batch updates for efficiency
- No additional database queries for validation

### Maintenance
- Single source of truth (`isLiveActuallyActive`)
- Easy to adjust max duration constant
- Comprehensive test coverage
- Clear documentation

## Future Improvements

### Potential Enhancements
1. **Scheduled Cleanup**: Add cron job for periodic stale live cleanup
2. **Metrics**: Track number of stale lives cleaned per day
3. **Alerts**: Notify admins when many stale lives detected
4. **Configurable Duration**: Make max duration configurable via admin settings
5. **Grace Period**: Add 5-10 minute grace period for reconnection attempts

### Monitoring
Consider adding:
- Dashboard widget showing cleanup stats
- Alert when cleanup count exceeds threshold
- Average live duration metrics
- Stale live rate tracking

## Breaking Changes
None. This fix is backward compatible and only improves accuracy.

## Related Files
- `backend/src/services/live.service.js` (new)
- `backend/src/controllers/live.controller.js`
- `backend/src/controllers/admin.controller.js`
- `backend/src/controllers/rankings.controller.js`
- `backend/src/controllers/creatorDiscovery.controller.js`
- `frontend/app/explore/page.jsx`
- `backend/test-live-validation.js` (new)

## Rollback Plan
If issues occur, revert commits in reverse order:
1. Revert test addition
2. Revert rankings/discovery updates
3. Revert frontend changes
4. Revert admin controller updates
5. Revert live controller updates
6. Remove live.service.js

Each commit is self-contained and can be reverted independently.
