# Admin User Cleanup + Role Privacy Fix

## Overview

This implementation adds admin hard delete functionality for test user cleanup and ensures admin/moderator accounts never appear as public normal users.

## Part 1: Admin Hard Delete Endpoint

### Backend Implementation

**Endpoint**: `DELETE /api/admin/users/:id/hard-delete`

**Location**: 
- Controller: `backend/src/controllers/admin.controller.js` (`hardDeleteUser`)
- Route: `backend/src/routes/admin.routes.js`

**Safety Rules**:
1. ✅ Only admin can use it (protected by `verifyToken` + `requireAdmin`)
2. ✅ Admin cannot delete themselves (checks `req.userId !== targetUserId`)
3. ✅ Cannot delete the last remaining admin (counts admins before deletion)
4. ✅ Warns when deleting admin/moderator accounts
5. ✅ Deletes related data across all collections

**Related Data Cleanup**:
- Messages (sent and received)
- Chats (as participant)
- Lives (created by user)
- Videos (created by user)
- Gifts (sent and received)
- Coin transactions
- Reports (by user and about user)
- Subscriptions
- Purchases
- Notifications
- Likes (from and to user)
- Agency relationships (as parent or sub-creator)
- Analytics events
- Payouts
- Followers/following arrays in other users

**Response Format**:
```json
{
  "ok": true,
  "message": "Usuario [username] eliminado completamente",
  "deletedUser": {
    "id": "...",
    "username": "...",
    "name": "...",
    "email": "...",
    "role": "..."
  }
}
```

### Frontend Implementation

**Location**: `frontend/app/admin/users/page.jsx`

**Features**:
- New button: "🗑️ Eliminar prueba" with danger styling
- Strong confirmation dialog: "Esto eliminará completamente el usuario y sus datos relacionados. No se puede deshacer."
- Success/error messages displayed in alert banner
- Auto-refreshes user list after successful deletion
- Loading state during deletion

## Part 2: Admin/Moderator Role Privacy

### Backend Filters

#### User Discovery (`backend/src/routes/user.routes.js`)
```javascript
role: { $nin: ["admin", "moderator"] }
```
- Already implemented in `/api/user/discover` endpoint
- Excludes admin/moderator from public user discovery

#### Creator Discovery (`backend/src/controllers/creatorDiscovery.controller.js`)
```javascript
role: { $in: ["creator", "subCreator"] }
```
- Already filters to only approved creators
- Naturally excludes admin/moderator roles

#### Live Discovery (`backend/src/controllers/live.controller.js`)
```javascript
.filter((live) => {
  const userRole = live.user?.role;
  return userRole !== "admin" && userRole !== "moderator";
})
```
- Filters out admin/moderator streams from public live list
- Removes role field from response

#### Video Discovery (`backend/src/controllers/video.controller.js`)
```javascript
.filter(v => {
  const userRole = v.user?.role;
  return userRole !== "admin" && userRole !== "moderator";
})
```
- Filters out admin/moderator videos from public video list
- Removes role field from response

### Frontend Defensive Filters

#### ProfileCard Component (`frontend/components/ProfileCard.jsx`)
```javascript
if (!user || user.role === "admin" || user.role === "moderator") {
  return null;
}
```
- First line of defense: component returns null for admin/moderator

#### Discovery Pages
All public discovery pages add defensive filtering:

**Explore Page** (`frontend/app/explore/page.jsx`):
```javascript
.filter(u => u && u.role !== "admin" && u.role !== "moderator")
```

**Crush Page** (`frontend/app/crush/page.jsx`):
```javascript
.filter(u => u && u.role !== "admin" && u.role !== "moderator")
```

**Matches Page** (`frontend/app/matches/page.jsx`):
```javascript
.filter(u => u && u.role !== "admin" && u.role !== "moderator")
```

## Validation Checklist

- ✅ Admin hard delete endpoint implemented with all safety checks
- ✅ Related data cleanup across all collections
- ✅ Frontend delete button with strong confirmation
- ✅ Backend filters admin/moderator from all public endpoints
- ✅ Frontend defensive filtering in all discovery components
- ✅ Build passes (frontend and backend syntax validated)
- ⏳ Manual testing required:
  - Test admin cannot delete self
  - Test last admin cannot be deleted
  - Test admin does not appear in Explore
  - Test admin does not appear in Match/user discovery
  - Test admin does not appear in creator cards
  - Test admin can delete test users
  - Verify no regression in login/live/gifts

## Security Notes

1. **Double-layer protection**: Both backend queries and frontend components filter admin/moderator
2. **Role field removal**: Backend removes role from response objects before sending to client
3. **Admin-only access**: Hard delete is protected by `requireAdmin` middleware
4. **Atomic safety checks**: Deletion verifies constraints before proceeding
5. **Audit trail**: Console logs when admin/moderator accounts are deleted

## Usage Example

### Delete a test user via admin panel:
1. Navigate to `/admin/users`
2. Find the test user
3. Click "🗑️ Eliminar prueba" button
4. Confirm the deletion in the dialog
5. User and all related data are permanently deleted

### API Usage:
```bash
DELETE /api/admin/users/:userId/hard-delete
Authorization: Bearer <admin-token>
```

**Success Response** (200):
```json
{
  "ok": true,
  "message": "Usuario testuser eliminado completamente",
  "deletedUser": { ... }
}
```

**Error Responses**:
- 400: Invalid user ID, self-deletion, or last admin
- 404: User not found
- 500: Server error during deletion

## Notes

- This is intended for **test cleanup only**
- Deletion is **permanent and cannot be undone**
- All related data is deleted using `Promise.allSettled` to continue even if some deletions fail
- Failed cleanup steps are logged but don't block user deletion
- Admin/moderator accounts should rarely need deletion; warnings are logged when this occurs
