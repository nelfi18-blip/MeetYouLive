# Role Privacy & Moderator Operations Panel

## Overview

This document describes the role privacy features and moderator operations panel implemented to protect the platform from exposing internal roles publicly and to provide a dedicated moderation workflow.

## Features Implemented

### 1. Role Privacy

#### Hidden Roles
- **Admin** and **Moderator** roles are now hidden from public discovery
- These internal roles do not appear in:
  - User discovery endpoints (`/api/user/discover`)
  - Public profile endpoints (`/api/user/:id/public`)
  - Live streams listings (`/api/lives`)
  - Search results
  - Public user cards

#### Public Display Rules
- **Creator badge**: Only shown for approved creators in monetization contexts (creator profiles, live streams, creator discovery)
- **Internal role labels**: Never shown publicly (admin, moderator roles)
- **Admin/Moderator profiles**: Return 404 when accessed via public endpoints

### 2. Moderator Role

#### Role Definition
- New role added to User model: `"moderator"`
- Moderators can handle platform moderation tasks without access to financial operations

#### Moderator Permissions

**CAN ACCESS:**
- Reports management (`/api/admin/reports`, `/api/moderation/reports`)
- User list and moderation (`/api/admin/users`)
- Live streams monitoring (`/api/admin/lives`, `/api/admin/lives/history`)
- User suspension/blocking (via `/api/moderation/users/:id/suspend`, `/api/moderation/users/:id/block`)
- Report review and status updates

**CANNOT ACCESS:**
- Payouts and payment management
- Financial transactions
- Stripe/payment data
- Agency commissions
- Creator earnings and approvals
- Revenue and analytics dashboards
- Platform settings
- Admin-only operations (making admins, creator approvals)

#### Moderator Restrictions
- Cannot suspend or block other moderators or admins
- Cannot approve creator applications
- Cannot modify financial settings or transactions

### 3. Backend Implementation

#### User Model Changes
```javascript
// backend/src/models/User.js
role: { type: String, enum: ["user", "creator", "admin", "moderator"], default: "user" }
```

#### New Middleware
```javascript
// backend/src/middlewares/admin.middleware.js
requireModeratorOrAdmin(req, res, next)
```
- Allows both admin and moderator roles
- Sets `req.userRole` for downstream permission checks

#### Updated Endpoints

**Discovery & Public Profiles:**
- `GET /api/user/discover` - excludes admin/moderator from results
- `GET /api/user/:id/public` - returns 404 for admin/moderator profiles
- `GET /api/lives` - filters out admin/moderator live streams
- `GET /api/lives/:id` - returns 404 for admin/moderator live streams

**Moderation Endpoints:**
- `GET /api/moderation/reports` - accessible to moderators
- `PATCH /api/moderation/reports/:id` - accessible to moderators
- `PATCH /api/moderation/users/:id/suspend` - accessible to moderators (with restrictions)
- `PATCH /api/moderation/users/:id/block` - accessible to moderators (with restrictions)

**Admin Endpoints (Moderator Access):**
- `GET /api/admin/reports` - accessible to moderators
- `PATCH /api/admin/reports/:id` - accessible to moderators
- `GET /api/admin/users` - accessible to moderators
- `GET /api/admin/lives` - accessible to moderators
- `GET /api/admin/lives/history` - accessible to moderators

**Admin Endpoints (Admin Only):**
- All financial routes (payouts, transactions, revenue)
- Creator approval/rejection routes
- Settings management
- User role changes (except for promoting to moderator)
- Analytics dashboards

### 4. Frontend Implementation

#### Admin Layout
```javascript
// frontend/app/admin/layout.jsx
```
- Navigation items filtered by role
- Moderators see limited menu: Users, Streams, Reports
- Admins see full menu including financial controls

**Navigation Items by Role:**

**Moderator Access:**
- 👥 Usuarios (Users)
- 📡 Streams (Lives)
- 🚨 Reportes (Reports)

**Admin Only:**
- ⊞ Dashboard
- 🎬 Creadores (Creators)
- 🏢 Agencias (Agencies)
- 💸 Retiros (Payouts)
- 💰 Transacciones (Transactions)
- 📈 Ingresos (Revenue)
- 📊 Analíticas (Analytics)
- ⚙️ Configuración (Settings)

#### Role Display
```javascript
// frontend/components/Navbar.jsx
```
- Moderator role shown as "Moderador" in user dropdown
- Admin role shown as localized admin label
- Internal roles not exposed in public contexts

#### Public Cards
```javascript
// frontend/components/ProfileCard.jsx
// frontend/components/LiveCard.jsx
```
- Only show "CREATOR" badge for approved creators
- Never show admin or moderator badges publicly

### 5. Security Considerations

#### Role Privacy
- Admin/moderator accounts are completely hidden from public discovery
- Even if someone has the user ID, they get a 404 error
- Internal roles are stripped from API responses before sending to clients

#### Permission Boundaries
- Moderators cannot escalate privileges
- Moderators cannot moderate other staff (admins/moderators)
- Financial operations remain strictly admin-only

#### Data Protection
- Role field removed from populated user objects in public contexts
- Middleware checks ensure proper authorization before allowing access

## Testing Checklist

### Role Privacy Tests
- [ ] Admin accounts do not appear in `/explore` page
- [ ] Moderator accounts do not appear in `/explore` page
- [ ] Accessing admin profile via `/user/:id/public` returns 404
- [ ] Accessing moderator profile via `/user/:id/public` returns 404
- [ ] Admin live streams do not appear in live listings
- [ ] Moderator live streams do not appear in live listings
- [ ] User cards do not display admin/moderator badges
- [ ] Live cards do not display admin/moderator badges

### Moderator Access Tests
- [ ] Moderator can log into `/admin/login`
- [ ] Moderator can view reports at `/admin/reports`
- [ ] Moderator can update report status
- [ ] Moderator can view users list at `/admin/users`
- [ ] Moderator can view lives at `/admin/lives`
- [ ] Moderator can suspend regular users
- [ ] Moderator can block regular users
- [ ] Moderator **cannot** suspend admins (should get 403 error)
- [ ] Moderator **cannot** suspend other moderators (should get 403 error)
- [ ] Moderator **cannot** access `/admin/payouts` (not shown in nav)
- [ ] Moderator **cannot** access `/admin/transactions` (not shown in nav)
- [ ] Moderator **cannot** access `/admin/revenue` (not shown in nav)
- [ ] Moderator **cannot** access `/admin/creators` (not shown in nav)
- [ ] Moderator **cannot** access `/admin/settings` (not shown in nav)

### Regression Tests
- [ ] Normal users can still be discovered
- [ ] Creators appear correctly in explore page
- [ ] Creator badges show correctly in profile cards
- [ ] Creator badges show correctly in live cards
- [ ] Live streaming still works for creators
- [ ] Gift sending still works
- [ ] Login/registration flows unaffected
- [ ] Payments and subscriptions unaffected

## Usage

### Creating a Moderator

**Option 1: Admin Panel**
1. Log in as admin at `/admin/login`
2. Go to Users section
3. Find the user you want to make a moderator
4. Change their role to "moderator"

**Option 2: Direct Database Update**
```javascript
// Update user role in MongoDB
db.users.updateOne(
  { email: "moderator@example.com" },
  { $set: { role: "moderator" } }
)
```

### Moderator Login
1. Moderators use the same admin login page: `/admin/login`
2. Use their regular email and password
3. They will see a limited admin panel with only moderation tools

### Moderator Workflow

**Reviewing Reports:**
1. Navigate to Reports section
2. View all pending reports
3. Review report details and reason
4. Mark as "reviewed" or "dismissed"

**Moderating Users:**
1. Navigate to Users section
2. Search for or browse users
3. Can suspend or block users if needed
4. Cannot moderate admins or other moderators

**Monitoring Lives:**
1. Navigate to Streams section
2. View active and historical live streams
3. Can identify problematic content for review

## Future Enhancements

Potential improvements for the moderation system:

1. **Enhanced Moderation Tools:**
   - Temporary mutes (time-based)
   - Warning system for users
   - Automated content filtering
   - Bulk moderation actions

2. **Moderation Logs:**
   - Track all moderation actions
   - Audit trail for accountability
   - Moderator performance metrics

3. **Advanced Permissions:**
   - Granular permission system
   - Role-based access control (RBAC)
   - Custom moderator roles with specific permissions

4. **Communication Tools:**
   - Internal notes on reports
   - Moderator-to-moderator messaging
   - Escalation workflow to admins

5. **Analytics:**
   - Moderation metrics dashboard
   - Report trends and patterns
   - Response time tracking

## Migration Notes

### Existing Users
- All existing users retain their current roles
- No migration required for existing data
- New "moderator" role can be assigned as needed

### Compatibility
- Backend changes are backward compatible
- Frontend gracefully handles missing role field
- API responses maintain same structure (minus internal role fields)

## Support

For questions or issues related to role privacy or moderator operations:
- Check this documentation first
- Review the implementation in the codebase
- Test in a development environment before production changes
- Ensure moderators are properly trained on their responsibilities
