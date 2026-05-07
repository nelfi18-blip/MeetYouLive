# 🚀 Guía de Configuración Pre-Lanzamiento

Esta guía te ayudará a configurar MeetYouLive para el lanzamiento público con todas las optimizaciones de SEO, analytics y tracking necesarias.

## 📋 Checklist de Configuración

### 1. SEO Básico ✅ (Ya implementado)

- ✅ **robots.txt** - Configurado en `/frontend/public/robots.txt`
- ✅ **sitemap.xml** - Generado dinámicamente en `/sitemap.xml`
- ✅ **Meta tags mejorados** - Open Graph y Twitter Cards
- ✅ **Structured Data (JSON-LD)** - Para rich snippets en Google

### 2. Analytics y Tracking (Configuración requerida)

#### Google Analytics 4

1. **Crear cuenta de Google Analytics**
   - Ve a [https://analytics.google.com](https://analytics.google.com)
   - Crea una nueva propiedad para "www.meetyoulive.net"
   - Selecciona "Web" como plataforma
   - Copia tu Measurement ID (formato: `G-XXXXXXXXXX`)

2. **Configurar en Vercel**
   ```bash
   # En Vercel Dashboard → Settings → Environment Variables
   NEXT_PUBLIC_GA_MEASUREMENT_ID=G-XXXXXXXXXX
   ```

3. **Verificar instalación**
   - Despliega los cambios
   - Abre tu sitio y abre Chrome DevTools → Network
   - Busca requests a `google-analytics.com` o `googletagmanager.com`
   - O instala la extensión "Google Analytics Debugger"

#### Facebook Pixel (Opcional pero recomendado para ads)

1. **Crear Facebook Pixel**
   - Ve a [https://business.facebook.com](https://business.facebook.com)
   - Events Manager → Pixels → Create Pixel
   - Copia tu Pixel ID (número)

2. **Configurar en Vercel**
   ```bash
   NEXT_PUBLIC_FACEBOOK_PIXEL_ID=1234567890123456
   ```

#### TikTok Pixel (Opcional)

Si planeas hacer publicidad en TikTok:
```bash
NEXT_PUBLIC_TIKTOK_PIXEL_ID=YOUR_TIKTOK_PIXEL_ID
```

### 3. Monitoreo de Uptime (Crítico)

#### Opción A: UptimeRobot (Gratis - Recomendado para empezar)

1. **Crear cuenta**
   - Ve a [https://uptimerobot.com](https://uptimerobot.com)
   - Regístrate gratis

2. **Configurar monitor**
   - Click "Add New Monitor"
   - Monitor Type: **HTTP(s)**
   - Friendly Name: `MeetYouLive API`
   - URL: `https://api.meetyoulive.net/api/health`
   - Monitoring Interval: **5 minutes**
   - Alert Contacts: Tu email

3. **Resultado**
   - El backend nunca entrará en "cold start"
   - Usuarios no verán retrasos de 30-60 segundos

#### Opción B: Render Starter Tier ($7/mes - Mejor para producción)

1. **Upgrade en Render**
   - [dashboard.render.com](https://dashboard.render.com)
   - Selecciona tu servicio `meetyoulive-backend`
   - Settings → Instance Type
   - Upgrade a **Starter** ($7/mes)

2. **Beneficios**
   - Sin cold starts (instancia siempre activa)
   - Mejor rendimiento
   - Sin necesidad de UptimeRobot

### 4. Configuración SMTP (Para emails)

**Opción recomendada: SendGrid** (100 emails/día gratis)

1. **Crear cuenta SendGrid**
   - [https://sendgrid.com](https://sendgrid.com)
   - Sign Up → Free tier

2. **Crear API Key**
   - Settings → API Keys → Create API Key
   - Full Access → Create & View
   - Copia la API key (solo se muestra una vez)

3. **Configurar en Render**
   ```bash
   # Backend environment variables en Render
   SMTP_HOST=smtp.sendgrid.net
   SMTP_PORT=587
   SMTP_USER=apikey
   SMTP_PASS=SG.xxxxxxxxxxxxxxxxxxxx (tu API key)
   SMTP_FROM=noreply@meetyoulive.net
   ```

4. **Verificar dominio (Recomendado)**
   - SendGrid → Settings → Sender Authentication
   - Domain Authentication → Verify domain
   - Agrega los DNS records en GoDaddy
   - Mejora deliverability

**Alternativas SMTP:**
- **Mailgun** - 5,000 emails/mes gratis primer mes
- **Amazon SES** - $0.10 por 1,000 emails (muy barato)
- **Gmail SMTP** - Gratis pero limitado a 500/día

### 5. Verificación de URLs Canónicas

Asegúrate de que todas las URLs sean consistentes:

- ✅ Frontend: `https://www.meetyoulive.net` (con www)
- ✅ Backend: `https://api.meetyoulive.net`
- ✅ Redirect: `https://meetyoulive.net` → `https://www.meetyoulive.net`

Verifica en Vercel → Domains que la redirección esté configurada.

### 6. DNS y SSL (Verificación)

```bash
# Verificar DNS
dig www.meetyoulive.net
dig api.meetyoulive.net

# Verificar SSL
curl -v https://www.meetyoulive.net
curl -v https://api.meetyoulive.net/api/health
```

Ambos deben devolver certificado SSL válido sin errores.

---

## 🎯 Testing Post-Configuración

### Test 1: Google Analytics

1. Abre tu sitio en incognito: `https://www.meetyoulive.net`
2. Navega por varias páginas
3. Ve a Google Analytics → Reports → Realtime
4. Debes ver tu sesión activa

### Test 2: Facebook Pixel

1. Instala "Facebook Pixel Helper" extension en Chrome
2. Visita tu sitio
3. El extension debe mostrar el pixel detectado

### Test 3: SEO

1. **Robots.txt**
   ```
   https://www.meetyoulive.net/robots.txt
   ```
   Debe mostrar el contenido correcto

2. **Sitemap**
   ```
   https://www.meetyoulive.net/sitemap.xml
   ```
   Debe mostrar XML con las URLs

3. **Meta tags**
   - Compartir la URL en WhatsApp/Twitter/Facebook
   - Debe mostrar imagen y descripción correcta

4. **Structured Data**
   - Ve a [https://search.google.com/test/rich-results](https://search.google.com/test/rich-results)
   - Pega la URL de tu landing page
   - Debe detectar: WebApplication, Organization, WebSite

### Test 4: Uptime Monitor

1. Ve a UptimeRobot dashboard
2. Verifica que el monitor esté "Up" (verde)
3. Espera 5 minutos
4. Verifica que haya hecho al menos un ping exitoso

### Test 5: Email (si configuraste SMTP)

1. Regístrate con un nuevo usuario
2. Verifica que llegue el email de bienvenida
3. Prueba "Forgot password"
4. Verifica que llegue el email de recuperación

---

## 📊 KPIs a Monitorear

Una vez configurado Analytics, monitorea estos KPIs diariamente:

| Métrica | Objetivo Primera Semana | Herramienta |
|---------|------------------------|-------------|
| Visitantes únicos | 100+ | Google Analytics |
| Registros | 20+ | Google Analytics (evento `sign_up`) |
| Tasa de conversión | 15-20% | Calculado: registros/visitantes |
| Bounce rate | < 60% | Google Analytics |
| Tiempo promedio | > 2 min | Google Analytics |
| Streams vistos | 50+ | Google Analytics (evento `view_stream`) |

### Eventos personalizados ya configurados:

- `sign_up` - Usuario se registra
- `login` - Usuario inicia sesión
- `purchase` - Compra de monedas
- `view_stream` - Ver un stream
- `send_gift` - Enviar regalo
- `match_made` - Hacer match
- `go_live` - Creador inicia stream

---

## 🚨 Problemas Comunes

### Analytics no aparece

- ✅ Verifica que `NEXT_PUBLIC_GA_MEASUREMENT_ID` esté en Vercel
- ✅ Redeploy después de agregar la variable
- ✅ Espera 5-10 minutos para ver datos en Analytics
- ✅ Verifica en modo incógnito (AdBlockers pueden bloquear)

### Sitemap no se genera

- ✅ Verifica que el archivo `frontend/app/sitemap.js` exista
- ✅ Redeploy
- ✅ Limpia caché del navegador
- ✅ Accede directamente: `https://www.meetyoulive.net/sitemap.xml`

### Emails no se envían

- ✅ Verifica las variables SMTP en Render
- ✅ Verifica que SMTP_PASS sea la API key correcta
- ✅ Revisa logs del backend en Render
- ✅ Verifica que SendGrid account esté activa

### Cold starts persisten

- ✅ Verifica que UptimeRobot esté configurado correctamente
- ✅ Verifica que el monitor esté "Up"
- ✅ Intervalo debe ser 5 minutos (no más)
- ✅ O upgradea a Render Starter ($7/mes)

---

## ✅ Checklist Final Pre-Lanzamiento

Antes de promocionar, verifica:

- [ ] Google Analytics instalado y funcionando
- [ ] UptimeRobot monitoreando cada 5 min (o Render upgraded)
- [ ] robots.txt accesible
- [ ] sitemap.xml accesible
- [ ] Meta tags se ven bien al compartir en redes sociales
- [ ] SMTP configurado y emails llegando
- [ ] SSL funcionando en www y api subdominios
- [ ] No hay cold starts (prueba en incógnito después de 20 min inactividad)
- [ ] Todos los links principales funcionan (/, /feed, /register, /login)
- [ ] Admin panel accesible (/admin)
- [ ] Stripe checkout funciona (modo test)

---

## 📈 Próximos Pasos

Una vez configurado todo:

1. **Día -7**: Crea landing con "Próximamente" y captura emails
2. **Día -3**: Invita 10-20 beta testers
3. **Día 0**: Lanzamiento público
4. **Día +1**: Monitorear analytics y ajustar
5. **Día +7**: Revisar métricas y optimizar

---

## 🆘 Soporte

Si tienes problemas:

1. Revisa los logs del backend en Render
2. Revisa los logs del frontend en Vercel
3. Verifica todas las variables de entorno
4. Prueba en incógnito sin extensiones

**Contacto:**
- Email: support@meetyoulive.net
- GitHub Issues: [nelfi18-blip/MeetYouLive](https://github.com/nelfi18-blip/MeetYouLive)
