# 📋 Configuración de Variables de Entorno

## Frontend (Vercel)

### Paso 1: Ir a configuración de Vercel
1. Ve a [vercel.com/dashboard](https://vercel.com/dashboard)
2. Selecciona tu proyecto MeetYouLive
3. Settings → Environment Variables

### Paso 2: Agregar estas variables

```bash
# Ya configuradas (verificar que existan)
NEXT_PUBLIC_API_URL=https://api.meetyoulive.net
NEXT_PUBLIC_AGORA_APP_ID=[tu_agora_app_id]
GOOGLE_CLIENT_ID=[tu_google_client_id]
GOOGLE_CLIENT_SECRET=[tu_google_client_secret]
NEXTAUTH_SECRET=[tu_nextauth_secret_random]
NEXTAUTH_URL=https://www.meetyoulive.net
INTERNAL_API_SECRET=[mismo_valor_que_backend]

# Firebase (verificar que existan)
NEXT_PUBLIC_FIREBASE_API_KEY=[tu_firebase_api_key]
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=[tu_proyecto].firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=[tu_proyecto_id]
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=[tu_proyecto].appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=[tu_sender_id]
NEXT_PUBLIC_FIREBASE_APP_ID=[tu_app_id]
NEXT_PUBLIC_FIREBASE_VAPID_KEY=[tu_vapid_key]

# NUEVAS - Analytics (agregar ahora)
NEXT_PUBLIC_GA_MEASUREMENT_ID=G-XXXXXXXXXX
NEXT_PUBLIC_FACEBOOK_PIXEL_ID=1234567890123456
NEXT_PUBLIC_TIKTOK_PIXEL_ID=[opcional]
```

### Paso 3: Redeploy
Después de agregar las variables:
1. Ve a Deployments
2. Encuentra el deployment más reciente
3. Click en los tres puntos (...)
4. "Redeploy"

---

## Backend (Render)

### Paso 1: Ir a configuración de Render
1. Ve a [dashboard.render.com](https://dashboard.render.com)
2. Selecciona tu servicio `meetyoulive-backend`
3. Environment

### Paso 2: Verificar estas variables existan

```bash
# Core (deben existir)
PORT=10000
MONGODB_URI=[tu_mongodb_atlas_connection_string]
JWT_SECRET=[tu_jwt_secret_random_long]
GOOGLE_CLIENT_ID=[mismo_valor_que_frontend]
GOOGLE_CLIENT_SECRET=[mismo_valor_que_frontend]
GOOGLE_CALLBACK_URL=https://api.meetyoulive.net/api/auth/google/callback
FRONTEND_URL=https://www.meetyoulive.net
AGORA_APP_ID=[tu_agora_app_id]
AGORA_APP_CERTIFICATE=[tu_agora_certificate]
STRIPE_SECRET_KEY=sk_live_[tu_stripe_secret_key]
STRIPE_WEBHOOK_SECRET=whsec_[tu_stripe_webhook_secret]
STRIPE_SUBSCRIPTION_PRICE_ID=price_[tu_price_id]
INTERNAL_API_SECRET=[mismo_valor_que_frontend]
NEXTAUTH_SECRET=[mismo_valor_que_frontend]

# SMTP (agregar si no existen - IMPORTANTE PARA EMAILS)
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=[tu_sendgrid_api_key]
SMTP_FROM=MeetYouLive <noreply@meetyoulive.net>

# Firebase Admin (verificar)
FCM_PROJECT_ID=[tu_firebase_project_id]
FCM_CLIENT_EMAIL=[tu_firebase_service_account_email]
FCM_PRIVATE_KEY=[tu_firebase_private_key_con_\n]

# Admin seed (opcional)
ADMIN_NAME=meetyoulive
ADMIN_EMAIL=admin@meetyoulive.net
ADMIN_PASSWORD=[tu_admin_password_seguro]

# Sentry (opcional)
SENTRY_DSN=[tu_sentry_dsn_o_dejar_vacio]
```

### Paso 3: Verificar secretos críticos

Estos deben coincidir entre frontend y backend:
- ✅ `INTERNAL_API_SECRET` - Mismo valor en ambos
- ✅ `NEXTAUTH_SECRET` - Mismo valor en ambos
- ✅ `GOOGLE_CLIENT_ID` - Mismo valor en ambos
- ✅ `GOOGLE_CLIENT_SECRET` - Mismo valor en ambos

---

## 🔍 Verificación Rápida

### Test 1: Backend Health
```bash
curl https://api.meetyoulive.net/api/health
```
Debe devolver: `{"status":"ok","message":"Servidor de MeetYouLive activo"}`

### Test 2: Frontend Carga
```bash
curl -I https://www.meetyoulive.net
```
Debe devolver: `HTTP/2 200`

### Test 3: Analytics en Navegador
1. Abre https://www.meetyoulive.net
2. Abre DevTools → Network
3. Busca requests a:
   - `google-analytics.com` (si configuraste GA)
   - `facebook.net` (si configuraste FB Pixel)

### Test 4: SMTP (si configuraste)
1. Regístrate con nuevo usuario
2. Verifica que llegue email de bienvenida
3. Si no llega, revisa logs en Render

---

## 🚨 Troubleshooting

### Analytics no funciona
```
✅ Verificar que NEXT_PUBLIC_GA_MEASUREMENT_ID esté en Vercel
✅ Formato correcto: G-XXXXXXXXXX
✅ Redeploy después de agregar
✅ Limpiar caché del navegador
✅ Probar en incógnito
✅ Esperar 5-10 minutos para ver datos
```

### Emails no se envían
```
✅ Verificar SMTP_PASS es API key de SendGrid (no password)
✅ Verificar SMTP_USER es exactamente "apikey"
✅ Revisar logs del backend en Render
✅ Verificar que SendGrid account esté active
```

### Error de CORS
```
✅ Verificar FRONTEND_URL en backend = https://www.meetyoulive.net
✅ Sin slash al final
✅ Con https://
```

### OAuth no funciona
```
✅ GOOGLE_CLIENT_ID y SECRET deben ser iguales en frontend y backend
✅ NEXTAUTH_SECRET debe ser igual en ambos
✅ Google Console → Authorized redirect URIs debe incluir:
   https://www.meetyoulive.net/api/auth/callback/google
```

---

## ✅ Checklist

Marca cuando completes cada paso:

### Frontend (Vercel)
- [ ] Todas las variables existentes verificadas
- [ ] `NEXT_PUBLIC_GA_MEASUREMENT_ID` agregada
- [ ] `NEXT_PUBLIC_FACEBOOK_PIXEL_ID` agregada
- [ ] Redeploy ejecutado
- [ ] Frontend carga correctamente
- [ ] Analytics funciona en DevTools

### Backend (Render)
- [ ] Todas las variables core verificadas
- [ ] Variables SMTP agregadas
- [ ] Variables coinciden con frontend (INTERNAL_API_SECRET, NEXTAUTH_SECRET, etc.)
- [ ] Health endpoint responde correctamente
- [ ] Logs no muestran errores

### Testing
- [ ] Registro de usuario funciona
- [ ] Login con Google funciona
- [ ] Email de bienvenida llega
- [ ] Feed carga directos
- [ ] Analytics registra pageviews
- [ ] Sin cold starts (esperar 20 min y probar)

---

## 🎯 Siguiente Paso

Una vez completado este checklist:
1. ✅ Variables configuradas
2. ➡️ Seguir con **LAUNCH_PLAN.md** - Día 4 (Testing Exhaustivo)
