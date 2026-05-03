# Session Separation Architecture

## Overview

MeetYouLive now implements proper session separation between admin/staff accounts and regular user/creator accounts to prevent session conflicts and ensure smooth account switching.

## Key Components

### 1. Token Management (`frontend/lib/token.js`)

#### Admin Sessions
- **Storage**: `localStorage.admin_token` + `admin_user`
- **Cookie**: `admin-session` (for middleware detection)
- Functions: `setAdminToken()`, `clearAdminToken()`, `getAdminToken()`

#### User/Creator Sessions
- **Storage**: `localStorage.token` (email/password) or NextAuth cookies (Google OAuth)
- **Cookie**: `auth-session` (for middleware detection)
- Functions: `setToken()`, `clearToken()`, `getToken()`

#### Complete Session Clear
- **Function**: `clearAllAuth()`
- Clears:
  - Admin tokens (`admin_token`, `admin_user`)
  - User tokens (`token`)
  - NextAuth session storage keys
  - All auth cookies (`auth-session`, `admin-session`, NextAuth cookies)

### 2. Middleware Protection (`frontend/middleware.js`)

#### Admin Route Protection
- Routes: `/admin/*` (except `/admin/login`)
- Requires: `admin-session` cookie
- No admin session → Redirect to `/admin/login`

#### User Route Protection
- Routes: `/dashboard`, `/profile`, `/creator`, `/live`, `/chats`, etc.
- Requires: `auth-session` or NextAuth session cookie
- No user session → Redirect to `/login`

#### Cross-Session Blocking
- **Admin trying to access user routes** → Redirect to `/admin/blocked?from={path}`
- **Already authenticated users on login pages** → Redirect appropriately

### 3. Admin Blocked Page (`frontend/app/admin/blocked/page.jsx`)

Displays when an admin tries to access user/creator routes:

```
🔒 Acceso Restringido
Estás conectado como administrador.

Para acceder al [route], necesitas cambiar de cuenta e iniciar sesión como creador o usuario.

[🔄 Cambiar a cuenta de usuario]
[← Volver al panel de administrador]
```

Features:
- Shows attempted path with friendly label
- One-click switch account button
- Link to return to admin panel
- Uses Suspense boundary for `useSearchParams()`

### 4. Switch Account Feature

#### Admin Layout
- Location: Sidebar footer
- Buttons:
  - **"🔄 Cambiar cuenta"** (blue) → Clears all auth, redirects to `/login`
  - **"⏻ Cerrar sesión"** (red) → Clears admin token, redirects to `/admin/login`
- Confirmation dialog before switching

#### User Navbar
- Location: User dropdown menu
- Options:
  - **"🔄 Cambiar cuenta"** → Clears all auth, redirects to `/login`
  - **"Cerrar sesión"** → Clears user token, signs out of NextAuth
- Confirmation dialog with i18n support

### 5. Backend JWT Validation

Admin and user sessions use the same JWT secret but are validated separately:
- **Admin routes**: `verifyToken` + `requireAdmin` (or `requirePermission`)
- **User routes**: `verifyToken` only
- No cross-contamination: Admin JWT doesn't grant user route access

## User Flows

### 1. Admin Logout → User Login
1. Admin clicks "Cerrar sesión" in admin panel
2. `clearAdminToken()` removes admin token and cookie
3. Redirects to `/admin/login`
4. User navigates to `/login` manually or via admin login page link
5. User logs in with email/password or Google OAuth
6. User session established, can access all user/creator routes

### 2. Admin Switch Account
1. Admin clicks "Cambiar cuenta" in admin panel
2. Confirmation: "¿Cambiar a cuenta de usuario/creador? Esto cerrará tu sesión de administrador."
3. `clearAllAuth()` removes ALL tokens and cookies
4. Redirects to `/login`
5. Clean slate for user/creator login

### 3. User Switch Account
1. User clicks "Cambiar cuenta" in navbar dropdown
2. Confirmation: "¿Cambiar de cuenta? Esto cerrará tu sesión actual."
3. `clearAllAuth()` removes ALL tokens and cookies
4. Redirects to `/login`
5. Can log in as any account type

### 4. Admin Tries to Access Creator Route
1. Admin (with `admin-session` cookie) navigates to `/creator`
2. Middleware detects admin session on protected user route
3. Redirects to `/admin/blocked?from=/creator`
4. Blocked page shows message and options
5. Admin can switch account or return to admin panel

## Security Considerations

### Token Isolation
- Admin and user tokens stored in separate localStorage keys
- Separate cookies prevent middleware conflicts
- No shared state between admin and user sessions

### Session Validation
- Middleware validates on every navigation
- Backend validates JWT on every API call
- Blocked users (isBlocked=true) rejected at token verification

### Clean Logout
- `clearToken()` for user logout (doesn't affect admin session)
- `clearAdminToken()` for admin logout (doesn't affect user session)
- `clearAllAuth()` for complete cleanup (account switching)

### Google OAuth Integration
- NextAuth session independent of admin session
- Backend token stored in session.backendToken
- Admin cannot use Google OAuth (staff must use email/password)

## Testing Checklist

- [x] Admin can log in to `/admin/login`
- [x] Admin can log out and see admin login page
- [x] Admin redirected from user routes to blocked page
- [x] Admin can switch to user account from blocked page
- [x] Admin can switch account from sidebar
- [x] User can log in after admin logout
- [x] User can switch account from navbar
- [x] Google OAuth login works (NextAuth flow)
- [x] Email/password login works
- [x] Frontend build passes
- [ ] Manual testing: Admin → logout → creator login
- [ ] Manual testing: Admin → switch account → user login
- [ ] Manual testing: User → switch account → admin login

## i18n Support

Translation keys added to all message files (es, en, pt):

```json
{
  "nav": {
    "switchAccount": "Cambiar cuenta / Switch account / Mudar conta",
    "switchAccountConfirm": "¿Cambiar de cuenta? Esto cerrará tu sesión actual. / Switch account? This will log you out. / Mudar de conta? Isso encerrará sua sessão atual."
  }
}
```

## Maintenance Notes

### Adding New Protected Routes
Update `isProtectedRoute` in `frontend/middleware.js`:
```javascript
const isProtectedRoute =
  pathname.startsWith("/dashboard") ||
  pathname.startsWith("/new-route") || // Add here
  ...
```

### Adding New Staff Roles
No changes needed. All staff roles defined in backend are allowed to log in to admin panel. Frontend shows role-specific navigation based on permissions.

### Modifying Session Cookies
Update cookie names in both `frontend/lib/token.js` and `frontend/middleware.js` to keep them in sync.
