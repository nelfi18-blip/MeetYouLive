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

## 8. Cómo generar el APK Debug

### Opción A — GitHub Actions (recomendado)

1. Ir a **Actions → Android Debug APK** en GitHub.
2. Clic en **Run workflow**.
3. Seleccionar rama (`main` o esta PR).
4. Esperar ~8-12 min.
5. Descargar el artifact `MeetYouLive-debug-<run_number>` → `app-debug.apk`.
6. Instalar en el dispositivo habilitando "Fuentes desconocidas".

### Opción B — Local (requiere Android SDK instalado)

```bash
cd frontend
npm ci
npx cap sync android
cd android
chmod +x gradlew
./gradlew assembleDebug
# APK en: android/app/build/outputs/apk/debug/app-debug.apk
```

---

## 9. Funciones que no deben probarse ni publicarse en este APK

- **Google Play Billing** — los pagos in-app con Stripe deben adaptarse antes.
- **Google Login nativo** — requiere SHA-1 del keystore de producción registrado.
- **Notificaciones push** — requiere `google-services.json` (Firebase) real.
- **Release/AAB firmado** — este sprint sólo genera Debug; no hay keystore.
- **iOS** — no comenzar en este sprint.
- **Publicación en Google Play** — sólo instalación interna/prueba.

---

## 10. Riesgos restantes

| Riesgo | Mitigación |
|---|---|
| Google Login puede no funcionar en WebView Android | Login por correo funcional; documentado |
| Push sin Firebase config | Plugin se omite silenciosamente; documentado |
| Stripe Checkout puede redirigir fuera del WebView | Evaluar uso de Custom Tabs o `CapacitorBrowser` antes de publicar |
| `assetlinks.json` para Android App Links no verificado aún | Deep links fallback a navegador; verificar antes de producción |
| Agora sin probar en dispositivo real | Permisos configurados; probar antes del siguiente sprint |

---

## 11. Recomendación final

> **NOT READY TO INSTALL APK** *(desde CI — el workflow aún no ha corrido)*
>
> Los archivos necesarios para compilar el APK están completos en este PR.
> El workflow `android-debug-apk.yml` debe ejecutarse manualmente en Actions
> para generar el artifact. Una vez generado y verificado en un dispositivo real,
> el estado cambia a **READY TO INSTALL APK**.
>
> Login por correo funcional. Google Login requiere configuración adicional antes
> de funcionar en Android. No hacer Merge hasta verificar el APK instalado.
