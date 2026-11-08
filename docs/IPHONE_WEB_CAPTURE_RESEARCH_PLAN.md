# Plan independiente — privacidad Live en iPhone/iPad y web

Investigación de solo lectura, 2026-11-06. **No implementado ni autorizado para implementar.** No modifica Apple, iOS, producción, Agora, pagos ni World. No se conoce ni se infiere el código de Tango o Plamfy; son una referencia de intención de privacidad, no evidencia técnica.

## Qué ofrece cada plataforma

| Plataforma/mecanismo | Capacidad real | Límite |
| --- | --- | --- |
| Android FLAG_SECURE | Solicitar exclusión de capturas y pantallas no seguras; verificación del bit nativo en PR #1139 | No garantiza todos los equipos, composición de media o métodos de grabación; pendiente dispositivo |
| iOS/iPadOS sceneCaptureState | Detectar captura de escena y reaccionar con contenido oculto | Señal reactiva; no distingue necesariamente grabación, mirroring o control remoto; no es un veto universal |
| iOS userDidTakeScreenshotNotification | Notificación posterior de captura fija | No puede recuperar ni impedir la captura que ya ocurrió |
| FairPlay Streaming | Protección de video compatible con su cadena DRM | No es un flag aplicable a cualquier WebView/Agora WebRTC; audio exige medidas adicionales |
| Web Screen Capture API | Controlar las solicitudes getDisplayMedia iniciadas por el propio documento | No gobierna grabadores del sistema, extensiones, otro documento autorizado o cámaras externas |
| Marcas de agua | Disuasión y posible trazabilidad | No evitan copiar; un overlay cliente puede retirarse o recortarse |

Apple describe la observación de `UITraitCollection.sceneCaptureState`/`UITraitSceneCaptureState` y `isSceneCaptured` de SwiftUI, aplicando también el estado inicial. En dispositivos antiguos habría que evaluar `UIScreen.isCaptured` y `capturedDidChangeNotification`, hoy deprecados frente a la API por escena. La disponibilidad exacta se verificará contra el SDK y el deployment target del proyecto antes de escribir código; no se fija aquí una versión mínima sin esa validación. Fuente: [guía oficial Apple](https://developer.apple.com/documentation/swiftui/protecting-sensitive-content-when-screen-sharing) y [UIScreen.isCaptured](https://developer.apple.com/documentation/uikit/uiscreen/iscaptured).

La notificación de screenshot llega después: no debe usarse como promesa de bloqueo previo ni como prueba infalible de infracción. Fuente: [UIApplication.userDidTakeScreenshotNotification](https://developer.apple.com/documentation/uikit/uiapplication/userdidtakescreenshotnotification).

FairPlay oculta video protegido en los mecanismos de captura compatibles; el audio requiere una respuesta adicional. Adaptarlo a Live necesitaría otra evaluación de transporte, claves/licencias, costes y latencia; no se propone migrar Agora en esta fase. Fuente: [QA1970 de Apple](https://developer.apple.com/library/archive/qa/qa1970/).

`Permissions-Policy: display-capture=()` limita la capacidad del documento de invocar getDisplayMedia; no impide que otro programa capture la pantalla. Cualquier cambio deberá preservar las funcionalidades legítimas de llamadas/compartición de pantalla. La especificación sigue siendo un trabajo en curso: [W3C Screen Capture](https://www.w3.org/TR/screen-capture/#permissions-policy-integration).

## Revisión del código de MeetYouLive — alcance y límites

Revisión estática del mismo checkout de #1139, sin endpoints de producción ni datos reales:

- `backend/src/routes/live.routes.js` y `controllers/live.controller.js`: metadatos y entrada tienen controles de sesión/acceso privado, VIP y participantes; hay flujos de moderación. Esta investigación no modifica ni prueba cobros.
- `backend/src/routes/agora.routes.js` y `controllers/agora.controller.js`: ruta autenticada y limitada por IP, roles de publicación según anfitrión/invitado, ban y expiración de token. La coherencia con todos los derechos de acceso debe validarse en una auditoría independiente antes de certificar protección frente a redistribución. No se afirma que el token demuestre todas las autorizaciones de Live.
- `backend/src/lib/socket.js`: presencia/chat con identidad, controles de ban/expulsión y acceso privado. Presencia autorizada no sustituye autorización de media.
- La búsqueda dirigida en rutas/controladores de Live/Agora y código Live de cliente no encontró un flujo de grabación Cloud Recording/MediaRecorder/captureStream o marca de agua implementada. Esto no demuestra que una consola del proveedor, otro servicio externo o un cliente ajeno no pueda grabar; no se inspeccionaron consolas, credenciales o recursos externos.
- `frontend/lib/screenCaptureProtection.js` aplica solo Android. El componente de ocultación Live conserva el DOM y los recursos; **ocultar el video no pausa el audio ni revoca acceso a media**. iPhone necesita una política de reproducción propia, aún no implementada.
- No se comprobó la política de headers efectiva de CDN/producción. No se modificaron headers ni configuración del proveedor.

## Propuesta iPhone/iPad — requiere autorización posterior

1. Confirmar SDK/deployment target y ciclo de vida por escena. Crear un bridge Capacitor mínimo, solo después de autorización, que lea el estado inicial y observe cambios por cada escena/ventana relevante. Registrar y retirar observadores con ciclo de vida; estados desconocidos fallan ocultando las superficies Live.
2. Usar un velo **nativo opaco** sobre contenido Live y mini reproductor antes de exponerlo al WebView durante captura activa. El evento JS informa a la interfaz, pero no debe ser la primera o única barrera. Cubrir reanudación y snapshots de recientes antes de background; no inferir que una señal de foreground por sí sola equivale a captura.
3. Separar anfitrión y espectador. Ocultar UI no debe terminar ni despublicar la transmisión del anfitrión. Para el espectador, proponer suspensión de reproducción y audio mientras la captura sea detectable; la integración con playback existente y PiP necesita aprobación específica y pruebas de regresión. No cambiar micrófono/publicación ni facturación automáticamente.
4. Reanudar solo tras comprobar que la escena ya no está capturada y que conserva acceso. Soportar multiventana, AirPlay, duplicación, grabación iniciada antes de entrar, cambios de ruta y mini reproductor. No ofrecer un canal PiP que eluda el velo; si no puede protegerse, proponer ocultar/deshabilitar PiP únicamente durante captura, sujeto a autorización.
5. No usar hacks de secure-text-field, reparentado privado de capas ni APIs no documentadas. No prometer bloquear screenshots arbitrarios de contenido normal. Una notificación tardía puede informar al usuario; no sancionar automáticamente ni enviar contenido/identidad de captura a moderación sin una política expresa.
6. Matriz física posterior: iPhone e iPad soportados, grabación del sistema, AirPlay, grabación por cable/QuickTime donde proceda, screenshots, multiventana, recientes, PiP, accesibilidad, anfitrión/espectador/invitado, chats/llamadas, audio y continuidad. Medir fotogramas expuestos y tiempos; documentar limitaciones por sistema, no solo un booleano JS.

## Propuesta web — requiere autorización posterior

1. Prioridad: autorización de media homogénea en servidor para metadatos, entrada, emisión/renovación de token, presencia y reingreso. Separar autorización de ver y publicar; revisar revocación, expiración y moderación. No confiar en un paywall o bandera del cliente para proteger el stream. No modificar pagos como parte de una medida de captura.
2. Definir política de no redistribución y proceso humano de reportes/takedown. No declarar que una señal de captura prueba abuso, ni introducir vigilancia automática o sanciones silenciosas.
3. Proponer watermark visible dinámico que cubra video y mini reproductor: identificador opaco de sesión + tiempo, sin correo, teléfono ni nombre real. Resolver el identificador solo en backend con acceso limitado y retención definida. Decidir por separado superposición cliente (disuasión removible) o composición en media (más coste/latencia e integración, nunca darla por disponible).
4. Evaluar CSP/frame-ancestors y Permissions-Policy con una matriz de embeds, moderación y llamadas. Ayudan a controlar uso de la app/embeds; no son anti-screenshot ni revocan datos ya entregados. No bloquear teclas, menú contextual, blur o DevTools como supuesto sistema de seguridad.
5. Revisar grabación del proveedor y cualquier futura grabación propia con consentimiento, roles, retención y auditoría. No activar Cloud Recording ni asumirlo desactivado sin revisar la consola mediante autorización separada.
6. DRM/EME sería una investigación de otra cadena de distribución y licencias; no convierte automáticamente Agora WebRTC en media anticopia. Cualquier cambio de arquitectura o gasto exige revisión y autorización.
7. Validar Chrome/Edge/Firefox/Safari y móvil, fullscreen/PiP, captura de pestaña/ventana/pantalla por otro programa, overlays retirados, perfiles de red y accesibilidad. El resultado honesto de web será disuasión/control de acceso, no prevención universal de grabaciones.

## Puertas antes de implementar

- Autorización específica para código Apple/iPhone y, por separado, para web/headers/agua.
- Cerrar la revisión de coherencia de derechos de acceso y grabación; el detalle de hallazgos estáticos se entrega al propietario de forma separada, no se prueba contra producción.
- Elegir política anfitrión/espectador/audio/PiP y posibles costes sin contratar recursos.
- Prototipo aislado y evidencia física/real de navegador; luego un PR Draft independiente por problema, únicamente cuando se autorice. No se crea ninguno en esta sesión.
- Ninguna plataforma impide fotografías desde otro dispositivo. No se promete equivalencia técnica con productos cuyo código no conocemos.
