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

### Opción B — Local (requiere Android SDK instalado)

```bash
cd frontend
npm ci
npx cap sync android
cd android
chmod +x gradlew
ORG_GRADLE_PROJECT_androidVersionCode=2 \
ORG_GRADLE_PROJECT_androidVersionName=1.0.1 \
ORG_GRADLE_PROJECT_androidStoreFile=release.keystore \
ORG_GRADLE_PROJECT_androidStorePassword=<password> \
ORG_GRADLE_PROJECT_androidKeyAlias=<alias> \
ORG_GRADLE_PROJECT_androidKeyPassword=<password> \
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
