# Staff Roles & Limited Admin Access Implementation

## Overview
This implementation adds granular staff roles to MeetYouLive, allowing trusted helpers to work on specific platform areas without full admin access.

## New Staff Roles

### 1. **admin** (unchanged)
- Full platform access
- Can assign/change all roles
- Can delete any user (except last admin)
- Access to all financial data

### 2. **moderator**
- View and manage reports
- Suspend/block regular users
- Manage live streams and chat moderation
- View user accounts
- **Cannot:** access financial data, change roles, delete users, suspend other staff

### 3. **support**
- View user accounts
- Help with account issues
- View basic user status
- **Cannot:** delete users, access payments/payouts, change roles, suspend users

### 4. **creator_manager**
- View and manage creator applications
- Approve/reject creator requests
- Review creator profiles
- Manage creator invitations
- **Cannot:** approve payouts, change financial splits, access revenue data

### 5. **finance**
- View payout requests
- Update payout statuses (according to existing rules)
- View revenue summaries and metrics
- **Cannot:** change user roles, modify gift/coin logic, access user moderation

### 6. **content_reviewer**
- Review reports
- Review flagged profiles/videos/lives
- Mark content as reviewed or escalated
- **Cannot:** access financial data, change roles, suspend users

## Backend Implementation

### Models
- **User.js**: Extended role enum to include new staff roles
- **StaffAuditLog.js**: New model for tracking all staff actions with timestamps

### Middleware
- **admin.middleware.js**: 
  - `requireRole(role)`: Requires specific role
  - `requireAnyRole([roles])`: Allows any of the specified roles
  - `requirePermission(permission)`: Permission-based access control
  - `STAFF_ROLES`: Constant array of all staff roles for filtering
  - `PERMISSIONS`: Object mapping operations to allowed roles

### Services
- **audit.service.js**: 
  - `logStaffAction()`: Logs staff actions (who, what, when, target)
  - `getAuditLogs()`: Retrieves audit logs with filters

### Route Protection

#### Payouts & Revenue (admin + finance)
```javascript
router.get("/payouts", requirePermission("VIEW_PAYOUTS"), ...);
router.patch("/payouts/:id", requirePermission("UPDATE_PAYOUTS"), ...);
router.get("/revenue", requirePermission("VIEW_REVENUE"), ...);
```

#### Reports & Moderation (admin + moderator + content_reviewer)
```javascript
router.get("/reports", requirePermission("VIEW_REPORTS"), ...);
router.patch("/reports/:id", requirePermission("UPDATE_REPORTS"), ...);
```

#### Users (admin + support + moderator)
```javascript
router.get("/users", requirePermission("VIEW_USERS"), ...);
```

#### Creator Management (admin + creator_manager)
```javascript
router.get("/creator-requests", requirePermission("VIEW_CREATOR_REQUESTS"), ...);
router.patch("/creators/:id/approve", requirePermission("APPROVE_CREATORS"), ...);
```

#### Admin-Only Operations
- Dashboard overview
- User hard delete
- Role changes
- Agency commission settings
- Platform settings

### Security Measures

1. **Role Change Protection**
   - Only admin can change user roles
   - Staff cannot change their own role
   - Logged with audit trail

2. **Hard Delete Protection**
   - Only admin can hard delete users
   - Cannot delete last admin account
   - Staff roles can only be deleted by admin
   - All deletions logged

3. **Moderation Protection**
   - Moderators cannot suspend/block other staff members
   - All moderation actions logged with details

4. **Public Filtering**
   - All staff roles excluded from user discovery
   - Staff live streams hidden from public view
   - Role information not exposed in public APIs

### Audit Logging

All sensitive staff actions are logged:
- User role changes
- Payout status updates
- User suspensions/blocks
- Report status updates
- Hard deletes
- Failed permission attempts

Log fields:
- staffId (who performed the action)
- staffRole (their role at the time)
- action (what they did)
- targetType (User, Report, Payout, etc.)
- targetId (MongoDB ID of affected resource)
- targetIdentifier (username/email for humans)
- details (additional context)
- ipAddress (request IP)
- timestamp (automatic)

## Frontend Implementation

### Admin Layout
- **Dynamic Navigation**: Menu items filtered by user role
- **Role Display**: Shows proper label for each staff role
- **Access Control**: Pages check role and show UnauthorizedPage if needed

### Role-Based Menu Items

| Menu Item      | Admin | Moderator | Support | Creator Manager | Finance | Content Reviewer |
|----------------|-------|-----------|---------|-----------------|---------|------------------|
| Dashboard      | ✓     | -         | -       | -               | -       | -                |
| Usuarios       | ✓     | ✓         | ✓       | -               | -       | -                |
| Creadores      | ✓     | -         | -       | ✓               | -       | -                |
| Agencias       | ✓     | -         | -       | -               | -       | -                |
| Streams        | ✓     | ✓         | -       | -               | -       | -                |
| Retiros        | ✓     | -         | -       | -               | ✓       | -                |
| Transacciones  | ✓     | -         | -       | -               | -       | -                |
| Ingresos       | ✓     | -         | -       | -               | ✓       | -                |
| Reportes       | ✓     | ✓         | -       | -               | -       | ✓                |
| Analíticas     | ✓     | -         | -       | -               | -       | -                |
| Configuración  | ✓     | -         | -       | -               | -       | -                |

### Components
- **UnauthorizedPage.jsx**: Displayed when user tries to access forbidden section
  - Note: Uses hardcoded Spanish text like the rest of the admin panel
  - Admin panel is separate from main app i18n system

## Testing Checklist

- [x] Backend syntax validation passed
- [x] Frontend JSX syntax validated
- [x] User model updated with new roles
- [x] Permission middleware created
- [x] Audit logging implemented
- [x] Route protection added
- [x] Public filtering updated
- [x] Frontend menu updated
- [x] Security checks in place

## Migration Notes

### Creating Staff Accounts
Only admins can assign staff roles. To create a staff account:

1. Create a regular user account
2. Admin logs into admin panel
3. Go to Users section
4. Find the user and click "Change Role"
5. Select the appropriate staff role

### Existing Moderators
Existing moderator accounts will continue to work with expanded permissions for creator management and content review.

## Security Guarantees

✅ Staff cannot delete admin accounts  
✅ Staff cannot change their own roles  
✅ Only admin can assign staff roles  
✅ All staff actions are logged  
✅ Staff roles never appear in public user discovery  
✅ Each role has strictly defined permissions  
✅ No financial/gift/live streaming core logic modified  
✅ Stripe, gift money, payout calculations untouched  
✅ Agency commission calculations preserved  

## Future Enhancements

- Audit log viewer in admin panel
- Role-based notifications for specific events
- Bulk user moderation tools for moderators
- Creator performance reports for creator_manager
- Financial export tools for finance role
- Content flagging dashboard for content_reviewer
