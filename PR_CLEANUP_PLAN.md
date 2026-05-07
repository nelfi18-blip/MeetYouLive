# Plan de Limpieza de Pull Requests - MeetYouLive

**Fecha:** 2026-05-07  
**Estado actual:** 76 PRs abiertos  
**Estado objetivo:** ~20 PRs activos

---

## 📊 Resumen Ejecutivo

El repositorio tiene una acumulación significativa de PRs antiguos que dificultan la gestión del proyecto:

- **40 PRs obsoletos** (drafts >60 días) → **CERRAR**
- **19 PRs intermedios** (drafts 30-60 días) → **REVISAR Y DECIDIR**
- **14 PRs listos** (no-draft >30 días) → **REVISAR Y MERGEAR/CERRAR**
- **3 PRs recientes** (< 30 días) → **MANTENER ACTIVOS**

---

## 🗑️ ACCIÓN 1: Cerrar 40 PRs Obsoletos (>60 días)

Estos PRs son drafts que llevan más de 60 días sin actualizarse. Muy probablemente el trabajo ya fue integrado de otra forma o ya no es relevante.

### Lista completa de PRs a cerrar:

```
#  11 | 72 días | Phase 10: legal pages, security middleware, and README production ready
#  12 | 72 días | FASE 11: Growth features — Analytics, Creators landing, Video sharing, Contests
#  14 | 72 días | feat: Phase 13 – WebRTC live streaming via Socket.IO signaling
#  17 | 72 días | feat: Phase 15 — Moderation, Reports & Role-Based Access
#  22 | 72 días | docs: expand README to full professional reference
#  23 | 72 días | Restructure repo: move backend into backend/ subdirectory
#  24 | 72 días | Fix import-time crashes and missing env vars for Render + Vercel deployment
#  25 | 70 días | Fix server startup crashes due to ES module hoisting and missing env vars
#  26 | 70 días | Fix Vercel deployment: invalid vercel.json schema + missing frontend config
#  28 | 70 días | Wire up all required environment variables across backend and frontend
#  29 | 69 días | Decline to commit live Stripe credentials; document secure configuration
#  30 | 68 días | Add video CRUD routes, user profile update, and blocked-user login enforcement
#  31 | 66 días | fix: stop unconditional login redirect, add route-scoped auth middleware
#  34 | 66 días | Wire up NEXT_PUBLIC_LIVE_PROVIDER_KEY with live streaming frontend
#  39 | 66 días | Add .github/copilot-instructions.md
#  40 | 66 días | Add Open Graph metadata, robots.txt, and sitemap for meetyoulive.net
#  42 | 66 días | fix: prevent backend startup crash on Render when env vars are missing
#  45 | 66 días | Set up Copilot coding agent instructions
#  47 | 65 días | fix: align backend startup log with expected Render deployment output
#  48 | 65 días | Fix backend entry point: direct server startup in index.js
#  66 | 62 días | feat(live): add featured room hero + popular rooms grid
#  67 | 62 días | feat: full-featured ChatsPage with split-pane layout, active chat indicator
#  69 | 62 días | Add VR page placeholder to Next.js App Router
#  70 | 62 días | Add missing VR page and navbar entry
#  71 | 62 días | feat: extract reusable BottomNav component from Navbar
#  72 | 62 días | Add reusable Logo component
#  73 | 62 días | Add homepage at app/page.jsx with reusable Logo component
#  74 | 62 días | Add Tailwind CSS and update global styles/layout metadata
#  75 | 62 días | Add standalone BottomNav component and wire it into dashboard
#  76 | 62 días | Add standalone BottomNav component and integrate into explore page
#  77 | 62 días | Replace live page with minimal BottomNav shell
#  78 | 62 días | Chats page cleanup (step 17): replace with minimal skeleton + external nav
#  80 | 62 días | Add VRPage and BottomNav component with @/ alias support
#  81 | 62 días | chore: expand root .gitignore to cover all sensitive and generated files
#  82 | 62 días | Add Wallet model and coin transaction history logging
#  84 | 62 días | Fix `.github/copilot-instructions.md` to reflect actual codebase
#  85 | 62 días | feat: add VR/Gifts pages, Stripe API routes, Mongoose models, and MongoDB connection
#  87 | 62 días | feat: Tinder-style Explore page with swipe card UI
#  88 | 62 días | Rework login page UI to match target design using Tailwind CSS
#  89 | 61 días | Add missing frontend pages, Stripe API routes, Mongoose models, and live streaming
```

**Comando para ejecutar:**
```bash
bash scripts/close_obsolete_prs.sh
```

---

## 🔍 ACCIÓN 2: Revisar 19 PRs Intermedios (30-60 días)

Estos drafts tienen entre 30 y 60 días. Requieren decisión: completar y marcar como "ready for review" o cerrar.

### Lista de PRs para revisar:

```
# 100 | 57 días | Fix broken chats route, empty profile page, viewer count mismatch
# 107 | 54 días | docs: set up Copilot coding agent instructions
# 109 | 54 días | Set up Copilot coding agent instructions
# 170 | 45 días | fix: verify and confirm unified CORS config in backend/src/app.js
# 173 | 45 días | fix: verify and confirm resolved merge conflicts with unified CORS/port
# 175 | 45 días | Extract signup into auth controller, add bcrypt pre-save hook to User model
# 187 | 45 días | fix(auth): replace x-nextauth-secret with dedicated internal API secret
# 193 | 45 días | Fix OAuthCallback error in Google Sign-In flow
# 195 | 44 días | fix: configure SameSite=None; Secure cookies for cross-origin session sharing
# 204 | 42 días | Consistent displayName fallback chain across Navbar and Profile
# 210 | 42 días | Add profile image upload feature with cloud storage support
# 219 | 41 días | fix(auth): restore working Google OAuth by exporting authOptions and switching
# 221 | 41 días | feat(admin): replace env-var credentials with MongoDB + bcrypt admin login
# 231 | 39 días | fix(admin): server-side proxy for admin login to eliminate CORS errors
# 244 | 38 días | Harden NextAuth backend token handoff
# 262 | 38 días | docs(frontend): fix outdated README env vars and document NextAuth Google OAuth
# 278 | 36 días | feat: implement Transmitir flow for approved creators only
# 288 | 36 días | Coins system: complete monetization foundation
# 293 | 36 días | Add rarity-scaled dynamic gift effects to live room and chat
```

**Acción recomendada:** Revisar individualmente y decidir caso por caso.

---

## ⚠️ ACCIÓN 3: Mergear/Cerrar 14 PRs Listos Antiguos (>30 días)

Estos PRs están marcados como "ready for review" pero llevan más de 30 días esperando. Revisar si aún son relevantes para mergear o si deben cerrarse.

### Lista de PRs listos antiguos:

```
#   2 | 72 días | Add JWT authentication (register & login) with rate limiting
#   8 | 72 días | FASE 7: Add video upload system (public/private videos) with Cloudinary
#   9 | 72 días | feat: Phase 8 — Stripe monetization (private videos + purchases)
#  13 | 72 días | FASE 12: React Native/Expo mobile app + backend video & coin APIs
#  15 | 72 días | FASE 13: Add WebRTC live streaming with Socket.IO signaling, real-time chat
#  16 | 72 días | FASE 14: Monthly subscriptions (OnlyFans-style recurring revenue)
#  18 | 72 días | feat: Phase 16 — Professional Live Streaming infrastructure
#  19 | 72 días | FASE 17: Reorganize into backend/frontend monorepo with clean project structure
#  20 | 72 días | feat: complete professional project structure (FASE 18)
#  53 | 62 días | feat: Add dark-theme UI design system to all frontend pages
#  63 | 62 días | Fix copilot-instructions.md to match actual codebase
# 192 | 45 días | Fix production env URLs: point to Render backend and use www frontend domain
# 304 | 36 días | Adjust transform properties for gift effect animation
# 308 | 35 días | feat: Creator Earnings Dashboard
```

**Acción recomendada:** Revisar individualmente, mergear lo útil y cerrar lo obsoleto.

---

## 🚀 ACCIÓN 4: Mantener PRs Recientes Activos

Estos son los únicos PRs verdaderamente activos y recientes:

```
# 403 | 21 días | Rebuild admin shell with mobile-first drawer/sidebar architecture
# 527 |  3 días | Add static public landing page for Stripe compliance review
# 528 |  3 días | Convert root page to static landing, move authenticated feed to /feed
```

**Acción recomendada:** Continuar trabajo normal, revisar y mergear cuando estén listos.

---

## 📝 Implementación

### Paso 1: Cerrar PRs obsoletos (automático)

```bash
cd /home/runner/work/MeetYouLive/MeetYouLive
bash scripts/close_obsolete_prs.sh
```

Este script cerrará automáticamente los 40 PRs obsoletos con un comentario explicativo.

### Paso 2: Revisar PRs manualmente

Para cada categoría restante, revisar y decidir:
- Mergear si el trabajo es útil y está completo
- Cerrar si ya no es relevante o fue implementado de otra forma
- Actualizar y completar si el trabajo aún es necesario

### Paso 3: Mantener limpio el repositorio

- Cerrar PRs que lleven >30 días sin actividad
- Convertir drafts a "ready for review" cuando estén completos
- Revisar PRs listos en un plazo razonable (< 7 días)

---

## 🎯 Resultado Esperado

**Antes:** 76 PRs abiertos  
**Después:** ~20 PRs activos y relevantes

Esto hará que el repositorio sea más manejable y permitirá enfocarse en el trabajo actual.
