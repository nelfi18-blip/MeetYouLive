# Creator Invite Hierarchy Feature

## Overview
This feature implements a controlled 2-level creator hierarchy system that allows creators to invite sub-creators while preventing pyramid structures and abuse.

## Role Hierarchy

```
user → creator (level 1) → subCreator (level 2)
```

### Role Capabilities

| Capability | User | Creator | SubCreator |
|------------|------|---------|------------|
| Stream & Earn | ❌ | ✅ | ✅ |
| Invite Others | ❌ | ✅ | ❌ |
| Generate Invite Code | ❌ | ✅ | ❌ |
| Enable Agency Profile | ❌ | ✅ | ❌ |
| Receive Commission | ❌ | ✅ | ❌ |
| Upload Content | ❌ | ✅ | ✅ |
| Paid Calls | ❌ | ✅ | ✅ |

## Implementation Details

### Backend Changes

#### 1. User Model (`backend/src/models/User.js`)
- Added `subCreator` to role enum
- Existing fields used:
  - `invitedByCreator`: Reference to parent creator
  - `creatorInviteCode`: Unique invite code for creators

#### 2. Middleware (`backend/src/middlewares/creator.middleware.js`)
- **`requireApprovedCreator`**: Updated to allow both `creator` and `subCreator` roles
- **`requireFullCreator`**: New middleware to restrict actions to full creators only

#### 3. Authentication Flow (`backend/src/routes/auth.routes.js`)
- Registration with `creatorInvite` query param sets:
  - `role = "subCreator"`
  - `creatorStatus = "pending"`
  - `invitedByCreator = <parentCreatorId>`

#### 4. Admin Approval (`backend/src/controllers/admin.controller.js`)
- Detects if user has `invitedByCreator` and role is `subCreator`
- Keeps `subCreator` role (doesn't upgrade to `creator`)
- Does NOT generate invite codes for subCreators
- Auto-creates `AgencyRelationship` with parent creator

#### 5. Monetization Controllers
Updated to allow subCreators:
- `gift.controller.js`: SubCreators can earn from gifts
- `live.controller.js`: SubCreators can go live
- `videoCall.controller.js`: SubCreators can do paid calls
- `video.controller.js`: SubCreators can upload videos
- `exclusiveContent.controller.js`: SubCreators can create exclusive content

#### 6. Discovery & Rankings (`backend/src/controllers/`)
- `creatorDiscovery.controller.js`: Includes subCreators in discovery
- `rankings.controller.js`: SubCreators appear in all rankings

#### 7. Hierarchy Enforcement
- **Agency Enable** (`backend/src/routes/admin.routes.js`): SubCreators cannot enable agency profiles
- **Creator Routes** (`backend/src/routes/creator.routes.js`): Only full creators can access `/invite-code` endpoint
- **Agency Controller**: Existing validation already prevents circular relationships

### Frontend Changes

#### 1. Creator Utils (`frontend/lib/creatorUtils.js`)
```javascript
// Updated to include subCreators
isApprovedCreator(user) // true for creator OR subCreator with approved status

// New helpers
isFullCreator(user)     // true only for full creators
isSubCreator(user)      // true only for subCreators
```

#### 2. Dashboard (`frontend/app/dashboard/page.jsx`)
- Creator invite card only shown to full creators (`user.role === "creator"`)
- Uses `creatorInviteCode` field instead of `agencyProfile.agencyCode`

#### 3. Components
Updated to handle subCreator role:
- `Navbar.jsx`: Shows "Sub-Creator" role label
- `ProfileCard.jsx`: SubCreators display as creators
- `LiveCard.jsx`: SubCreators get creator badge
- `OnlineUsers.jsx`: SubCreators marked as creators
- `MatchModal.jsx`: SubCreators can receive calls/gifts

#### 4. Translations (`frontend/messages/*.json`)
Added `role.subCreator` key:
- English: "Sub-Creator"
- Spanish: "Sub-Creador"
- Portuguese: "Sub-Criador"

## Revenue Split

When a subCreator earns coins:
1. Platform takes 40% (standard platform fee)
2. SubCreator receives base share (from remaining 60%)
3. Parent creator receives commission (from subCreator's share)

Commission is only applied when:
- `AgencyRelationship.status === "active"`
- `AgencyRelationship.subCreatorAgreed === true`

## User Flow

### Normal Creator Flow
1. User applies via `/creator-request`
2. Admin approves → becomes `creator`
3. Creator gets `creatorInviteCode` auto-generated
4. Creator can invite others via invite link

### SubCreator Flow
1. User registers or applies with `creatorInvite` query param
2. System sets `role = "subCreator"`, `creatorStatus = "pending"`
3. Admin approves → stays as `subCreator`
4. `AgencyRelationship` auto-created with parent
5. Parent and sub must both accept commission agreement
6. SubCreator can stream, earn, but CANNOT invite others

## Security & Validation

### Hierarchy Depth Prevention
- SubCreators CANNOT generate invite codes
- SubCreators CANNOT enable agency profiles
- `/api/creator/invite-code` endpoint requires `requireFullCreator` middleware
- Admin agency enable endpoint rejects subCreators

### Self-Activation Prevention
- User must be invited by an approved creator
- Cannot self-assign subCreator status

### Circular Prevention (existing)
- Agency creators cannot also be sub-creators
- Sub-creators cannot enable agency profiles
- One-parent-only: Each sub-creator can only have one active relationship

## API Endpoints

### Creator Invite System
- `GET /api/creator/invite-code` - Get creator's invite code (full creators only)
- `POST /api/auth/register?creatorInvite=CODE` - Register as subCreator
- `POST /api/creator/request?creatorInvite=CODE` - Apply as subCreator

### Agency Management (existing)
- `GET /api/agency/me` - View agency profile and sub-creators
- `GET /api/agency/my-relationship` - SubCreator views their parent
- `PATCH /api/agency/my-relationship/accept` - SubCreator accepts commission
- `GET /api/agency/commission-history` - View earned commissions

### Admin (existing)
- `PATCH /api/admin/creator-requests/:id/approve` - Approve creator/subCreator
- `PATCH /api/admin/agencies/:creatorId/enable` - Enable agency (rejects subCreators)

## Database Schema

### User Document
```javascript
{
  role: "user" | "creator" | "subCreator" | "admin" | "moderator",
  creatorStatus: "none" | "pending" | "approved" | "rejected" | "suspended",
  invitedByCreator: ObjectId,  // Parent creator reference
  creatorInviteCode: String,   // Only set for full creators
  // ... other fields
}
```

### AgencyRelationship Document
```javascript
{
  parentCreator: ObjectId,     // Full creator
  subCreator: ObjectId,        // SubCreator or full creator
  percentage: Number,          // 5-30%
  status: "pending" | "active" | "suspended" | "removed",
  subCreatorAgreed: Boolean,
  // ... other fields
}
```

## Testing Checklist

- [ ] User registers with creator invite link → becomes subCreator
- [ ] Admin approves subCreator → stays as subCreator (not upgraded to creator)
- [ ] SubCreator can go live
- [ ] SubCreator can receive gifts
- [ ] SubCreator appears in discovery
- [ ] SubCreator appears in rankings
- [ ] SubCreator CANNOT access `/api/creator/invite-code`
- [ ] SubCreator CANNOT enable agency profile
- [ ] Full creator can generate invite codes
- [ ] Full creator receives commission from subCreator earnings
- [ ] Commission requires both `active` status AND `subCreatorAgreed=true`
- [ ] Frontend dashboard shows correct role for subCreators
- [ ] Frontend dashboard only shows invite card for full creators

## Migration Notes

No migration needed. Existing creators are unaffected:
- All existing creators remain as `role="creator"`
- New field `subCreator` is simply added to enum
- No data transformation required
