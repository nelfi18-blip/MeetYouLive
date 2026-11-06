# Protección de capturas Android — ampliación de PR #893

## Alcance

El PR #893 ya estaba fusionado. Se reutilizan `screenCaptureProtection.js`, el plugin Capacitor `ScreenSecurity` registrado en MainActivity y sus llamadas explícitas a `FLAG_SECURE`. No se cambia Java, manifiesto, Capacitor, iOS ni lógica de Agora. Antes de iniciar se revisó la lista completa de PR abiertos y las búsquedas screenshot/capture: no había otro PR para esta corrección. El PR #1138 y su rama se mantienen separados.

- `/chats/[id]`: protección durante toda la vida de la conversación, incluida carga inicial.
- `/live/[id]`: protección si los metadatos del Live mostrado indican `isPrivate`, `isVipOnly` o `entryCost > 0`. Incluye la puerta de acceso de esa sala; no modifica autorizaciones ni pagos. Un Live público gratuito sigue sin protección por esta ampliación.
- MiniPlayer: conserva protección únicamente mientras muestra un Live sensible. Navegar fuera de la sala puede minimizar sin abandonar la sesión: se protege el video que sigue visible. Cerrar el mini reproductor o esconderlo en login libera su propietario. Al restaurar, la sala vuelve a poseer su protección.
- Llamadas privadas y contenido exclusivo autorizado conservan su integración existente del PR #893.
- Web, PWA e iOS: ninguna llamada al plugin. No se habilita protección permanente en un provider global. Mientras se muestra un mini reproductor sensible, FLAG_SECURE afecta a toda la ventana Android, una limitación propia de esta API, no a un rectángulo individual.

## Coordinación y aislamiento

Cada superficie visible tiene un propietario independiente. La limpieza solo libera ese propietario. Las llamadas se serializan y consultan el estado deseado más reciente, evitando que una activación antigua termine desprotegiendo otra pantalla. StrictMode, navegación rápida y propietarios superpuestos se prueban expresamente. Un resultado fallido invalida el estado conocido y permite reintentar con la siguiente reconciliación; no se introduce un bucle de reintentos ni se bloquea la navegación.

Durante navegación entre salas, React puede mostrar los datos anteriores hasta recibir la nueva respuesta: se mantiene su protección hasta que se sustituye ese contenido.

El contexto de sesión añade únicamente un booleano y una actualización limitada al mismo liveId. Las dos rutas existentes que abren sesión copian ese metadato; cambios posteriores de VIP/privacidad actualizan el metadato. No se cambian clientes, pistas, publicación, tokens ni operaciones de salida/end de Agora. Los metadatos de otro Live no pueden alterar la sensibilidad de la sesión actual.

El cierre de sesión se verifica como transición a login/desmontaje de las superficies y ocultación del mini reproductor. No se cambia la autenticación ni se retira el flag mientras todavía se muestran datos sensibles antes de esa transición.

## Evidencia automatizada

Local, datos y puente sintéticos, sin producción:

- 26 pruebas nuevas de política/controlador/helper: público/privado/VIP/pago, puertas de acceso, metadatos ausentes/transición desde otra sala, serialización, activación/desactivación pendiente, StrictMode, liberación idempotente, fallos del puente, propietarios superpuestos, API imperativa, exclusión web/PWA/iOS/SSR y cableado de rutas.
- Suite completa frontend: 738 aprobadas, cero omitidas. Incluye las regresiones existentes de llamadas, Live, mini reproductor y registro del plugin Android. ESLint sin advertencias. Build Next.js local aprobado con configuración sintética.
- `frontend/scripts/screen-capture-browser-check.mjs`: React real en Chromium, hook real, LiveSessionProvider y MiniPlayer reales; navegación, traducción y puente Capacitor simulados y almacén de pistas sin media. Verifica chat → login, sala sensible → mini reproductor, actualización ajena ignorada, sensibilidad dinámica, cierre, sala pública y mini público sin protección y ocultación en login. No se autentican cuentas ni se solicita ninguna API.
- El harness publica JSON de llamadas y captura del mini reproductor a 390×844 en `screen-capture-lifecycle-evidence` del CI. La captura contiene una fixture sin video; no demuestra protección nativa ni calidad de reproducción.
- CI conserva backend, integración MongoDB desechable y frontend. El harness se ejecuta después del build con herramientas temporales fuera del repositorio; no se cambian dependencias/lockfiles. Los resultados finales del commit se registran en el PR.

Reproducción:

```sh
cd frontend
node --test tests/screen-capture-protection.test.mjs
node --test --test-concurrency=1 tests/*.test.mjs
npm run lint
npm run build
npm install --prefix /tmp/capture-browser-tools --no-save esbuild@0.28.2 playwright@1.64.1
/tmp/capture-browser-tools/node_modules/.bin/playwright install --with-deps chromium
node scripts/screen-capture-browser-check.mjs
```

El harness abre únicamente un servidor HTTP loopback y usa contenido sintético. No ejecuta Agora, cobros ni consultas de datos. Para compilar localmente en esta revisión se usa una copia limpia sin `.env` con configuración sintética; no se reutilizan secretos locales. No se genera APK/AAB/IPA. La rama desactiva despliegues Git de Vercel en `frontend/vercel.json`; no se modifican variables remotas. No se tocan archivos que disparan los workflows nativos existentes.

## Validación pendiente en Android físico

No hay un dispositivo Android conectado ni una compilación nativa nueva; no afirmar que los pasos siguientes pasaron. Un responsable debe usar una compilación de pruebas expresamente autorizada que incluya el plugin original y cargue este frontend aislado; una app conectada a producción no prueba este commit. No generar AAB ni desplegar como parte de esta tarea.

1. Con cuentas de prueba, abrir conversación y probar captura del sistema y grabación. Repetir en llamada y contenido exclusivo autorizado para comprobar regresión. Capturar también el cambio rápido entre estas pantallas y el acceso desde una notificación.
2. Repetir en Live privado, VIP y de pago (fixture sin cobro real), antes y después de acceso, como anfitrión/espectador. Comprobar que video/chat/moderación continúan funcionando y que no cambian permisos o saldo.
3. Entrar a un Live público gratuito sin otra superficie sensible visible: las capturas deben seguir disponibles. Repetir después de salir de un chat/Live sensible.
4. Minimizar Live sensible, restaurarlo y cerrarlo; comprobar que el flag se mantiene mientras su video sigue visible y se libera cuando desaparece. Repetir con mini público y con cierre de sesión/cambio de cuenta. No confundir minimizar con abandonar.
5. Probar atrás de Android, rotación, segundo plano/recientes, reanudación, PiP Android y reconexión. Verificar especialmente el primer fotograma y los cambios rápidos: el puente nativo es asíncrono y las pruebas JavaScript no garantizan esos tiempos. El plugin existente confirma su llamada antes de completar el Runnable de UI; la comprobación física debe evaluar el resultado real en la ventana.
6. Probar al menos las versiones/dispositivos Android soportados; registrar versión de app/SHA, sistema, modelo, pasos y resultado, sin datos personales. Si falla la aplicación del flag o PiP, documentar el bloqueo antes de declarar la protección validada.

## Límites

FLAG_SECURE es una mitigación del sistema Android; no se promete cumplimiento universal en todos los dispositivos, sistemas modificados o superficies de video. Un fallo del plugin se registra y no bloquea el contenido: esta ampliación no introduce una garantía de fallo cerrado ni detección de capturas. No impide fotografías o videos tomados desde otro dispositivo. No cambia iOS ni impone protección en navegadores.

Mantener el PR Draft hasta revisar CI y evidencia física. Sin merge, despliegue, cambios de pagos/World ni AAB automático.
