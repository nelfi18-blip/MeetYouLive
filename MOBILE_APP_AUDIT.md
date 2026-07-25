# MeetYouLive — Auditoría para aplicación móvil Android e iOS

## Alcance

Esta auditoría evalúa la estrategia para convertir MeetYouLive en aplicación móvil para Google Play Store y Apple App Store sin reescribir el producto actual ni modificar la lógica de negocio existente.

La evaluación se basa en la estructura actual del repositorio:

- Frontend Next.js App Router en `frontend/app`.
- Capacitor ya agregado en `frontend/package.json` y `frontend/capacitor.config.ts`.
- PWA existente en `frontend/public/manifest.json` y `frontend/public/sw.js`.
- Backend Express con rutas de auth, pagos, coins, gifts, Agora, push, chat, lives y withdrawals registradas en `backend/src/app.js`.

## Veredicto ejecutivo

**NOT READY TO START MOBILE APP**

MeetYouLive está cerca de poder iniciar un prototipo móvil con Capacitor, pero todavía no está listo para iniciar una app publicable en Google Play y Apple App Store. Antes de comenzar el desarrollo móvil de producción deben resolverse los bloqueantes de pagos móviles, Apple Sign In, almacenamiento seguro, push nativo, deep links y validación de Agora en dispositivos reales.

## 1. Tecnología móvil recomendada

La tecnología recomendada es **Capacitor reutilizando la aplicación Next.js actual**, pero como app híbrida controlada, no como simple WebView de la web.

El proyecto ya tiene base técnica para esta ruta:

- `@capacitor/core`
- `@capacitor/android`
- `@capacitor/ios`
- `@capacitor/push-notifications`
- `frontend/capacitor.config.ts`
- scripts `build:mobile`, `cap:sync`, `cap:android`, `cap:ios`

Antes de publicar en stores deben resolverse:

- Pagos nativos con Play Billing y Apple In-App Purchase.
- Google Login nativo.
- Apple Sign In.
- Almacenamiento seguro de sesión.
- Push nativo Android/iOS.
- Permisos de cámara, micrófono y galería.
- Deep links y universal links.
- Validación de Agora en Android WebView e iOS WKWebView.

## 2. Justificación

Capacitor permite reutilizar la mayor parte del frontend actual y mantener el backend Express/Mongo/Socket/Agora. Es la ruta más rápida y menos riesgosa para una primera versión móvil siempre que se agreguen integraciones nativas donde las tiendas lo exigen.

Reutilización estimada:

| Área | Reutilización estimada |
|---|---:|
| Backend | 85–95% |
| Frontend UI web | 65–80% |
| Lógica de negocio | 80–90% |
| Auth, push, pagos y permisos | Requieren adaptación móvil |
| Store compliance | Requiere trabajo importante |

## 3. Segunda alternativa

La segunda alternativa recomendada es **React Native / Expo**.

Ventajas:

- Mejor experiencia móvil nativa.
- Mayor control sobre cámara, micrófono, push, deep links y secure storage.
- Mejor base si la app móvil será el producto principal a largo plazo.

Desventajas:

- Reescritura grande del frontend.
- Baja reutilización de UI.
- Mayor costo inicial.
- Requiere recrear pantallas, navegación, estados, i18n y componentes.

## 4. Comparación de opciones

| Opción | Reutilización | Next.js App Router | Auth Google | Apple Sign In | Stripe/IAP | Agora | Push | Riesgo |
|---|---:|---|---|---|---|---|---|---|
| Capacitor + Next.js actual | Alta | Parcial. Mejor con web remota o export limitado | Requiere OAuth nativo/plugin | Falta implementar | Bloqueante por IAP | Compatible, pero requiere pruebas WebView | Requiere FCM/APNs nativo | Medio |
| React Native / Expo | Media-baja | No reutiliza App Router | Nativo/Expo AuthSession | Implementable | Requiere IAP | SDK nativo o wrappers | FCM/APNs sólido | Medio-alto |
| Aplicación nativa separada | Baja | No aplica | Nativo completo | Nativo completo | IAP completo | SDK nativo completo | Nativo completo | Alto costo |
| PWA intermedia | Alta | Sí | Web actual | Limitado | Stripe web posible | WebRTC/Agora web | Limitado, sobre todo iOS | No sirve como app store completa |

## 5. Auditoría por función

Leyenda:

- **OK**: compatible sin cambios relevantes.
- **ADAPT**: requiere adaptación.
- **NATIVO**: requiere implementación nativa o plugin.
- **B-Android**: bloqueante para Android.
- **B-iOS**: bloqueante para iOS.

| Función | Capacitor | Expo/RN | Nativa | PWA |
|---|---|---|---|---|
| Registro | OK/ADAPT | ADAPT | ADAPT | OK |
| Login con correo | ADAPT: guardar JWT seguro | ADAPT | ADAPT | OK |
| Google Login | NATIVO | NATIVO | NATIVO | OK web |
| Apple Sign In | NATIVO / falta | NATIVO | NATIVO | B-iOS si no existe |
| Verificación de correo | OK | ADAPT | ADAPT | OK |
| Onboarding | ADAPT por cámara/galería | ADAPT | ADAPT | OK/ADAPT |
| Perfil | OK/ADAPT | ADAPT | ADAPT | OK |
| Subida de fotos | NATIVO recomendado | NATIVO | NATIVO | OK limitado |
| Feed | OK/ADAPT rendimiento | ADAPT | ADAPT | OK |
| Match | OK | ADAPT | ADAPT | OK |
| Chat | ADAPT Socket/background | ADAPT | ADAPT | OK foreground |
| Videollamadas | ADAPT/NATIVO por permisos | NATIVO | NATIVO | ADAPT |
| Lives | ADAPT/NATIVO por cámara/mic | NATIVO | NATIVO | ADAPT |
| Coins | B-Android/B-iOS si usa Stripe | B-Android/B-iOS | B-Android/B-iOS | OK web |
| Regalos | B-Android/B-iOS si coins compradas con Stripe | B-Android/B-iOS | B-Android/B-iOS | OK web |
| Contenido exclusivo | B-iOS/B-Android si desbloqueo digital externo | B-iOS/B-Android | B-iOS/B-Android | OK web |
| Creator Center | ADAPT | ADAPT | ADAPT | OK |
| Retiros | OK/ADAPT si son payouts a creadores | ADAPT | ADAPT | OK |
| Reportes | OK | ADAPT | ADAPT | OK |
| Bloqueos | OK | ADAPT | ADAPT | OK |
| Eliminación de cuenta | ADAPT: debe estar visible y clara | ADAPT | ADAPT | ADAPT |
| Notificaciones | NATIVO | NATIVO | NATIVO | Limitado |
| Idiomas ES/EN/PT | OK si mensajes están sincronizados | ADAPT | ADAPT | OK |

## 6. Riesgos de Stripe frente a Play Billing y Apple IAP

Este es el mayor bloqueante de la estrategia móvil.

MeetYouLive monetiza o puede monetizar:

- Coins.
- Gifts.
- Contenido exclusivo.
- Videollamadas privadas pagadas.
- Posibles subscripciones/VIP.
- Monetización de creadores.

En apps móviles, Google Play y Apple normalmente exigen **Play Billing** y **Apple In-App Purchase** para bienes o servicios digitales consumidos dentro de la app.

Riesgos principales:

- Rechazo por usar Stripe para comprar coins dentro de la app.
- Rechazo por redirigir a checkout externo para contenido digital.
- Rechazo por mostrar enlaces, botones o instrucciones para pagar fuera de la app.
- Rechazo si coins compradas fuera de la app se usan para gifts o contenido digital dentro de la app.
- Mayor revisión en iOS para bienes digitales, creator content y unlocks.

Estrategia requerida:

- Mantener Stripe para web.
- Implementar Play Billing para Android.
- Implementar Apple IAP para iOS.
- Registrar el proveedor de compra en backend: `stripe`, `google_play`, `apple_iap`.
- Validar receipts/tokens server-side.
- Ajustar precios, paquetes de coins y reconciliación.
- Ocultar Stripe checkout dentro de builds móviles distribuidas por stores.

## 7. Estrategia de autenticación

Estado actual:

- Email/password con JWT backend.
- Google vía NextAuth web y backend Google OAuth.
- Backend token con expiración de 30 días.
- No se observó Apple Sign In implementado.

Estrategia móvil:

- Login con email: usar el backend actual y guardar JWT en almacenamiento seguro.
- Google Login: usar OAuth nativo con redirect/deep link hacia la app.
- Apple Sign In: implementar para iOS si Google Login está disponible.
- No depender solo de cookies web o NextAuth dentro de WebView.
- Usar almacenamiento seguro:
  - iOS Keychain.
  - Android Encrypted SharedPreferences / Keystore.
- Definir refresh o re-auth strategy si se requieren sesiones largas.

## 8. Estrategia de Agora

Estado actual:

- Agora Web SDK en frontend.
- Tokens desde backend `/api/agora`.
- Calls y lives usan canales y tokens.

Para Capacitor:

- Probar Agora Web SDK dentro de Android WebView y iOS WKWebView.
- Declarar permisos de cámara y micrófono.
- Validar audio routing, background, reconexión y cambio entre cámara frontal/trasera.
- Si hay problemas de estabilidad, usar plugin nativo o migrar pantallas live/call a nativo.

Para Expo/RN o nativo:

- Usar SDK nativo de Agora.
- Reutilizar backend de tokens y reglas.
- Rehacer UI de llamadas y lives.

## 9. Estrategia de Push

Estado actual:

- Backend con rutas `/api/push`.
- Firebase Admin en backend.
- Capacitor PushNotifications en dependencias.
- PWA con service worker, pero push iOS PWA no equivale a app nativa.

Estrategia móvil:

- Android: FCM.
- iOS: APNs vía Firebase Cloud Messaging.
- Registrar device token por usuario.
- Guardar plataforma: `android`, `ios`, `web`.
- Revocar tokens al logout.
- Abrir deep links al tocar notificaciones:
  - chat.
  - live.
  - match.
  - profile.
  - call.
  - notification detail.

## 10. Permisos necesarios

Android:

- Internet.
- Camera.
- Record audio.
- Post notifications.
- Read media images/video según versión Android.
- Foreground service/media projection solo si se requiere background/live avanzado.
- Vibration opcional.

iOS:

- `NSCameraUsageDescription`.
- `NSMicrophoneUsageDescription`.
- `NSPhotoLibraryUsageDescription`.
- `NSPhotoLibraryAddUsageDescription` si se guarda contenido.
- Push Notifications capability.
- Associated Domains.
- Sign in with Apple capability.
- Background Modes solo si realmente se justifica.

## 11. Deep links y dominios

Requerido:

- Android App Links para `https://meetyoulive.net`.
- iOS Universal Links para `https://meetyoulive.net`.
- `/.well-known/assetlinks.json`.
- `/.well-known/apple-app-site-association`.
- Esquema interno opcional: `meetyoulive://`.

Rutas críticas:

- `/auth/success`
- `/verify-email`
- `/reset-password`
- `/profile/:id`
- `/chats/:id`
- `/live/:id`
- `/call/:id`
- `/notifications`
- `/payment/success`, solo para web/Stripe y no para IAP dentro de apps store.

## 12. Requisitos de Google Play

Antes de publicar:

- Play Billing para bienes digitales.
- Data Safety Form.
- Privacy Policy pública.
- Eliminación de cuenta visible desde app y web.
- Permisos justificados.
- Target SDK actualizado.
- Política de contenido generado por usuarios:
  - reportar.
  - bloquear.
  - moderación.
  - eliminación.
- Pruebas cerradas si aplica a la cuenta de desarrollador.
- Screenshots, iconos y feature graphic.
- Declaración de acceso a cámara/micrófono.
- No usar Stripe para bienes digitales dentro de app.

## 13. Requisitos de App Store

Antes de publicar:

- Apple IAP para bienes digitales.
- Sign in with Apple si Google Login está disponible.
- App Privacy Nutrition Labels.
- Privacy Policy.
- Eliminación de cuenta in-app.
- Moderación UGC clara.
- Report/block visibles.
- No enlaces a pagos externos para bienes digitales.
- Permisos con textos claros.
- Universal Links.
- App Review demo account.
- No publicar una app que sea solo WebView sin valor nativo suficiente.

## 14. Assets requeridos

- Iconos Android adaptativos.
- Iconos iOS en todos los tamaños.
- Splash screens.
- Screenshots:
  - Android phone.
  - Android tablet si aplica.
  - iPhone 6.7".
  - iPhone 6.5"/5.5" según requisitos vigentes.
  - iPad si se soporta.
- Feature graphic Google Play.
- App preview opcional.
- Textos store ES/EN/PT.
- Privacy policy URL.
- Support URL.
- Marketing URL opcional.
- Demo account para revisión.

## 15. Posibles causas de rechazo

1. Stripe usado para coins/gifts/contenido digital dentro de app.
2. Falta Apple Sign In junto a Google Login.
3. App percibida como WebView sin funcionalidad nativa.
4. Falta eliminación de cuenta clara.
5. Falta moderación UGC suficiente.
6. Cámara/micrófono sin explicación adecuada.
7. Lives o contenido de creadores sin controles de reporte/bloqueo.
8. Deep links rotos en auth, pagos o notificaciones.
9. Push sin consentimiento correcto.
10. Contenido adulto/sugerente no clasificado correctamente.
11. Permitir desbloqueos digitales comprados externamente.
12. Inestabilidad de Agora en iOS WebView.

## 16. Plan por sprints

### Sprint 0 — Bloqueantes y decisión

- Definir política de monetización móvil.
- Decidir IAP/Play Billing vs limitar compras en app.
- Definir si Capacitor usará web remota o bundle estático.
- Revisar legal, privacidad, UGC y eliminación de cuenta.

### Sprint 1 — Base móvil Capacitor

- Configurar proyectos Android/iOS.
- Preparar app icons y splash.
- Declarar permisos.
- Configurar deep links.
- Agregar secure storage.
- Generar build interno.

### Sprint 2 — Auth móvil

- Email JWT con secure storage.
- Google nativo.
- Apple Sign In.
- Session refresh/logout.
- Deep links de verificación y reset.

### Sprint 3 — Push

- FCM Android.
- APNs/iOS vía Firebase.
- Registro de device tokens.
- Routing de notificaciones.
- Preferencias push.

### Sprint 4 — Media y Agora

- Cámara/micrófono.
- Galería.
- Calls.
- Lives.
- Reconexión.
- Pruebas iOS reales.

### Sprint 5 — Monetización móvil

- Play Billing.
- Apple IAP.
- Validación server-side.
- Ledger de coins por proveedor.
- Ocultar Stripe en apps.

### Sprint 6 — Compliance store

- Account deletion.
- Report/block/moderation review.
- Privacy labels.
- Data safety.
- Demo account.
- Store assets.

### Sprint 7 — QA y release

- TestFlight.
- Play internal/closed testing.
- Crash logs.
- Performance.
- Revisión final de políticas.

## 17. Complejidad estimada

| Ruta | Complejidad |
|---|---|
| Capacitor MVP sin compras móviles | Media |
| Capacitor listo para App Store/Play con IAP, push, auth nativa y Agora estable | Media-alta |
| Expo/RN completo | Alta |
| Nativo separado Android+iOS | Muy alta |
| PWA intermedia | Baja-media, pero no reemplaza apps store completas |

## 18. Bloqueantes antes de comenzar

1. Definir monetización móvil con IAP/Play Billing.
2. Implementar Apple Sign In.
3. Definir secure storage para JWT.
4. Definir estrategia para Google Login nativo.
5. Implementar deep links/universal links.
6. Validar Agora en WebView iOS/Android.
7. Implementar push nativo completo.
8. Preparar textos de permisos.
9. Confirmar eliminación de cuenta in-app.
10. Confirmar cumplimiento UGC: reportes, bloqueos y moderación.
11. Preparar assets store.
12. Decidir si app será WebView remota o paquete estático; App Router y NextAuth API no son totalmente compatibles con export estático sin cuidado.

## Resultado final

**NOT READY TO START MOBILE APP**

El camino recomendado es iniciar con una fase de preparación móvil sobre Capacitor, resolver los bloqueantes de store compliance y monetización, y solo después pasar a implementación de app móvil publicable.
