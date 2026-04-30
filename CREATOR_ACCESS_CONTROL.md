# Creator Access Control System

## Overview

The creator access system has been refined to implement controlled growth through a three-tier access model:
1. **Admin Approval** - Primary method (always required)
2. **Creator Invite Links** - Viral growth mechanism (requires approval)
3. **Direct Application** - Open application (requires approval)

All paths require final admin approval. Creators cannot auto-approve others.

---

## User Model Changes

### New Fields

```javascript
{
  // Tracks which creator invited this user (if any)
  invitedByCreator: { type: ObjectId, ref: "User", default: null },
  
  // Unique invite code for approved creators (auto-generated)
  creatorInviteCode: { type: String, unique: true, sparse: true }
}
```

### Creator Status Flow

```
User Registration → "none"
  ↓
Apply (with/without invite) → "pending"
  ↓
Admin Review
  ↓
  ├─→ Approved → "approved" + role="creator" + creatorInviteCode generated
  ├─→ Rejected → "rejected" (can reapply)
  └─→ Suspended → "suspended"
```

---

## Backend Implementation

### 1. Creator Invite Code Generation

**Location:** `backend/src/controllers/admin.controller.js`

```javascript
async function generateUniqueCreatorInviteCode(user) {
  // Generates codes like: JOHN3A4B5, MARY1F2C3
  // Format: [4 chars from username/name] + [5 random hex chars]
  // Guaranteed unique via database lookup
}
```

**When Generated:**
- Automatically when admin approves creator via `approveCreator()`
- Stored in `user.creatorInviteCode`

### 2. Registration with Invite Code

**Location:** `backend/src/routes/auth.routes.js`

**Endpoint:** `POST /api/auth/register`

**New Parameter:** `creatorInvite` (optional)

**Flow:**
```javascript
if (creatorInvite) {
  // Validate code against approved creators
  const inviter = await User.findOne({
    creatorInviteCode: inviteCode,
    role: "creator",
    creatorStatus: "approved"
  });
  
  if (inviter) {
    // Set user as invited + pending (still needs approval)
    invitedByCreator = inviter._id;
    creatorStatus = "pending";
  }
}
```

### 3. Invite Code Validation

**Location:** `backend/src/routes/user.routes.js`

**Endpoint:** `GET /api/user/creator-invite-info?code=XYZ`

**Purpose:** Frontend can validate codes before/during registration

**Response:**
```json
{
  "valid": true,
  "creator": {
    "id": "...",
    "username": "john_creator",
    "name": "John Doe",
    "avatar": "...",
    "displayName": "John the Creator"
  }
}
```

### 4. Creator Gets Own Invite Code

**Location:** `backend/src/routes/creator.routes.js`

**Endpoint:** `GET /api/creator/invite-code` (requires approved creator)

**Response:**
```json
{
  "ok": true,
  "code": "JOHN3A4B5",
  "inviteUrl": "https://meetyoulive.vercel.app/creator-request?creatorInvite=JOHN3A4B5"
}
```

### 5. Application Submission

**Location:** `backend/src/controllers/creator.controller.js`

**Endpoint:** `POST /api/creator/request`

**New Parameter:** `creatorInvite` (optional)

**Enhanced Logic:**
```javascript
// If invite code provided during application, link to inviter
if (creatorInvite && !user.invitedByCreator) {
  const inviter = await User.findOne({
    creatorInviteCode: creatorInvite,
    role: "creator",
    creatorStatus: "approved"
  });
  if (inviter) {
    user.invitedByCreator = inviter._id;
  }
}
```

---

## Frontend Implementation

### 1. Creator Request Page

**Location:** `frontend/app/creator-request/CreatorRequestForm.jsx`

**Key Changes:**

#### URL Parameter Handling
```javascript
const inviteCode = searchParams.get("creatorInvite") || null;

useEffect(() => {
  if (!inviteCode) return;
  // Fetch inviter info to display
  fetch(`${API_URL}/api/user/creator-invite-info?code=${inviteCode}`)
    .then(data => setInviterInfo(data.creator));
}, [inviteCode]);
```

#### Updated UI Text
- **Title (with invite):** "Tienes invitación de creador 🎉"
- **Title (no invite):** "Acceso a creadores limitado"
- **Subtitle (with invite):** "Has sido invitado... Completa tu solicitud y espera la aprobación del equipo."
- **Subtitle (no invite):** "El acceso a creadores está restringido. Solicita acceso o usa un enlace de invitación."
- **CTA Button:** "Solicitar acceso" (no longer "Activar modo creador")

#### Status Messages
- **Pending:** "Solicitud en revisión" + "Tu solicitud ha sido enviada. Un administrador la revisará pronto..."
- **Approved:** "¡Ya eres creador!" + "Tu solicitud fue aprobada..."
- **Rejected:** "Solicitud rechazada" + "Puedes corregir tu solicitud y volver a enviarla."

### 2. Dashboard Updates

**Location:** `frontend/app/dashboard/page.jsx`

**Key Changes:**

#### Smart CTA Messaging
```javascript
const smartCreatorCTA =
  behaviorSegment === "new"
    ? {
        title: "¿Quieres ganar dinero en vivo?",
        sub: "Solicita acceso y empieza a monetizar...",
        button: "Solicitar acceso",
      }
    : behaviorSegment === "spender"
    ? {
        title: "Recupera lo que gastas creando contenido",
        sub: "Convierte tu actividad en ingresos...",
        button: "Solicitar acceso de creador",
      }
    : {
        title: "Acceso a creadores limitado",
        sub: "Solicita acceso o usa invitación...",
        button: "Solicitar acceso",
      };
```

---

## Complete User Flows

### Flow 1: User with Creator Invite Link

```
1. Creator shares: https://app.com/creator-request?creatorInvite=JOHN3A4B5
2. User clicks link
3. Frontend:
   - Extracts code from URL
   - Calls /api/user/creator-invite-info?code=JOHN3A4B5
   - Displays inviter info banner
4. User fills application form
5. Frontend submits to /api/creator/request with creatorInvite=JOHN3A4B5
6. Backend:
   - Validates invite code
   - Sets invitedByCreator = creator's ObjectId
   - Sets creatorStatus = "pending"
7. User sees: "Solicitud en revisión"
8. Admin reviews and approves
9. User becomes approved creator with their own invite code
```

### Flow 2: Direct Application (No Invite)

```
1. User navigates to /creator-request
2. Sees: "Acceso a creadores limitado"
3. Fills application form
4. Submits to /api/creator/request (no creatorInvite)
5. Backend sets creatorStatus = "pending"
6. User sees: "Solicitud en revisión"
7. Admin reviews and approves
8. User becomes approved creator with invite code
```

### Flow 3: Registration with Invite Code

```
1. User registers via /api/auth/register with creatorInvite=CODE
2. Backend:
   - Validates code
   - Sets invitedByCreator = creator's ObjectId
   - Sets creatorStatus = "pending" (NOT "none")
3. User can immediately fill creator application (already pre-marked as pending)
4. Admin approves
5. User becomes approved creator
```

---

## Security & Business Logic Enforcement

### ✅ No Direct Activation
- Users CANNOT set `role = "creator"` themselves
- Users CANNOT set `creatorStatus = "approved"` themselves
- All writes to these fields are protected in backend controllers
- Only `admin.controller.js::approveCreator()` can set these

### ✅ Creators Cannot Auto-Approve Others
- Invite codes only set `creatorStatus = "pending"`
- Final approval always requires admin action
- Even with invite, user must wait for admin review

### ✅ Creator Role Not Easily Exposed
- Invite system creates controlled viral growth
- Only approved creators get invite codes
- Codes are validated server-side
- Invalid codes are silently ignored (no enumeration)

### ✅ Controlled Growth
- All creators pass through admin approval
- Invites create traceable growth chains (via `invitedByCreator`)
- Platform maintains quality through approval process
- Higher monetization through scarcity

---

## API Reference

### Public Endpoints

#### Validate Creator Invite Code
```http
GET /api/user/creator-invite-info?code=JOHN3A4B5

Response:
{
  "valid": true,
  "creator": {
    "id": "507f1f77bcf86cd799439011",
    "username": "john_creator",
    "name": "John Doe",
    "avatar": "https://...",
    "displayName": "John the Creator"
  }
}
```

### Authenticated Endpoints

#### Submit Creator Application
```http
POST /api/creator/request
Authorization: Bearer <token>
Content-Type: application/json

{
  "displayName": "My Creator Name",
  "bio": "About me...",
  "category": "Gaming",
  "country": "España",
  "languages": ["es", "en"],
  "socialLinks": {
    "twitter": "@myhandle",
    "instagram": "@myhandle",
    "tiktok": "@myhandle",
    "youtube": "@myhandle"
  },
  "creatorInvite": "JOHN3A4B5"  // optional
}

Response:
{
  "ok": true,
  "message": "Solicitud enviada correctamente...",
  "creatorStatus": "pending"
}
```

### Approved Creator Endpoints

#### Get Own Invite Code
```http
GET /api/creator/invite-code
Authorization: Bearer <token>

Response:
{
  "ok": true,
  "code": "JOHN3A4B5",
  "inviteUrl": "https://meetyoulive.vercel.app/creator-request?creatorInvite=JOHN3A4B5"
}
```

### Admin Endpoints

#### Approve Creator
```http
POST /api/admin/creators/:userId/approve
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "reason": "Optional approval note"
}

Response:
{
  "ok": true,
  "user": {
    "role": "creator",
    "creatorStatus": "approved",
    "creatorInviteCode": "JOHN3A4B5",
    // ... other fields
  }
}
```

---

## Testing Checklist

### Manual Testing

- [ ] **Invite Link Flow**
  1. Get invite code from approved creator
  2. Visit `/creator-request?creatorInvite=CODE`
  3. Verify inviter info banner shows
  4. Submit application
  5. Verify status is "pending"
  6. Admin approves
  7. Verify user becomes approved creator
  8. Verify user gets their own invite code

- [ ] **Direct Application**
  1. Visit `/creator-request` (no code)
  2. Verify "Acceso a creadores limitado" message
  3. Submit application
  4. Verify status is "pending"
  5. Admin approves
  6. Verify user becomes approved creator

- [ ] **Registration with Invite**
  1. Register new account with `creatorInvite` parameter
  2. Verify `creatorStatus` starts as "pending"
  3. Verify `invitedByCreator` is set
  4. Submit full application
  5. Admin approves
  6. Verify complete creator access

- [ ] **Security Validation**
  1. Try to manually set `role=creator` via API (should fail)
  2. Try to manually set `creatorStatus=approved` via API (should fail)
  3. Verify invalid invite codes are silently ignored
  4. Verify only admins can approve creators

---

## Migration Notes

### Existing Users

**No migration needed.** New fields have default values:
- `invitedByCreator: null`
- `creatorInviteCode: null` (generated on next admin approval)

### Existing Creators

**Auto-migration on next admin action:**
- When admin approves any new creator, existing approved creators without codes can be backfilled
- Or run one-time script to generate codes for all approved creators

### Frontend

**Backwards compatible:**
- Works with and without invite codes
- Existing creator request flow unchanged (just better messaging)
- No breaking changes to existing endpoints

---

## Future Enhancements

1. **Analytics Dashboard**
   - Track invite chains
   - See which creators drive most growth
   - Reward top recruiters

2. **Invite Limits**
   - Limit number of active invites per creator
   - Prevent spam
   - Reward quality over quantity

3. **Automated Approval**
   - Auto-approve users with valid invites from trusted creators
   - Implement trust tiers
   - Reduce admin workload

4. **Referral Bonuses**
   - Reward creators for successful invites
   - Track conversion rates
   - Incentivize growth

---

## Troubleshooting

### Invite Code Not Working

**Check:**
1. Code is uppercase (auto-normalized)
2. Inviter is approved creator
3. Inviter account not suspended
4. Code hasn't been typo'd

**Debug:**
```bash
# In MongoDB shell
db.users.findOne({ creatorInviteCode: "CODE" })
```

### User Stuck in Pending

**Check:**
1. Application was submitted
2. Admin dashboard shows request
3. User has `creatorStatus: "pending"`

**Resolution:**
- Admin must approve via `/admin/creators`

### Creator Missing Invite Code

**Resolution:**
- Re-save user via admin approval (generates code)
- Or run migration script to backfill

---

## Summary

The refined creator access model ensures:
- ✅ Controlled creator economy through admin approval
- ✅ Viral growth through invite system (with safeguards)
- ✅ Higher monetization through scarcity
- ✅ Quality control through approval process
- ✅ Traceable growth chains via `invitedByCreator`
- ✅ No backdoor activation paths
- ✅ Clean, controlled UX messaging

All creator access paths now require admin approval, preventing uncontrolled growth while enabling strategic viral expansion through trusted creators.
