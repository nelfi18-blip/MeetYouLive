# MeetYouLive World — continuación y límites de aceptación (9-nov-2026)

Estado: **NO terminado; NO listo para publicar**. Trabajo exclusivamente en PR Draft #1135, `feat/vcr-horizon-3d-world`, conservando HEAD previo `1e3d955ff8cb74d0a4489b7c96f108100e5e18a7`. Las etapas fotográficas y procedurales documentadas anteriormente son experimentos conservados, no cumplen la aceptación fotorrealista actual. Esta evaluación no autoriza compras, producción ni tratamiento de fotografías privadas.

## Entrada desde Android: evidencia y corrección

La metadata de Vercel confirma la Preview del HEAD previo `READY`; URL estable de prueba:

https://meetyoulive-git-feat-vcr-horizon-3d-world-meetyoulive.vercel.app/vcr

Render informa World Test activo con `4dc97fe854fbe1b645c1929f4b306a8dbdf554c8`. Entre ese commit y el HEAD previo, el único cambio backend es el importador offline `backend/scripts/world-ai-import-preflight.cjs`: no hay divergencia del servidor World Test por esos commits. No se ha redesplegado ningún servicio.

Desde este entorno las conexiones HTTPS a ambas plataformas fueron rechazadas por el proxy con **CONNECT 403 antes de llegar a la aplicación**. No equivale a un 403 de CORS/JWT. El propietario indicó que habilitará los dominios; la última política observada sigue sin incluirlos. Por tanto, **no se ha comprobado remotamente** login, CORS, JWT, WSS ni la causa completa del fallo observado en su teléfono. No se usaron cuentas de producción. La metadata `READY/live` no prueba el recorrido.

En código sí existe un problema verificable: ante 404 del catálogo aprobado, el botón normal de entrada abría automáticamente el prototipo procedural. Se elimina esa sustitución en World Test: se explica en ES/EN/PT que falta la escena y se conserva el prototipo únicamente como elección técnica explícita. Un 401 conserva la renovación de sesión; fallos de red, 403/500 y metadatos inválidos siguen impidiendo entrar. Cambiar de país cancela la solicitud anterior y limpia su estado; no se alteran autenticación compartida ni Socket.IO.

La Preview debe abrirse en el **alias estable**, no en la URL única del deployment: el origen autorizado del piloto es exacto. No cambiar CORS a `*`, no compartir JWT entre producción y World Test y no trasladar credenciales al frontend. Verificar `/api/health`, preflight desde ese alias, login email/password de cuentas sintéticas, namespace `/vcr`, ACK de entrada y persistencia del token dentro de ese mismo origen cuando la red lo permita. Una petición no autorizada al catálogo debe devolver 401, no considerarse prueba de escena disponible.

## Escenarios: comparación y decisión técnica

Fuentes oficiales consultadas en la fecha indicada; importes USD orientativos, sin impuestos. Son especificaciones publicadas, **no benchmarks realizados con activos de esos proveedores**.

| Opción | Calidad y cobertura internacional | Colisión / exportación | Móvil y licencia / coste | Decisión |
| --- | --- | --- | --- | --- |
| World Labs / Marble | Genera volúmenes de apariencia realista inspirados en imágenes/texto; no certifica reproducción geográfica fiel ni seis ciudades completas. | API publica SPZ y campos de malla/collider. El fichero concreto, escala, suelo y correspondencia requieren revisión; HQ GLB es una exportación distinta. | Encaja con Spark ya instalado; sin medición física no se garantiza FPS. Derechos comerciales API sujetos a condiciones, atribución y entrega/reten­ción. Generación y ancho de banda cuestan. | Candidato con menor cambio de motor; **no elegido por calidad comprobada**, no se llama API ni se importa una demo como activo aprobado. |
| SpAItial Echo-2 / HQ / Echo-3 | Generación espacial y reconstrucción desde captura real; un resultado generado puede contener artefactos o geometría incorrecta. Echo-3 necesita captura autorizada. | Splat exportable no basta para caminar: confirmar formatos y collider navegable del plan/modelo concreto. No se ha recibido un activo ni probado su adaptación. | Cuenta/API y derechos comerciales dependen del plan; no suponer que créditos gratuitos conceden licencia comercial. Evaluar exportación y presupuesto en teléfonos antes de migrar. | Alternativa para evaluación autorizada; actualmente no integrada. |
| Fotogrametría propia o escaneos CC0/CC BY verificables (p. ej. catálogo Sketchfab) | Mejor fidelidad al lugar efectivamente capturado; cobertura, agujeros, peatones y resolución varían por activo. | Malla GLB/glTF puede simplificarse para colisión y LOD. Cada colección necesita pipeline de unión, escala, iluminación y navegación; no es una ciudad lista. | CC0/CC BY pueden permitir uso comercial con sus condiciones. Excluir NC/editorial y revisar SA, marcas, personas y redistribución descargable. No todos los activos de un catálogo comparten licencia. | Preferible para fidelidad geográfica si existe material autorizado. **No hay paquete aprobado para ninguno de los seis países**. No se descargaron fotografías privadas ni se compraron escaneos. |
| Google Photorealistic 3D Tiles / visor compatible | Cobertura geográfica real, útil para vista de ciudad; detalle a nivel peatonal y cobertura del país deben comprobarse. | Streaming geoespacial, no paquete de niveles editable. Las políticas prohíben extraer/almacenar contenido fuera del servicio; no asumir permiso para hornear colliders. | Requiere atribución, servicio/billing y renderer de tiles. Primera banda publicada: 1.000 eventos gratuitos, después USD 6/1.000 eventos de raíz 3D según SKU; no es una tarifa por ciudad descargada. | No sustituir el mundo caminable por un mapa ni extraer geometría sin permiso. No integrado. |

Fuentes: [World Labs API y activos](https://docs.worldlabs.ai/api/reference/worlds/get), [precios World Labs](https://docs.worldlabs.ai/api/pricing), [condiciones World Labs, §§2.10/3.3/3.6](https://www.worldlabs.ai/terms-of-service), [SpAItial modelos](https://docs.spaitial.ai/api/generation-models), [servicio API](https://docs.spaitial.ai/api/service-description), [precios](https://docs.spaitial.ai/api/credits-billing), [condiciones §§5–7](https://spaitial.ai/terms), [licencias Sketchfab](https://sketchfab.com/licenses), [atribución/API descargable](https://sketchfab.com/developers/download-api/guidelines), [políticas Google](https://developers.google.com/maps/documentation/tile/policies), [precios Google](https://developers.google.com/maps/billing-and-pricing/pricing).

**Coste calculable y coste desconocido:** World Labs API: USD 1/1.250 créditos; compra mínima USD 5. Ejemplo Standard texto: 1.580 créditos ≈ USD 1,264 por candidato. Dieciocho candidatos (tres por país) ≈ USD 22,75; dieciocho HQ GLB opcionales a USD 2,80 añaden USD 50,40. No confundir HQ con collider incluido/publicado: comprobar el archivo realmente entregado. No se garantiza aceptación con tres intentos. API y app Marble tienen facturaciones separadas; desactivar auto-refill no impide sobreconsumo facturable.

SpAItial publica USD 1,60 por Echo-2, USD 8 por HQ y USD 9 + 0,01/frame para Echo-3 API. Dieciocho HQ equivalen a USD 144 de valor de créditos, **no al total de una suscripción**. Plan comercial, acceso Echo-3, captura, almacenamiento, CDN, tráfico, optimización, revisión y personalización son costes adicionales/variables; no se obtuvo cotización contractual del total. Free/Standard no permiten asumir producción comercial. Los términos de entrenamiento de datos impiden tratar una foto privada como entrada autorizada por defecto.

No hay una opción que pueda declararse hoy gratuita, licenciada, fiel a seis ciudades, caminable y comprobada en ambos teléfonos. No activar trials con tarjeta ni recursos con sobrecostes. No se contrató ni generó ningún mundo.

**Mantener Three.js + Spark + WebGL2 y Socket.IO**, conservando el cargador SPZ, verificación SHA-256, GLB y navegación aprobada. Cambiar a Unity/Unreal o streaming GPU no proporciona activos ni derechos y añade migración/red/coste sin evidencia de mejora. Splats aportan apariencia; la colisión procede de geometría verificada, no de la imagen. Los límites actuales de 24 MiB SPZ / 32 MiB collider son límites de ingestión, no certificación de memoria GPU ni de fluidez.

Antes de un import real, se necesita por país: fuente/autor/licencia y permiso de entrega web, escena espacial descargable con derechos verificables, collider alineado y suelo continuo, escala y coordenadas, SHA-256 de ambos archivos, navegación revisada, presupuesto/host autorizado y aprobación visual del propietario. El catálogo queda cerrado si faltan esas condiciones. Comparar candidatos propios/licenciados en París, Tokio y Guiza antes de escoger contrato, respetando restricciones de evaluación de cada proveedor; después aplicar la misma aceptación a EE. UU., EAU y Brasil. No subir activos de un proveedor a otro sin derechos.

## IA contextual y representación personal

No existe en este cambio una IA conversacional contextual operativa ni generación fiel de cuerpo/rostro. El cargador de escenas generadas por IA no implementa esas funciones. No se reutilizan claves de otros sistemas ni se activan costes.

Para avanzar faltan un proveedor/modelo autorizado, límites de gasto/uso, tratamiento y borrado de datos, fuentes de contexto verificables, moderación y evaluación multilingüe. La IA debe identificarse como IA y no inventar personas conectadas. Solo puede recibir ubicación virtual y contexto permitido; nunca historiales privados, bloqueados o credenciales. Cancelar respuestas al salir/cambiar país y aislar por instancia son requisitos de implementación y prueba, no capacidades ya acreditadas.

Para avatares fieles: consentimiento separado, específico y revocable para las fotografías elegidas y para el proveedor; retención/borrado verificables; no inferir apariencia a partir de datos no autorizados; revisar rostro y complexión con el titular. Ni una foto plana ni una malla genérica acreditan esa fidelidad. La referencia actual sigue siendo una vista previa local sin subirla a proveedores. No se utilizan fotos privadas en estas pruebas.

## Pruebas reproducibles y aceptación física

La regresión `frontend/scripts/world-entry-browser-check.mjs` monta **PhotoWorld real y el validador real de sesión** en Chromium. Intercepta localmente todas las URLs; sustituye la frontera de socket/auth por fixtures sintéticas. Comprueba 404 sin redirección procedural, 401/403/500, metadatos inválidos, opt-in del prototipo, limpieza al cambiar país y selección de la ruta AI con metadatos sintéticos válidos en ES/EN/PT, viewport táctil 390×844 sin desbordamiento. Produce JSON y tres capturas en `/tmp/world-entry-artifacts`; CI los conserva como `world-entry-evidence`. **No representa una prueba de escena fotorrealista, CORS remoto, sesión real o dispositivo físico.**

```sh
cd frontend
npm ci
npx playwright install chromium
node scripts/world-entry-browser-check.mjs
```

El flujo CI existente conserva backend general, 112 pruebas con MongoDB desechable replica set, navegador WebGL con dos cuentas sintéticas/Socket.IO real, frontend, ESLint y compilación. Su prueba procedural verifica protocolo/movimiento, no satisface por sí misma la apariencia final. Revisar resultados del nuevo SHA, no trasladar el verde del HEAD anterior. No se generan binarios móviles.

Una vez disponibles red, escenas y cuentas sintéticas en World Test, el propietario debe abrir el alias estable `/vcr` en Chrome Android y Safari iPhone, iniciar A/B por email/password, elegir el mismo país y comprobar misma instancia y movimiento recíproco. Probar todos los países, arrastre/giro, avance/retroceso, obstáculos/escalones, salida/reentrada, pérdida de red/reconexión, segundo plano/restauración, bloqueo bilateral y reporte recibido en moderación **de prueba**. Verificar privacidad y revocación sin transmitir fotos privadas. Repetir ES/EN/PT, horizontal/vertical, calentamiento/consumo/memoria y sesión sostenida; registrar dispositivo/SO/navegador, errores de consola y FPS/tiempos medidos. Comparar el lugar a altura peatonal y aceptar expresamente su calidad, sin sustituir activos ausentes por prototipos.

Pendientes materiales: activos/licencias y hosting de seis países; proveedor/privacidad/presupuesto de IA contextual y avatares; HTTP/CORS/JWT/WSS remoto; prueba física conjunta; aprobación visual del propietario. Ninguno queda resuelto por el aviso de escena ausente. El PR debe seguir Draft, sin merge ni publicación.
