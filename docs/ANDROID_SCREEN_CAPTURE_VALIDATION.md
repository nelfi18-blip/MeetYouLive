# Protección de capturas Android — PR #1139

## Política final autorizada

El propietario amplió el alcance: **todos los Live**, incluidos públicos gratuitos, privados, VIP y de pago, solicitan FLAG_SECURE en Android nativo. Se reutilizan el helper y plugin ScreenSecurity del PR #893. No se modifica Java, manifiesto, Capacitor, iOS ni lógica de Agora. Continúa exclusivamente el PR #1139, rama `fix/android-sensitive-screen-capture`; el PR #1138 permanece intacto.

- `/live/[id]`: solicita protección desde la apertura de la ruta, antes de cargar metadatos. No depende de precio, privacidad, VIP, rol ni acceso. Incluye carga y puerta de acceso; no concede permisos ni cambia pagos.
- MiniPlayer: cualquier sesión Live mantiene un propietario desde que existe, antes de minimizar. Sala y mini reproductor se superponen en la propiedad para evitar liberar el último propietario durante el traspaso. Cerrar sesión Live libera ese propietario; las rutas ocultas de autenticación no muestran el mini reproductor ni mantienen su propietario.
- `/chats/[id]`, llamadas privadas y contenido exclusivo autorizado conservan la integración existente. Un propietario que termina no puede desproteger otro todavía activo.
- No hay activación permanente en un provider global. Sin superficie o sesión protegida, se solicita limpiar FLAG_SECURE. Mientras hay video Live visible en un mini reproductor, el flag afecta a toda la ventana Android, por la naturaleza de esta API.
- Web/PWA/iOS no solicitan operaciones nativas ni ocultan contenido esperando ese puente.

## Primer fotograma y fallos

El nuevo guard solicita protección en un efecto de layout, antes del pintado normal de React. `ScreenCaptureBoundary` mantiene montados los elementos y referencias de media pero los oculta visualmente (`visibility:hidden` y `opacity:0`), sin interacción/accesibilidad, hasta que el puente confirma activación y transcurren dos requestAnimationFrame. Así no se cambian conexiones, publicación, pistas, tokens, reproducción ni transiciones de Agora.

Un error del puente mantiene oculto el Live y muestra un reintento explícito traducido ES/EN/PT. Los resultados de solicitudes desmontadas o de otra ruta/intento no pueden revelar contenido. El reintento y la limpieza reutilizan el controlador serializado de propietarios independientes. El cierre de sesión se verifica como navegación a login/desmontaje y ocultación del mini reproductor; no se modifica autenticación.

**Límite importante:** el plugin original confirma la llamada antes de terminar su Runnable de interfaz nativa. Esperar dos frames reduce el riesgo, pero no demuestra que la ventana Android ya tenga el flag. Esta revisión no cambia código nativo para evitar disparar builds automáticos APK/AAB. No se promete una garantía absoluta ni una verificación del bit nativo desde JavaScript. La validación de primer fotograma y de superficies de video sigue pendiente en Android real. Chats/llamadas/exclusivos conservan su hook anterior; la nueva barrera visual se aplica a Live y mini reproductor.

## Pruebas ejecutadas con contenido sintético

- Suite frontend local: 738 aprobadas, cero omitidas; incluye 26 pruebas específicas de política/controlador/helper y regresiones existentes de llamadas, Live, mini reproductor y registro del plugin. ESLint sin advertencias. Build y CI del HEAD se documentan en el PR.
- Se actualizan los casos para que un identificador de Live público gratuito también requiera protección, antes de recibir metadatos. La política no inspecciona precio ni privacidad.
- El harness `frontend/scripts/screen-capture-browser-check.mjs` usa React, el guard, Boundary, LiveSessionProvider y MiniPlayer reales, con navegación/idioma, puente Android y almacén de pistas simulados; no usa cuentas, APIs ni media real.
- En Chromium móvil 390×844 se comprueban chat/login, sala → mini → restauración sin disable intermedio, cierre del último propietario, Live público y mini público protegidos, contenido público oculto mientras la confirmación nativa está retenida, ocultación tras rechazo, reintento y limpieza al salir.
- El artefacto CI `screen-capture-lifecycle-evidence` contiene JSON de llamadas y capturas `public-live-before-ack.png`, `public-live-protected.png` y mini reproductor sintético. Las imágenes son evidencia de la barrera DOM/React, no de FLAG_SECURE en un dispositivo.
- CI conserva backend y MongoDB desechable. No se cambian dependencias/lockfiles ni archivos que disparan workflows nativos. No se genera APK, AAB ni IPA, no se despliega y esta rama mantiene desactivados despliegues Git de Vercel.

Reproducción local aislada:

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

Para build local se usa una copia limpia sin `.env`, con URL de API sintética. El harness escucha solo en loopback. No se prueban cobros ni se consultan datos personales.

## Matriz pendiente en Android físico

Un responsable debe usar una compilación expresamente autorizada que incluya el plugin original y cargue este frontend aislado/SHA. No usar producción para probar ni generar AAB/APK como parte de esta tarea.

1. Intentar captura y grabación desde la apertura de un Live **público gratuito**. Repetir privado, VIP y de pago con fixtures sin cobro real, antes/después de acceso y como anfitrión/espectador. Verificar primer fotograma con captura/grabación ya en curso antes de entrar.
2. Minimizar, navegar, restaurar, cambiar entre Live públicos/privados y cerrar el mini reproductor. Confirmar protección continua mientras cualquier video Live siga visible; al cerrar la última superficie, las capturas vuelven a estar disponibles en Feed.
3. Repetir chat → Live → llamada → contenido exclusivo; salir de una superficie no debe liberar el flag si queda otra visible. Comprobar salida, cierre de sesión y cambio de cuenta.
4. Probar atrás de Android, rotación, segundo plano/recientes, reanudación, PiP y reconexión. Verificar la ventana nativa y la primera imagen renderizada, no solo las llamadas JS. Si el flag no se aplica o PiP revela imágenes, registrar el bloqueo antes de aprobar.
5. Confirmar que video/audio, cámara, micrófono, controles de moderación y autenticación siguen funcionando; las pruebas de escritorio no verifican rendimiento o composición nativa. Registrar modelo, sistema, app/SHA, pasos y resultados sin datos personales.

No hay dispositivo físico conectado. El CI no sustituye esta matriz. FLAG_SECURE es una mitigación de Android; no se promete impedir todos los métodos de grabación, dispositivos modificados o fotografías desde otro dispositivo. Mantener Draft hasta revisar CI y evidencia física. Sin merge, producción, cambios de pagos/World/iOS/Apple ni builds nativos automáticos.
