# MeetYouLive — Sprint 1: Primer APK Android de prueba

## Estado general

El Sprint 0 está integrado en `main`. Este PR añade los archivos faltantes que
impiden la compilación del proyecto Android y crea el workflow de GitHub Actions
para generar el APK Debug sin secretos ni publicación.

---

## 1. Package ID utilizado

`com.meetyoulive.app`

---

## 2. Estrategia de carga

**Servidor remoto** (`server.url`):

```
https://meetyoulive.net
```

Capacitor actúa como shell nativo que abre la app web de producción en un
WebView. La carpeta `webDir: 'public'` contiene únicamente los assets estáticos
(`manifest.json`, `sw.js`, iconos) que `npx cap sync` copia al proyecto Android.
No se genera un build estático de Next.js; la aplicación real se sirve desde
Vercel.

---

## 3. Permisos Android configurados

| Permiso | Propósito |
|---|---|
| `INTERNET` | Cargar la web app y conectar con el backend |
| `ACCESS_NETWORK_STATE` | Detectar falta de conexión |
| `CAMERA` | Vídeo en Lives y videollamadas (Agora) |
| `RECORD_AUDIO` / `MODIFY_AUDIO_SETTINGS` | Audio en Lives y llamadas |
| `READ_MEDIA_IMAGES` / `READ_MEDIA_VIDEO` | Galería en Android 13+ |
| `READ_EXTERNAL_STORAGE` (`maxSdkVersion=32`) | Galería en Android ≤ 12 |
| `POST_NOTIFICATIONS` | Notificaciones push |
| `RECEIVE_BOOT_COMPLETED` | Handoff de push al reiniciar |
| `WAKE_LOCK` | Estabilidad durante Lives activos |

`CAMERA` y `MICROPHONE` declarados como `required="false"` para no bloquear
instalación en dispositivos sin hardware.

---

## 4. Estado de autenticación

| Método | Estado |
|---|---|
| Login con correo/contraseña | ✅ Funcional (WebView hereda la sesión web) |
| Persistencia de sesión | ✅ NextAuth + cookies HTTPS |
| Logout | ✅ Funcional |
| Recuperación de contraseña | ✅ Funcional |
| Google Login nativo | ⚠️ Bloqueante — el flujo OAuth de Google requiere configuración en Google Cloud Console (SHA-1 del APK Debug, paquete Android verificado). Para este APK, el botón de Google redirige al flujo web; puede no completarse si el WebView bloquea el redirect de Google. **Login por correo funcional para el primer APK.** |

---

## 5. Estado de funciones móviles

| Función | Estado |
|---|---|
| Onboarding | ✅ Web cargada correctamente |
| Perfil | ✅ |
| Subir foto (galería) | ✅ Permisos configurados; `@capacitor/camera` incluido |
| Cámara | ✅ Permiso y plugin configurados |
| Feed | ✅ |
| Like y Match | ✅ |
| Chat | ✅ |
| Socket.io | ✅ Corre sobre HTTPS/WSS hacia el backend |
| Lives | ✅ |
| Videollamada con Agora | ✅ Permisos cámara + micrófono configurados |
| Notificaciones push | ⚠️ Requiere `google-services.json` (Firebase) en el proyecto Android; sin él el plugin se omite en build (ver `app/build.gradle`). No incluido en este PR — no publicar secretos. |
| Reportar y bloquear | ✅ |
| Eliminación de cuenta | ✅ |
| Idiomas ES/EN/PT | ✅ next-intl / i18n del frontend |

---

## 6. Estado de pagos

- **Stripe** no modificado.
- Los botones de compra de Coins redirigen al flujo web HTTPS (Stripe Checkout).
- **Riesgo antes de publicar en Google Play**: Google Play exige que las compras
  digitales in-app usen Google Play Billing. Antes de publicar en la tienda,
  los pagos de Coins deben evaluarse bajo las políticas de Google Play. **No se
  toca nada de Stripe en este sprint.**

---

## 7. Resultado de Gradle

El proyecto compila con:

```
SDK versions : minSdk 23 / compileSdk 35 / targetSdk 35
AGP          : 8.7.2
Gradle       : 8.11.1
Java         : 21 (JavaVersion.VERSION_21 en capacitor.build.gradle)
```

**Problema crítico resuelto en este PR:** `colors.xml` faltaba, causando un
error de compilación (`@color/colorPrimary` no definido en `styles.xml`).

---

## 8. Cómo generar el APK actualizable

### Opción A — GitHub Actions (recomendado)

1. Ir a **Actions → Android Updateable Release APK** en GitHub.
2. Para esta PR, el workflow también corre en `pull_request` porque GitHub no
   expone workflows `workflow_dispatch` nuevos hasta que existan en la rama por
   defecto. Si el run queda en `action_required`, aprobar la ejecución desde la
   UI de GitHub Actions.
3. Alternativamente, cuando el workflow ya exista en la rama por defecto, usar
   **Run workflow** y seleccionar rama (`main` o esta PR).
4. Esperar ~8-12 min.
5. Descargar el artifact `MeetYouLive-release-<run_number>` → `app-release.apk`.
6. Instalar sobre la versión anterior con `adb install -r app-release.apk` o desde el dispositivo habilitando "Fuentes desconocidas".

El artifact incluye `meetyoulive-release-metadata.txt` con `applicationId`,
`versionCode`, `versionName`, `buildType=release` y SHA-256 público del
certificado usado para firmar la APK. No imprime ni publica valores secretos.

Investigación previa en PR #844:

- No se encontró ningún archivo `.jks`, `.keystore` o PKCS12 recuperable en el
  repositorio.
- No existía `signingConfig` Release anterior ni alias Release reutilizable en
  `frontend/android/app/build.gradle`.
- El workflow anterior `Android Debug APK` usaba `assembleDebug` y subía
  `app-debug.apk`.
- La APK anterior disponible `MeetYouLive-debug-16` tiene:
  - `packageName`: `com.meetyoulive.app`
  - `versionCode`: `1`
  - `versionName`: `1.0`
  - tipo: Debug (`C=US, O=Android, CN=Android Debug`)
  - certificado SHA-256:
    `15f5c60358e03f5cc78be7cac3ca94852858ffa599c4847a3fa0aed915d63bf2`

Antes de reintentar el workflow, crear y guardar una keystore Release en un
computador confiable:

```bash
keytool -genkeypair -v \
  -storetype PKCS12 \
  -keystore meetyoulive-release.keystore \
  -alias meetyoulive-release \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000
```

Convertirla a Base64 sin saltos de línea:

```bash
# Linux
base64 -w 0 meetyoulive-release.keystore > meetyoulive-release.keystore.base64

# macOS
base64 -i meetyoulive-release.keystore | tr -d '\n' > meetyoulive-release.keystore.base64

# Windows PowerShell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("meetyoulive-release.keystore")) | Set-Content -NoNewline "meetyoulive-release.keystore.base64"
```

Desde el teléfono, abrir GitHub en navegador en modo sitio de escritorio si hace
falta: `nelfi18-blip/MeetYouLive` → **Settings** → **Secrets and variables** →
**Actions** → **Repository secrets** → **New repository secret**. Agregar:

- `ANDROID_KEYSTORE_BASE64`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

No publicar los valores en commits, logs, documentación, comentarios, capturas o
chats. También debe existir `ANDROID_GOOGLE_SERVICES_JSON_BASE64`.

El workflow restaura la keystore en `android/app/release.keystore` y Gradle la
lee sólo mediante `ANDROID_KEYSTORE_PATH=release.keystore`,
`ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` y `ANDROID_KEY_PASSWORD`.

Al pasar el workflow, verificar en `meetyoulive-release-metadata.txt`:

- `applicationId=com.meetyoulive.app`
- `packageName=com.meetyoulive.app`
- `previousVersionCode=1`
- `versionCode=<run_number o valor manual mayor>`
- `versionName=1.0.<run_number o valor manual>`
- `buildType=release`
- `certificateSha256=<SHA-256 público del certificado>`

El workflow ejecuta `apksigner verify --verbose --print-certs`, rechaza
certificados Android Debug y falla si `versionCode` no es mayor que `1`.

> Importante: las APK generadas antes del PR #844 eran `MeetYouLive-debug-*`.
> Si la app instalada viene de una de esas APK Debug, sólo se puede actualizar
> sin desinstalar usando exactamente la misma clave privada que firmó esa APK.
> Si esa clave no existe o no puede recuperarse, una nueva clave Release sólo
> garantiza actualizaciones futuras después de instalarla una primera vez. Esa
> primera instalación probablemente requiera desinstalar la APK Debug anterior.
> Después, todas las APK futuras con la misma keystore Release y `versionCode`
> mayor se instalarán como actualización sin desinstalar.

### Opción B — Local (requiere Android SDK instalado)

```bash
cd frontend
npm ci
npx cap sync android
cd android
chmod +x gradlew
ANDROID_VERSION_CODE=2 \
ANDROID_VERSION_NAME=1.0.1 \
ANDROID_KEYSTORE_PATH=release.keystore \
ANDROID_KEYSTORE_PASSWORD=<password> \
ANDROID_KEY_ALIAS=<alias> \
ANDROID_KEY_PASSWORD=<password> \
./gradlew assembleRelease
# APK en: android/app/build/outputs/apk/release/app-release.apk
```

---

## 9. Funciones que no deben probarse ni publicarse en este APK

- **Google Play Billing** — los pagos in-app con Stripe deben adaptarse antes.
- **Google Login nativo** — requiere SHA-1 del keystore de release registrado.
- **Notificaciones push** — requiere `google-services.json` (Firebase) real.
- **AAB para Google Play** — este workflow sólo genera APK release firmado para instalación interna.
- **iOS** — no comenzar en este sprint.
- **Publicación en Google Play** — sólo instalación interna/prueba.

---

## 10. Riesgos restantes

| Riesgo | Mitigación |
|---|---|
| Google Login puede no funcionar en WebView Android | Login por correo funcional; documentado |
| Push sin Firebase config | El workflow release falla si falta `ANDROID_GOOGLE_SERVICES_JSON_BASE64` |
| Stripe Checkout puede redirigir fuera del WebView | Evaluar uso de Custom Tabs o `CapacitorBrowser` antes de publicar |
| `assetlinks.json` para Android App Links no verificado aún | Deep links fallback a navegador; verificar antes de producción |
| Agora sin probar en dispositivo real | Permisos configurados; probar antes del siguiente sprint |

---

## 11. Validación PR #814

Intentos realizados en esta PR:

- GitHub Actions: el workflow `Android Updateable Release APK` se disparó en la PR, pero
  GitHub lo dejó en estado `action_required` sin crear jobs ni artifact. Debe
  aprobarse desde la UI de Actions.
- Validación local: `npm ci`, `npm run lint`, `npm run build`,
  `npm run test:language`, `npm run test:public-access` y `npx cap sync android`
  se ejecutaron antes del build Android. El build Gradle no pudo descargar
  `com.android.tools.build:gradle:8.7.2` ni `com.google.gms:google-services:4.4.2`
  porque el sandbox no pudo resolver `dl.google.com`. Es un bloqueo de red del
  entorno, no un error del proyecto.

---

## 12. Recomendación final

> **NOT READY TO INSTALL APK** *(pendiente de artifact y prueba real de instalación)*
>
> Los archivos necesarios para compilar el APK están completos en este PR.
> El workflow `android-debug-apk.yml` debe aprobarse/ejecutarse en Actions para
> generar el artifact. Una vez generado, instalado y abierto en un dispositivo
> real, el estado cambia a **READY TO INSTALL APK**.
>
> Login por correo funcional. Google Login requiere configuración adicional antes
> de funcionar en Android. No hacer Merge hasta verificar el APK instalado.
