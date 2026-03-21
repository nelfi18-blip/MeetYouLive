# MeetYouLive

MeetYouLive es una plataforma de streaming en vivo y red social con:

- Frontend en Next.js desplegado en Vercel
- Backend en Express desplegado en Render
- Base de datos MongoDB Atlas
- Autenticación con Google
- Soporte de sesión backend mediante JWT

## Arquitectura

### Frontend
- Plataforma: Vercel
- Directorio: `frontend`
- URL: `https://www.meetyoulive.net`

### Backend
- Plataforma: Render
- Directorio: `backend`
- URL: `https://api.meetyoulive.net`

### Base de datos
- MongoDB Atlas

### DNS
- GoDaddy

## Estructura del repositorio

```text
MeetYouLive/
├── backend/
│   ├── src/
│   ├── index.js
│   ├── package.json
│   └── .env.example
├── frontend/
│   ├── app/
│   ├── public/
│   ├── package.json
│   └── .env.example
├── render.yaml
└── README.md
```

## Funcionalidades

- ✅ Registro / Inicio de sesión (JWT)
- ✅ Inicio de sesión con Google OAuth
- ✅ Roles (usuario / creador / administrador)
- ✅ Vídeos (públicos y privados con pago)
- ✅ Streaming en vivo (iniciar, ver, terminar directo)
- ✅ Edición de perfil (nombre, usuario, bio)
- ✅ Chat privado entre usuarios
- ✅ Regalos virtuales con monedas
- ✅ Pagos con Stripe (compra única + suscripciones)
- ✅ Moderación y sistema de reportes
- ✅ Panel de administrador (gestión de usuarios, reportes)

## Desarrollo local

### Backend

```bash
cd backend
cp .env.example .env
# completa los valores
npm install
npm run dev
```

### Frontend

```bash
cd frontend
cp .env.example .env.local
# completa los valores
npm install
npm run dev
```

El frontend se ejecuta en [http://localhost:3000](http://localhost:3000) (por defecto en Next.js).

## Despliegue

### Frontend → Vercel

1. Importa el repositorio en [Vercel](https://vercel.com) y establece el **Directorio raíz** en `frontend`.
2. Configura las variables de entorno:
   ```
   NEXTAUTH_URL=https://www.meetyoulive.net
   NEXTAUTH_SECRET=tu_nextauth_secret
   NEXT_PUBLIC_API_URL=https://api.meetyoulive.net
   GOOGLE_CLIENT_ID=tu_google_client_id
   GOOGLE_CLIENT_SECRET=tu_google_client_secret
   ```
3. En **Proyecto → Configuración → Dominios** añade `meetyoulive.net` y `www.meetyoulive.net`.
4. En GoDaddy DNS configura:
   - Registro `A`: `@` → `76.76.21.21`
   - Registro `CNAME`: `www` → `cname.vercel-dns.com`

### Backend → Render

Se incluye un archivo `render.yaml` para que Render configure el servicio automáticamente.

1. Conecta el repositorio en [Render](https://render.com) y establece el **Directorio raíz** en `backend`.
2. Configura las variables de entorno secretas en **Environment**:
   ```
   NODE_ENV=production
   PORT=10000
   MONGODB_URI=tu_mongodb_uri
   JWT_SECRET=tu_jwt_secret
   NEXTAUTH_SECRET=tu_nextauth_secret
   FRONTEND_URL=https://www.meetyoulive.net
   GOOGLE_CLIENT_ID=tu_google_client_id
   GOOGLE_CLIENT_SECRET=tu_google_client_secret
   GOOGLE_CALLBACK_URL=https://api.meetyoulive.net/api/auth/google/callback
   STRIPE_SECRET_KEY=tu_stripe_secret_key
   STRIPE_WEBHOOK_SECRET=tu_stripe_webhook_secret
   STRIPE_SUBSCRIPTION_PRICE_ID=tu_stripe_price_id
   ```
3. En **Configuración → Dominios personalizados** añade `api.meetyoulive.net`.
4. En GoDaddy DNS añade un registro `CNAME`: `api` → `<tu-servicio>.onrender.com`.

### Google OAuth

En [Google Cloud Console](https://console.cloud.google.com) → **Cliente OAuth**:

- **URIs de redirección autorizados**: `https://api.meetyoulive.net/api/auth/google/callback`
- **Orígenes JavaScript autorizados**: `https://www.meetyoulive.net`

## Variables de entorno

### Frontend (`frontend/.env.example`)

| Variable                      | Descripción                                             |
|-------------------------------|---------------------------------------------------------|
| `NEXTAUTH_URL`                | URL canónica del frontend                               |
| `NEXTAUTH_SECRET`             | Secreto de firma/cifrado de NextAuth                    |
| `NEXT_PUBLIC_API_URL`         | URL base de la API del backend                          |
| `NEXT_PUBLIC_LIVE_PROVIDER_KEY` | Clave de la plataforma de streaming                   |
| `GOOGLE_CLIENT_ID`            | Client ID de Google OAuth (usado por NextAuth)          |
| `GOOGLE_CLIENT_SECRET`        | Client Secret de Google OAuth (usado por NextAuth)      |

### Backend (`backend/.env.example`)

| Variable                        | Descripción                                              |
|---------------------------------|----------------------------------------------------------|
| `PORT`                          | Puerto del servidor (por defecto 10000)                  |
| `MONGO_URI`                     | Cadena de conexión a MongoDB                             |
| `JWT_SECRET`                    | Secreto para firmar tokens JWT                           |
| `NEXTAUTH_SECRET`               | Secreto compartido verificado mediante la cabecera `x-nextauth-secret` |
| `GOOGLE_CLIENT_ID`              | Client ID de Google OAuth                                |
| `GOOGLE_CLIENT_SECRET`          | Client Secret de Google OAuth                            |
| `GOOGLE_CALLBACK_URL`           | `https://api.meetyoulive.net/api/auth/google/callback`   |
| `FRONTEND_URL`                  | `https://www.meetyoulive.net`                            |
| `STRIPE_SECRET_KEY`             | Clave secreta de Stripe (`sk_test_…` o `sk_live_…`)      |
| `STRIPE_WEBHOOK_SECRET`         | Secreto de firma del webhook de Stripe                   |
| `STRIPE_SUBSCRIPTION_PRICE_ID`  | ID de precio de Stripe para el plan de suscripción       |

## Notas

- `NEXTAUTH_SECRET` debe tener el mismo valor tanto en Vercel como en Render.
- `api.meetyoulive.net` debe apuntar al hostname del backend en Render.
- El frontend usa NextAuth y solicita un JWT del backend en: `POST /api/auth/google-session`
