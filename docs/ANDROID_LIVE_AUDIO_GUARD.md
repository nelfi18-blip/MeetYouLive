# PR #1139 — audio Live y compatibilidad con 1.0.57

## Alcance y compatibilidad

Esta corrección continúa desde el commit nativo firmado `f961eea71472a19ef5d219bf02acf46e16968872`. Según el propietario, corresponde al AAB Android **1.0.57**, ya enviado a revisión de Google Play. Ese sigue siendo el SHA del binario; el SHA nuevo del frontend se informa en el PR. No se vuelve a compilar, firmar, generar ni publicar una app.

No cambian `frontend/android`, manifiesto/permisos, firma, Gradle, `frontend/ios`, Capacitor, `www`, dependencias ni workflows. Se conserva **https://www.meetyoulive.net**. No se añade ningún método/contrato nativo: el frontend sigue exigiendo contrato 1, `verifiedOnUiThread:true` y el valor `secure` esperado. ACK antiguo/vacío, plugin ausente, error o timeout conservan fallo cerrado. No se modifica autenticación, backend, pagos, World, #1138 ni implementación de Agora.

## Problema y corrección mínima de reproducción

La barrera visual montaba siempre `LiveRoomContent`; ocultar DOM no impide iniciar audio. Ahora la página solo monta ese componente cuando `capture.ready` es verdadero. Durante carga, rechazo, timeout o aviso de actualización no se inicializa esa sala ni su reproducción. El cuerpo completo de `LiveRoomContent`, incluidas sus operaciones de Agora, es idéntico al de `f961eea`; se cambia solo la condición de montaje exterior.

Una ventana ya confirmada y con propietarios activos puede reutilizarse al minimizar/restaurar o pasar entre pantallas protegidas. El controlador expone ese estado, invalida la confirmación mientras hay una operación nativa pendiente y no lo considera vigente si no quedan propietarios. Así una sesión autorizada no vuelve a esperar artificialmente el guard ni desmonta media por ese motivo durante el traspaso sala/mini. No se interpreta un ACK tardío/incompatible como autorización.

En Android nativo, para sesiones suspendidas, el mini aplica volumen cero a **todas** las pistas de audio remotas mientras `capture.ready` sea falso o la ruta oculte el Live. No depende de que el cuadro mini ya sea visible: cubre también espera de restauración. Conserva la elección de mute del espectador cuando la protección está lista. Sin confirmación no puede reactivar volumen por pulsar mute/unmute. Al confirmarse, restaura el volumen permitido, sin dejar ni volver a entrar al canal.

Web/iOS conservan el comportamiento previo de mute y no activan esta política Android.

La sincronización escucha eventos de publicación/reconexión únicamente para ajustar reproducción local de pistas remotas; no suscribe, publica, renueva tokens, cierra sesiones ni toca pistas locales. El micrófono y la transmisión de anfitrión/invitado no se silencian. Los listeners propios se retiran al cambiar de sesión/estado; su limpieza no restaura volumen por sí sola. Si una pista rechaza ajustar volumen, intenta detener solo su playout local; un fallo de la API/recuperación de pista debe comprobarse en dispositivo.

## Pruebas realmente ejecutadas

- 23 pruebas nuevas de reproducción/controlador: carga/error/timeout/actualización con roles viewer/host/guest; todas las pistas remotas; mute/restauración; reemplazo de pista/reconexión; limpieza sin interferir otros listeners; fallback local; reutilización de confirmación y operación disable pendiente; contrato antiguo/ausente/timeout nunca reutilizable; integración de montaje de la página.
- Suite completa local: **801 aprobadas, cero omitidas**, ESLint sin advertencias. Build y CI del SHA final se enlazan en el PR.
- Harness Chromium con React/guard/LiveSessionProvider/MiniPlayer reales, puente y cliente remotos simulados. La fixture genera PCM sintético con `HTMLAudioElement`: se registran `paused`, `volume`, `audible` y llamadas play/stop. No son personas ni media Agora.
- Se verifica cero montajes de media antes del ACK; reproducción posterior; continuidad sala → mini → restauración sin stop ni nueva operación nativa; mute/unmute; roles host/guest/viewer; sesión suspendida oculta y esperando restauración; error, ACK antiguo, plugin ausente y timeout; pista reemplazada; retry y limpieza en login; web/iOS sin operaciones del puente ni bloqueo Android.
- El artefacto `screen-capture-lifecycle-evidence/results.json` incluye `audio.observations` con esos estados. Solo prueba el contrato de reproducción y el flujo de interfaz; no mide un altavoz, grabación del sistema o codec/red de Agora.
- Comparación contra `f961eea`: rutas nativas/configuración/workflows/SDK/session store/context sin diff; cuerpo `LiveRoomContent` idéntico. No es una auditoría de firma/Play Console ni una reconstrucción del AAB.

Reproducción aislada:

```sh
cd frontend
node --test tests/live-playback-volume.test.mjs
node --test --test-concurrency=1 tests/*.test.mjs
npm run lint
npm run build
node scripts/screen-capture-browser-check.mjs
```

El harness usa las herramientas temporales indicadas en la guía existente. La suite Java requiere JDK 21 (CI ya lo configura); en el entorno local se usa el compilador ECJ previamente disponible mediante CAPTURE_JAVA_COMPILER_JAR. Para build local se usa copia limpia sin .env con URL de API sintética. No se cambian workflows para ejecutar estas pruebas.

## Riesgos y aceptación pendientes

- Probar el AAB exacto 1.0.57 en Android físico con frontend aislado autorizado: sonido antes/durante fallo/timeout/aviso de actualización, pistas ya suspendidas, invitados, dos participantes remotos, mute, reconexión, PiP, rotación, recientes y cambios rápidos. Confirmar que la publicación del anfitrión no se interrumpe y que el viewer recupera sonido tras confirmación.
- No se cambió `server.url` ni se desplegó producción. Probar ese binario frente a otro frontend requiere una estrategia aislada autorizada compatible con su origen canónico; no se afirma haberlo hecho con solo una Preview de navegador.
- Silenciar playout local y `allowAudioPlaybackCapture=false` son medidas diferentes. Esta corrección no promete impedir grabadores OEM/del sistema, micrófonos externos o todos los métodos de extracción. No revoca medios ya recibidos ni sustituye controles de acceso del servidor.
- Código ya cargado en dispositivos no se actualiza retroactivamente. Rollback a frontend sin guard de audio reabre este defecto aunque el AAB siga siendo 1.0.57. Conservar contrato y guard al planificar recuperación; sin merge/deploy en esta tarea.
- Mantener Draft. CI y audio PCM simulado no sustituyen la matriz física ni verifican el estado de revisión de Google Play indicado por el propietario.
