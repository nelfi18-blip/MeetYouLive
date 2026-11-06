# PR #1139 — preparación de publicación, NO ejecutada

Se continúa únicamente `fix/android-sensitive-screen-capture`. Fuente de la
revisión: [preflight del PR](https://github.com/nelfi18-blip/MeetYouLive/pull/1139#issuecomment-6691893779).
No autoriza merge, deploy, publicación, APK/AAB, cambios de consolas ni producción.

## Compatibilidad implementada

Capacitor carga `server.url` remoto (`frontend/capacitor.config.ts`), por defecto
`https://www.meetyoulive.net`. Actualizar Vercel NO actualiza el plugin instalado.
No inferimos capacidades del user agent, correo, versionName o número de build.
Cada enable/disable devuelve `screenSecurityContract: 1`,
`verifiedOnUiThread: true`, `secure: boolean` solo después de aplicar y releer
FLAG_SECURE en el hilo UI. El frontend comprueba tipos y valor exactos.

| App instalada | Frontend | Resultado esperado y límite |
| --- | --- | --- |
| Sin ScreenSecurity / método ausente | Nuevo con contrato | Live y mini ocultos; solicitar actualización. |
| Plugin antiguo #893 (ACK anticipado/vacío) | Nuevo | ACK no aceptado; Live y mini ocultos; actualizar. |
| Plugin de 7b03932 (bit verificado, ACK vacío) | Nuevo | También incompatible: actualizar al plugin con contrato. |
| Plugin con contrato 1 | Nuevo | Revelar tras ACK verificado y dos frames; prueba física pendiente. |
| Plugin nuevo | Frontend anterior de #1139 | El objeto de respuesta es compatible con el antiguo await void; la verificación Java precede al ACK. Esto NO impone actualización a apps antiguas. |
| Cualquier app | Frontend de main anterior a la barrera | No garantiza la política para la flota antigua. Rollback inseguro para esta política. |

No se cachea en localStorage una capacidad ni se acepta un timeout como éxito.
A los 8 s sin respuesta se falla cerrado; una respuesta tardía no revela contenido.
Errores nativos conocidos permiten reintentar manteniendo Live oculto; respuesta
vacía/incompatible, plugin ausente o fallo desconocido requieren actualización.
El enlace HTTPS usa el paquete `com.meetyoulive.app`; no hay botón de bypass.
Si Play aún no ofrece la actualización, el usuario debe esperar/contactar soporte.
Cerrar la última superficie conserva la solicitud de disable incluso si el plugin
es viejo. Chats/llamadas conservan su hook y propietarios; esta barrera visual
exigida se aplica a Live, no certifica retroactivamente otras pantallas antiguas.

La barrera conserva montadas las referencias de vídeo: no cambia Agora ni deja
de conectar automáticamente una sesión oculta. PiP recibe la misma ventana/
WebView; el DOM Live sigue oculto sin contrato. La composición real de PiP,
audio y primer fotograma necesita prueba física y bloquea el lanzamiento.

## Evidencia y bloqueos previos a cualquier autorización

- Implementado: contrato Java, validación JS, alternativa ES/EN/PT y barrera sin
  bypass en sala/mini. Propietarios y cola existentes conservados.
- Probado en simulación: matriz de payloads/errores/timeout y ACK tardío; Java
  real contra dobles Android/Capacitor; React/Boundary/MiniPlayer reales en
  Chromium con puente simulado. La suite completa incluye chats, llamadas,
  política Live público/privado/VIP/pago, lifecycle, logout y contrato PiP.
- **Pendiente físico:** app vieja real + frontend nuevo debe ocultar sala y mini;
  app nueva + frontend nuevo; app nueva + frontend anterior en entorno aislado.
  Medir primer fotograma con grabación ya iniciada, screenshots, recientes,
  rotación, reanudación, PiP permitido/denegado/cerrado, audio/vídeo,
  cámara/micrófono, chat → llamada → Live, minimizar/restaurar/cerrar, logout.
  Si aparece un fotograma sin protección, detener lanzamiento. No hay evidencia
  física en este trabajo ni garantía universal de FLAG_SECURE.
- **Pendiente Play Console:** completar la tabla siguiente con evidencia autorizada.
- **Pendiente operativo:** confirmar configuración efectiva de Vercel y Render,
  proyectos/ramas/dominos, autoDeploy, responsables y recuperación segura. Los
  archivos del repositorio no prueban el estado actual de los dashboards.
- **Pendiente #1138:** revisión de integración posterior, sin modificar ese PR;
  preservar las exclusiones de `frontend/vercel.json` de ambas ramas.

## Datos que requieren comprobación en Play Console

| Dato | Estado / evidencia necesaria |
| --- | --- |
| Paquete | Código: `com.meetyoulive.app`; confirmar aplicación exacta en Console. |
| versionCode máximo ya usado | DESCONOCIDO. Revisar App Bundle Explorer y todas las pistas, incluidos borradores/internas/cerradas/producción. |
| versionCode publicado e instalado | DESCONOCIDO. Registrar pista, rollout, dispositivos y versionName/versionCode realmente instalado. |
| Próximo versionCode | NO asignado: debe superar todos los usados y permitir actualización; no deducirlo del run number ni del default local 2. |
| previous_version_code | Sustituir el default 1 del workflow por evidencia real al autorizar una futura compilación; no acredita la versión instalada. |
| Firma de distribución | SHA-256 del certificado **App signing** en Integridad de la app y continuidad/rotación de clave aplicable a dispositivos antiguos. |
| Clave de subida | SHA-256 del certificado **Upload**; verificar que el keystore de futura compilación corresponde. No imprimir ni copiar secretos. |
| APK instalado fuera de Play | Comparar certificado real con App signing/linaje. Una firma debug o solo Upload distinta no garantiza actualización sobre Play, ni viceversa. |
| Entrega | Países, cuenta opt-in, pista, porcentaje y elegibilidad del propietario. Un rollout gradual no garantiza recibir inmediatamente el cambio. |

versionCode/versionName no son la prueba de seguridad: incluso con numeración
alta se exige el contrato nativo. No se han consultado consolas ni firmas reales.

## Secuencia propuesta de publicación (requiere autorización posterior)

1. Mantener Draft, no merge/deploy/build. Cerrar evidencia física y datos anteriores,
   fijar SHA/artefactos de revisión y una versión de recuperación que conserve la
   barrera. Obtener autorización específica para cada operación de lanzamiento.
2. Antes de un merge futuro, confirmar y controlar autoDeploy en Vercel y Render:
   un merge a main puede publicar ambos. `frontend/vercel.json` desactiva esta
   rama, no main; `render.yaml` no prueba que autoDeploy esté desactivado.
   No asumir que el Draft evita previews/despliegues de otras integraciones.
3. Preparar, solo tras autorización separada, la app firmada con contrato 1 para
   pruebas aisladas y entrega por Google Play. Confirmar identidad de firma,
   versión instalada y aprobación/disponibilidad. No confundir subir/aprobar/
   publicar con instalación efectiva. Este trabajo no genera artefactos nativos.
4. Con la app compatible disponible y la matriz física aceptada, publicar mediante
   una operación autorizada el frontend con barrera en Vercel. Apps viejas quedarán
   bloqueadas hasta actualizar, incluso en rollout parcial. Registrar promoción,
   dominio, SHA y prueba sin caché en app vieja/nueva. Si la barrera debe publicarse
   antes de que Play ofrezca la app, aceptar explícitamente la indisponibilidad de
   Live para apps antiguas; nunca suavizar la comprobación para evitarla.
5. Render: no hay cambios backend en esta continuación; no requiere deploy
   coordinado ni migración. Si autoDeploy desde main lo redepliega, coordinarlo
   como operación independiente autorizada y comprobar salud/compatibilidad de
   la API sin tocar datos reales. Mantener backend conocido y compatible.
6. Vigilar errores de contrato/soporte sin datos personales, completar prueba
   controlada y avanzar rollout solo con evidencia. No conceder una excepción a
   la cuenta del propietario ni usar instalación por correo como verificación.

## Recuperación propuesta

- Ante fuga visual/PiP, detener rollout y aprobación; mantener Live oculto en
  Android mediante una corrección hacia delante o una versión **ya validada que
  conserve la barrera**. No existe aquí un kill switch remoto nuevo probado.
- **No promover el frontend main anterior ni 7b03932 como rollback de la flota:**
  carecen de negociación y pueden aceptar apps antiguas. Si no hay versión segura
  de recuperación previamente validada, es un bloqueo de lanzamiento, no permiso
  para quitar la barrera. Páginas ya abiertas/cachés viejas tampoco se actualizan
  retroactivamente: validar recarga/entrega y tratar sesiones antiguas como límite.
- Google Play: pausar rollout no desinstala ni revierte apps ya instaladas. Corregir
  con versionCode superior y misma firma/linaje compatible; conservar frontend
  cerrado para versiones sin contrato mientras se distribuye la corrección.
- Vercel: registrar previamente deployment seguro recuperable y revisar caché/
  dominio. Render: recuperar solo versión backend compatible si fuera necesario;
  el backend no soluciona un plugin viejo. No revertir datos ni ejecutar migraciones.
- Registrar decisión, SHA/versionCode/firmas/pista y evidencia de recuperación
  antes de pedir autorización final. No se ha ejecutado ninguno de estos pasos.
