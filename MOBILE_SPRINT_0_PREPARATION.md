# MeetYouLive — Sprint 0 Mobile Preparation

## Estado general

MeetYouLive queda preparado como shell nativo Capacitor para Android e iOS, reutilizando la aplicación web de producción sin cambiar lógica de negocio.

- Estrategia móvil: Capacitor.
- App ID / Package ID / Bundle ID: `com.meetyoulive.app`.
- Nombre oficial: `MeetYouLive`.
- Web cargada por Capacitor: `NEXT_PUBLIC_APP_URL` o, si no existe durante `npx cap sync`, `https://meetyoulive.net`.
- El fallback a producción es intencional en Sprint 0 para que los shells nativos locales sean determinísticos.
- La build web de producción sigue usando Next.js normal; no se fuerza export estático.

## Arquitectura creada

### Frontend

- `frontend/capacitor.config.ts` define la app nativa, splash, push, URL de producción y configuración base Android/iOS.
- `frontend/public/manifest.json` y `frontend/public/site.webmanifest` mantienen la configuración PWA existente.
- `frontend/public/sw.js` y `frontend/public/firebase-messaging-sw.js` permanecen como service workers web/PWA.
- `frontend/app/` continúa usando Next.js App Router.

### Android

- Proyecto Android Capacitor: `frontend/android/`.
- Package ID: `com.meetyoulive.app`.
- Gradle listo para:
  - APK debug: `npm run android:debug`
  - APK release: `npm run android:release`
  - AAB Google Play: `npm run android:aab`
- Permisos preparados:
  - Internet / estado de red.
  - Cámara.
  - Micrófono / ajustes de audio.
  - Galería e imágenes según versión Android.
  - Push notifications.
  - Wake lock para estabilidad durante uso activo.
- Deep links preparados:
  - `https://meetyoulive.net`
  - `com.meetyoulive.app://`
- Iconos adaptativos y splash se mantienen en `frontend/android/app/src/main/res/`.

### iOS

- Proyecto Xcode Capacitor: `frontend/ios/App/`.
- Bundle ID preparado: `com.meetyoulive.app`.
- Proyecto Xcode listo para abrir con `npm run ios:open`.
- Pods preparados por `npx cap sync`; en macOS debe ejecutarse `pod install` si CocoaPods está disponible.
- Permisos preparados:
  - Cámara.
  - Micrófono.
  - Galería.
  - Guardar en galería.
  - Push notifications / background remote notification.
- Deep links preparados:
  - Associated Domain: `applinks:meetyoulive.net`.
  - URL schemes: `com.meetyoulive.app` y `meetyoulive`.
- Splash e iconos se mantienen en `frontend/ios/App/App/Assets.xcassets/`.

## Capacitor plugins preparados

- `@capacitor/app`
- `@capacitor/camera`
- `@capacitor/device`
- `@capacitor/push-notifications`
- `@capacitor/share`
- `@capacitor/splash-screen`

No se implementó lógica nativa nueva en Sprint 0.

## Compatibilidad revisada

- Google Login / NextAuth / JWT: sin cambios de comportamiento; se mantiene la app web de producción dentro del WebView.
- Socket.io: sin cambios; continúa usando la configuración web existente.
- Agora: sin cambios; permisos nativos de cámara y micrófono quedan preparados.
- Firebase / Push: web service worker existente se mantiene; plugin nativo queda sincronizado para Sprint 1.
- Stripe: sin cambios de flujo ni monetización.
- Upload de imágenes: sin cambios; permisos de cámara/galería quedan preparados.

## Bloqueantes restantes

- iOS requiere macOS, Xcode y CocoaPods para completar `pod install` y generar builds locales.
- Android release/AAB requiere keystore y configuración de firma antes de publicar.
- Push nativo requiere `google-services.json` en Android y capacidades/certificados de Apple en iOS.
- Universal links/App Links requieren publicar `apple-app-site-association` y `assetlinks.json` en `meetyoulive.net`.
- No se configuraron certificados, Play Console ni App Store Connect.

## Pasos sugeridos para Sprint 1

1. Ejecutar builds nativas en máquinas con Android Studio y Xcode.
2. Configurar credenciales de firma debug/release sin commit de secretos.
3. Implementar handlers nativos de deep links.
4. Conectar push notifications nativas con Firebase/APNs.
5. Probar cámara, micrófono, galería, compartir y uploads en dispositivos reales.
6. Validar Google Login y Stripe en WebView nativo.

## Estado de entrega

NOT READY FOR MERGE hasta completar las validaciones automáticas del PR y confirmar builds nativas en entornos Android Studio/Xcode.
