# Hybrid Feed (Match + Live Intelligent Mix)

## Overview

The Hybrid Feed is an intelligent content discovery system that combines live streaming content with dating profiles in a single, cohesive feed. This feature merges the best of both worlds: real-time entertainment (live streams) and meaningful connections (dating profiles).

## Key Features

### 1. Intelligent Content Mixing

- **60% Live Content**: Active live streams from approved creators
- **40% Match Profiles**: Dating profiles from regular users
- Smart interleaving pattern ensures good distribution and variety

### 2. Priority Algorithm

Content is ranked and displayed based on multiple factors:

#### Live Streams Priority
1. **Verified Creators** (+1000 points)
2. **Active Viewers** (viewerCount × 10 points)
3. **Earning Streams** (totalCoinsEarned points)
4. **New Streams** (+500 points for streams < 10 minutes old)

#### Match Profiles Priority
1. **New Users** (+800 points for accounts < 7 days old)
2. **Complete Profiles** (+300 points for bio, location, interests)
3. **Profile Photos** (+200 points)
4. **Randomness** (+0-100 points for variety)

### 3. Tab Navigation

- **⭐ Para Ti (For You)**: Default view with intelligent 60/40 mix
- **❤️ Match**: Dating profiles only
- **🔴 Live**: Live streams only
- **🔥 Top**: Trending content (70% live, 30% match)

### 4. Hook System

Engagement hooks displayed on cards to drive interaction:

- **👁️ Te visitó Nx**: Shows profile visit count
- **👋 Te envió un saludo**: Indicates received greeting
- **🔴 En vivo ahora**: Real-time live status badge

### 5. Monetization Integration

Each card includes context-aware CTAs:

#### Live Cards
- **🎥 Únete al live**: Direct link to live stream
- **🎁 Envía regalo**: Opens gift panel in live stream

#### Match Cards
- **👋 Saluda**: Send greeting (free/low-cost)
- **🎁 Envía regalo**: Available for creators
- **💬 Desbloquear chat**: Premium chat unlock

### 6. User Experience Rules

**Clear Separation:**
- Live cards have distinct visual style (Tango-inspired)
- Match cards use Tinder-style swipe interface
- Clear visual indicators prevent confusion

**No Confusion:**
- Creators only appear in Live feed when streaming
- Regular users only appear in Match feed
- Offline creators are never shown in Live

## Backend API

### Endpoints

#### Main Feed Endpoints

```
GET /api/feed/hybrid
GET /api/feed/live-only
GET /api/feed/match-only
GET /api/feed/top
```

**Query Parameters:**
- `limit` (optional): Number of items (default: 20, max: 50)

**Response:**
```json
{
  "ok": true,
  "feed": [
    {
      "type": "live",
      "_id": "...",
      "user": { ... },
      "title": "...",
      "viewerCount": 42,
      "totalCoinsEarned": 1500,
      "priority": 1200
    },
    {
      "type": "match",
      "_id": "...",
      "username": "...",
      "avatar": "...",
      "tags": ["Nuevo", "Busca relación"],
      "priority": 950
    }
  ],
  "stats": {
    "totalItems": 20,
    "liveCount": 12,
    "matchCount": 8
  }
}
```

#### Hook System Endpoints

```
POST /api/feed/track-visit
GET /api/feed/visits
POST /api/feed/send-greeting
GET /api/feed/greetings
```

### Models

#### UserVisit
```javascript
{
  visitor: ObjectId,      // User who visited
  visited: ObjectId,      // User being visited
  visitCount: Number,     // Total visits
  lastVisitAt: Date,      // Most recent visit
}
```

#### Greeting
```javascript
{
  from: ObjectId,         // Sender
  to: ObjectId,           // Recipient
  message: String,        // Default: "👋"
  viewed: Boolean,        // Whether opened
  viewedAt: Date,         // When opened
}
```

## Frontend Components

### Main Components

#### `/app/feed/page.jsx`
Main feed page with tab navigation and infinite scroll.

**Features:**
- Tab switching (For You, Match, Live, Top)
- Infinite scroll with "Load More" button
- Session-based authentication
- Error handling and empty states

#### `MatchCard.jsx`
Tinder-style swipeable card for dating profiles.

**Features:**
- Photo carousel with dots navigation
- Hook badges (visits, greetings, live status)
- Swipe actions (Skip, Like, Chat)
- Profile tags and interests
- Monetization CTAs

#### `LiveCard.jsx` (existing)
Tango-style card for live streams.

**Features:**
- Live preview thumbnail
- Viewer count and coins earned
- Status badges (TRENDING, TOP, NUEVO)
- Category tags
- Direct join button

#### `FeedMonetizationActions.jsx`
Reusable monetization CTA component.

**Features:**
- Context-aware button display
- Join live (for live users)
- Send gift (for creators)
- Send greeting (for all users)
- Unlock chat (premium feature)

## User Flow

### Discovery Flow

1. **User lands on `/feed`** (default home redirect)
2. **Sees "Para Ti" tab** with intelligent mix of content
3. **Scrolls through feed** with smooth interleaved content
4. **Engages with content:**
   - Live: Clicks "Entrar" → Joins live stream
   - Match: Swipes Like → Match check → Chat or next profile
   - Match: Swipes Skip → Removed from feed

### Monetization Flow

1. **User sees monetization CTA** on feed card
2. **Clicks action button:**
   - "Únete al live" → Redirects to live stream page
   - "Envía regalo" → Opens gift panel (if live) or prompts to wait for live
   - "Saluda" → Sends greeting notification
   - "Desbloquear chat" → Premium unlock flow (future)

### Hook System Flow

1. **User A visits User B's profile**
2. **Backend tracks visit** via UserVisit model
3. **User B sees "Te visitó 1x" badge** on User A's card
4. **User B sends greeting** via feed CTA
5. **User A receives notification** and sees greeting badge

## Strategy & Metrics

### Engagement Goals

- **Time in app ↑**: Variety keeps users engaged longer
- **Gifts ↑**: Easy access to monetization CTAs
- **Matches ↑**: More profile exposure in hybrid feed
- **Live viewers ↑**: Cross-promotion to dating users

### Success Metrics

Track via analytics:
- Average session duration on feed
- Click-through rate: Live cards → Live joins
- Click-through rate: Match cards → Likes
- Conversion rate: Hook badges → Interactions
- Monetization rate: CTA clicks → Purchases

### Creator Strategy

- **Visibility Boost**: Approved creators get priority placement
- **Cross-Promotion**: Live streams shown to dating users
- **Verified Badge**: Verified creators highlighted
- **Earnings Display**: Coins earned shown on live cards (social proof)

## Configuration

### Feed Ratios

Configurable in `backend/src/controllers/feed.controller.js`:

```javascript
const FEED_MIX_RATIO = { live: 0.6, match: 0.4 }; // 60/40
```

### Priority Scores

Adjust scoring weights in controller methods:
- `getLiveStreams()` - Live priority calculation
- `getMatchProfiles()` - Match priority calculation

### Rate Limiting

Feed endpoints use rate limiter (100 requests per 15 minutes):

```javascript
const feedLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
});
```

## Best Practices

### DO's ✅

- **Clear visual distinction** between live and match cards
- **Show only active lives** (validate with `isLiveActuallyActive`)
- **Exclude admins/moderators** from public feeds
- **Boost new users** for better onboarding
- **Display hook badges** to drive engagement

### DON'Ts ❌

- **Don't mix UI styles** randomly (maintain consistency)
- **Don't show offline streams** in live feed
- **Don't overload with creators** (maintain 60/40 ratio)
- **Don't show stale content** (validate timestamps)
- **Don't forget authentication** (all endpoints require JWT)

## Future Enhancements

### Planned Features

1. **Advanced Filtering**
   - Location-based filtering
   - Interest matching
   - Age preferences
   - Language preferences

2. **Personalization**
   - Machine learning ranking
   - User behavior tracking
   - Collaborative filtering
   - A/B testing for ratios

3. **Enhanced Hooks**
   - Compatibility scores
   - Mutual friend indicators
   - Shared interests highlights
   - Activity status (online/offline)

4. **Premium Features**
   - Unlimited swipes
   - Rewind (undo skip)
   - Boost profile visibility
   - See who liked you
   - Advanced filters

5. **Gamification**
   - Daily streak badges
   - Achievement unlocks
   - Leaderboards
   - Exclusive content access

## Troubleshooting

### Common Issues

**Empty feed**
- Check if users have onboarding complete
- Verify live streams are actually active
- Check user role filtering

**Wrong ratio**
- Verify interleaving pattern in `intelligentMix()`
- Check individual fetch limits

**Stale lives showing**
- Ensure `cleanupStaleLives()` runs
- Check `isLiveActuallyActive()` validation

**Performance issues**
- Add database indexes on common queries
- Implement caching for creator lists
- Use pagination effectively

## Related Files

### Backend
- `backend/src/controllers/feed.controller.js`
- `backend/src/routes/feed.routes.js`
- `backend/src/models/UserVisit.js`
- `backend/src/models/Greeting.js`
- `backend/src/lib/creatorUtils.js`

### Frontend
- `frontend/app/feed/page.jsx`
- `frontend/components/MatchCard.jsx`
- `frontend/components/LiveCard.jsx`
- `frontend/components/FeedMonetizationActions.jsx`
- `frontend/messages/en.json` (i18n)
- `frontend/messages/es.json` (i18n)
- `frontend/messages/pt.json` (i18n)

## Contact & Support

For questions or issues related to the hybrid feed system, please consult:
- Product specifications: `/HYBRID_FEED_SPECIFICATION.md` (this file)
- Backend API docs: Backend source code comments
- Frontend component docs: Component JSDoc headers
