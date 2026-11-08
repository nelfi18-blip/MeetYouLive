# World — playable international pilot in PR #1135

## Regla obligatoria: ropa y estilo sí, cuerpo real inalterado — 8-nov-2026

**Decisión explícita del propietario:** el miembro podrá cambiar su vestimenta/estilo en World, pero **nunca alterar su rostro, cuerpo, altura, silueta, proporciones, tono de piel ni edad aparente para inducir a error**. No se ofrecerán herramientas de adelgazar, engordar, alargar piernas, remodelar figura, cambiar rasgos faciales ni embellecer físicamente a la persona. Los cambios de peinado/ropa solo se considerarán si la representación sigue siendo reconociblemente la misma persona.

El modelo/servicio de imágenes que se conecte en el futuro deberá respetar estas condiciones, aunque **una instrucción de IA no garantiza por sí misma la fidelidad**. La aprobación se basa en revisión visual del usuario, opciones de descartar/regenerar, pruebas con imágenes autorizadas y moderación; si no puede mantenerse una representación fiel o la foto no revela el cuerpo completo, no debe inventarse la fisionomía ni presentarse como identidad real. Todo resultado generado llevará la indicación visible «Creado con IA», sin confundirlo con foto o video original.

**Implementación preparatoria en este PR:** lista cerrada de estilos de ropa `original`, `casual`, `elegant`, `sport`, `urban` (`frontend/lib/vcr/stylePreferences.js`), reglas de integridad corporal que prohíben cambios físicos, selector visual en `PhotoWorld`, mensajes ES/EN/PT y tests. El estilo se elige únicamente en memoria durante la visita y **todavía no modifica ninguna foto**, no usa un servicio de IA, no altera el perfil ni se transmite por Socket.IO. No declarar un cambio de ropa efectivamente renderizado hasta implementar la generación con consentimiento y pruebas de parecido.

## Foto completa opcional para futura identidad IA — 8-nov-2026

**Decisión funcional:** la foto de rostro principal del perfil y una foto opcional de cuerpo completo pueden servir como **dos referencias complementarias** de identidad visual. La foto principal ayuda a reproducir rasgos faciales visibles; la foto completa puede mostrar vestimenta, peinado, postura y silueta. Una sola imagen no permite deducir de forma fiable aspectos que no se ven ni garantiza reconstrucción exacta.

**Implementación actual (sin proveedor AI):**
- Se incorporó en `frontend/components/vcr/PhotoWorld.jsx` un selector opcional `Foto de cuerpo completo` dentro de la sección de identidad de World.
- Se aceptan únicamente JPG, PNG o WebP válidos según tipo/tamaño informado por navegador, máximo **10 MB**, con vista previa en proporción original `object-fit: contain`, sin recortes. Antes de aceptar imágenes en backend, realizar validación de bytes y protección contra archivos maliciosos.
- La imagen se mantiene **solo en memoria del navegador**, mediante `URL.createObjectURL(file)`. Se libera el URL con `URL.revokeObjectURL` al quitar/reemplazar la imagen o desmontar World.
- **No hay petición HTTP, almacenamiento en backend, Cloudinary, IA, Socket.IO, subida automática ni copia en fotos públicas** para esta referencia; tampoco modifica foto de perfil, selfie, autentificación facial ni imagen compartida con otros usuarios.
- Selector y aviso de privacidad traducidos ES/EN/PT; pruebas de tipos/tamaño, limpieza, ausencia de subida desde selector y visualización sin recortes.
- La selección local **no** es autorización de procesamiento ni se conserva entre visitas. Cualquier función posterior para crear una representación IA necesitará **consentimiento aparte y revocable**, proveedor habilitado, evaluación de seguridad/retención/coste, salida generada marcada como IA y acción explícita de aceptar o descartar.
- Las imágenes de usuarios que contengan terceras personas u otros datos sensibles no deberán procesarse sin autorización y controles adecuados. La app es para adultos.

**Estado:** flujo local de referencia implementado; **generación de figura humana por IA aún pendiente** y apagada. No merge, no despliegue, no AAB / IPA nuevos por este ajuste visual web.

## Auditoría de existencia y atribución de fotografías — 8-nov-2026

Se contrastaron manualmente los **seis archivos** en sus respectivas páginas oficiales de Wikimedia Commons. Las rutas y autores que constan en el catálogo `frontend/lib/vcr/photoWorldScenes.js` corresponden a archivos existentes; las condiciones de licencia verificadas incluyen atribución, enlace a la licencia, indicación de cambios/recortes y, para obras BY-SA, posibles obligaciones de compartir obras adaptadas bajo la misma licencia.

| Destino | Archivo Wikimedia Commons | Autor atribuido | Licencia publicada |
| --- | --- | --- | --- |
| Nueva York | [Manhattan, New York skyline.jpg](https://commons.wikimedia.org/wiki/File:Manhattan,_New_York_skyline.jpg) | rboed* | CC BY 2.0 |
| París | [Eiffel tower from trocadero.jpg](https://commons.wikimedia.org/wiki/File:Eiffel_tower_from_trocadero.jpg) | NonOmnisMoriar | CC BY-SA 3.0 |
| Tokio | [Shibuya crossing, Tokyo, Japan.jpg](https://commons.wikimedia.org/wiki/File:Shibuya_crossing,_Tokyo,_Japan.jpg) | Joli Rumi | CC BY-SA 4.0 |
| Dubái | [Dubai skyline marina.jpg](https://commons.wikimedia.org/wiki/File:Dubai_skyline_marina.jpg) | Wkjekf | CC BY 4.0 |
| Río | [Copacabana beach.jpg](https://commons.wikimedia.org/wiki/File:Copacabana_beach.jpg) | Luca Gebara | CC BY-SA 3.0 |
| Guiza | [The Pyramids of Giza.jpg](https://commons.wikimedia.org/wiki/File:The_Pyramids_of_Giza.jpg) | Yasseralghol | CC BY-SA 4.0 |

**Esto verifica existencia y metadatos publicados, no equivale a autorización jurídica final**: aún se deben revisar licencias y derechos incidentales de los monumentos, el uso comercial y las adaptaciones según jurisdicción; la aplicación debe conservar créditos y enlaces. Evitar convertir fotos estáticas en transmisiones ficticias. Revisar entrega/hotlink y rendimiento de `Special:FilePath` en dispositivos reales antes de merge.

## Primera implementación del nuevo concepto (8-nov-2026)

**Código incorporado en este mismo PR Draft, sin merge ni producción:**

- `/vcr` renderiza ahora `PhotoWorld` de forma predeterminada: **escena fotográfica 2D sin WebGL ni avatares de malla 3D**. Los antiguos módulos Three.js permanecen intactos como prototipo técnico recuperable, no como aspecto oficial del producto.
- Seis destinos con **fotografías reales acreditadas** de Wikimedia Commons, enlaces a autores/fuentes y licencias visibles en la pantalla. Las fotografías se presentan recortadas y oscurecidas en la UI; **no son directos ni cámaras en vivo**. Revisar antes de lanzamiento los derechos específicos (especialmente libertad de panorama en ciertos países), la disponibilidad/carga de URLs de terceros y las condiciones BY-SA.
- Zonas sociales con saltos entre puntos virtuales, sin afirmar que el usuario pueda caminar libremente por una fotografía. El cliente usa `createPhotoWorldAdapter` que conserva las mismas reglas/IDs de país y zona. La conexión JWT sigue en `/vcr`; el servidor sigue autorizando la instancia, posiciones y visitantes, aplica bloqueos recíprocos y expulsa cuentas no autorizadas. No se añaden NPCs ni cifras fabricadas.
- La foto original que muestra la vista previa se obtiene solo de `GET /api/user/me`. La casilla para compartir **la foto pública principal** se activa **a petición expresa y por sesión**; de inicio está desactivada. Con consentimiento, `vcr:join` comunica únicamente el booleano `sharePhoto`. El backend verifica que exista foto pública y emite únicamente `photoConsent` en snapshots autorizados; los clientes con sesión pueden consultar el perfil público autorizado por HTTPS para esa foto. No se envían imágenes, selfie ni URLs de fotos por Socket.IO.
- Un cambio detectado de foto principal invalida el consentimiento para el resto de esa sesión. Salir de World interrumpe presencia y restablece la casilla. Si no consiente, los demás ven solo la inicial y el nombre público. La seguridad de bloqueo y reporte existentes se mantiene.
- **No existe todavía generación de avatares IA ni imágenes de cuerpo completo.** El estado actual usa únicamente **la foto original** del usuario y escenas fotográficas; no se debe presentar como representación generada por IA, ni habilitar un proveedor sin consentimiento/retención/coste y pruebas de privacidad.
- Se añadieron pruebas automatizadas de adaptación del protocolo, seis fotos con atribución, paridad ES/EN/PT, estado de consentimiento/privacidad y revocación. Cualquier CI inicial en rojo se debe resolver antes de considerar este cambio listo.

**Puertas pendientes antes de producción:** CI de HEAD completa, pruebas con dos cuentas Android físicas contra backend de ensayo, imágenes/licencias confirmadas visualmente, carga sin red y manejo de fallos, auditoría de seguridad (sin selfie), accesibilidad y rendimiento. No usar datos de cuenta/credenciales de producción ni convertir este Draft a mergeable por presión de lanzamiento. La integración de IA con likeness fotorrealista es una fase posterior, requiere proveedor autorizado y ensayo adicional.

## Decisión visual definitiva del propietario — 8-nov-2026

**World debe verse como personas y lugares reales, no como figuras o escenarios de videojuegos 3D.** Esta dirección visual reemplaza, para el producto final, la recomendación previa de avatares articulados y ciudades procedurales Three.js. El código 3D anterior es **prototipo técnico no aprobado visualmente**; conservarlo sin pérdidas mientras se desarrolla una presentación fotográfica separada. No alterar multijugador, presencia, permisos, bloqueos, reportes, JWT ni Live.

### Identidad del miembro basada en su fotografía real
- Fuente única autorizada: **foto principal pública del perfil del propio miembro**, nunca la selfie privada de liveness ni fotografías de otras personas.
- El miembro elige explícitamente **«Crear mi representación con IA usando mi foto»**, ve aviso de procesamiento, uso, almacenamiento y posible proveedor externo, y puede rechazar o revocar; World debe funcionar con foto de perfil normal si no hay permiso.
- Generar **un retrato/figura humana realista 2D** o varias poses fotográficas coherentes con la apariencia de la imagen autorizada para un entorno social basado en escenas reales/panorámicas. No exigir WebGL, mallas 3D, rigging, cuerpo 3D ni avatar caricaturesco en la experiencia definitiva. Una sola foto **no garantiza reconstruir rasgos ni cuerpo completo fielmente**: la vista previa debe permitir aceptar, repetir o descartarla sin alterar el perfil.
- Las representaciones generadas llevan indicación visible y accesible de **«Creado con IA a partir de mi foto»**; no hacer pasar la imagen por video en directo o suplantar otra persona.
- Evitar convertir una foto de rostro en una falsa identidad verificada; las insignias y verificación del perfil siguen dependiendo exclusivamente del sistema actual.
- Generar assets fuera del flujo en tiempo real, optimizados para red móvil, con vista previa, consentimiento comprobable y límites de tamaño/costo; reutilizar carga y entrega autorizadas de imágenes sin duplicar originales innecesariamente.
- Solo mostrar a miembros no bloqueados dentro del mismo World; sincronizar IDs/estado social, **no fotos crudas ni selfie/biometría por Socket.IO**. No introducir coordenadas GPS en este sistema.
- Si cambia la foto principal, el usuario revoca el consentimiento, bloquea su cuenta o elimina su perfil, la representación debe quedar invalidada/dejar de mostrarse y ser borrada con la política aplicable de eliminación. Evitar mantener copia biométrica persistente; documentar retención y proveedor.
- No crear NPC que aparenten ser usuarios reales. Mostrar solo personas auténticas conectadas o indicar claramente cualquier elemento decorativo de IA.

### Escenarios y navegación
- Preferir fotografías/panorámicas reales debidamente licenciadas, clips cortos o fondos fotorrealistas generados con IA **identificados como recreaciones**. Los destinos y monumentos deben reconocerse, sin afirmar falsamente que una recreación es una cámara en vivo.
- Navegación por puntos/escenas interactivas en móvil; retratos o recortes humanos 2D integrados en esas escenas y tarjetas de perfil/conversación reales.
- Conservar los contratos de sesión, autenticación, presencia, filtros bilaterales y moderación existentes, aunque se sustituya el renderer/escenas en frontend.
- No prometer movimiento libre 3D, avatares tridimensionales ni representación fotorrealista en tiempo real sin una nueva aceptación expresa.

### Entrega y seguridad
- Primero definir especificación y prototipo visual **sin credenciales ni fotografías reales ajenas**; después incorporar generación por IA solo con proveedor aprobado, consentimiento verificable, moderación, almacenamiento/retención y coste controlado.
- Añadir pruebas de consentimiento ausente, revocación, foto cambiada, cuenta eliminada, bloqueo, fuga de datos e interfaces ES/EN/PT; comprobar teléfonos reales y consumo de datos/rendimiento.
- **No merge ni producción** para este cambio de dirección hasta revisión visual y funcional. Mantener un único World y PR #1135; evitar mezclar con PR #1141 de ubicación.


**Official user-facing product name: World.** This is ONE social virtual world
with multiple country destinations, not two worlds or two products. The `/vcr`
route, `/vcr` Socket.IO namespace, `vcr:` events, `vcrWorld` translation
keys and existing branch name remain internal compatibility identifiers.
Never show “VCR World” as a product name or create a second World menu item.

Continue `feat/vcr-horizon-3d-world`; never present the prior solo scene or this
pilot as the finished photorealistic product. No production deployment, merge,
native packaging, paid feature or photo processing is part of this work.

## Stage status

| Stage | Implemented | Still required |
| --- | --- | --- |
| 1: explorable world + shared presence | Six independently built scenes; third-person walking/collision/camera; opt-in JWT-authenticated instances; remote avatars; travel/leave/reconnect | Two actual people using separate real accounts on physical Android/iPhone; authorized test backend running this branch |
| 2: convincing art and animation | Original country architecture, procedural façade/paving textures, directional/hemisphere lighting, articulated walking placeholder | Professional human meshes, rigged animation, PBR asset pipeline, richer streets/landmarks, art acceptance and device budgets |
| 3: social activities/customization | Existing public-profile links and report/block endpoints; clothing color saved per account on this device | Consensual conversations/activities, server-persisted outfits, clothing/shoes/hair/accessory assets |
| 4: AI and expansion | Stable destination IDs and separable renderer/network/art modules | Photo-based avatar generation with explicit revocable consent; no photo access or AI generation exists today |

Stage 1 has executable software evidence, **not** acceptance with two real people
on phones. Stages 2–4 are not complete. The screenshots are of synthetic fixtures,
not real population or an advertised final visual target.

## Graphics architecture decision

Keep Three.js 0.187.0 and WebGL2 for this stage. The existing Next.js/Capacitor
client already uses it. It supports lazy client-only loading, independently
disposed country groups, articulated geometry, camera raycasts and adaptive
resolution without changing native projects or authentication. The renderer uses
standard materials, procedural original textures and no external asset downloads.
Its npm tarball checksum is pinned in the lockfile.

Babylon.js offers more integrated engine tooling but a migration would replace
working scene/input code without supplying the missing production art. Unity/WebGL
adds a larger runtime and a distinct native/build pipeline. A WebGPU-only renderer
would narrow mobile WebView coverage. None solves the art and multiplayer design
by itself. Reassess with measured device profiles and actual approved assets,
before proposing a migration. References:
[Three WebGLRenderer](https://threejs.org/docs/#api/en/renderers/WebGLRenderer),
[Three cleanup](https://threejs.org/manual/#en/cleanup),
[Capacitor Web API model](https://capacitorjs.com/docs/core-apis/web).

`destinationScene.js` owns original environment geometry/materials/textures.
`avatar.js` owns each articulated placeholder. `districtWorld.js` owns input,
camera, interpolation, renderer and disposal. Shared pure protocol/physics rules
live in `backend/src/lib/vcrWorldRules.cjs` and are bundled into the browser; no
MongoDB or server dependency is imported by that file. Frontend builds must check
out the repository including that backend rules file. Next's build verifies this.

## Destinations are different geometry, not six backgrounds

| Country | Pilot identity |
| --- | --- |
| US | Boulevard, high-rise skyline, cylindrical/glass towers, waterfront/palms |
| France | Mansard roofs, balcony rows, striped café awnings/terraces and an original open lattice tower |
| Japan | Lantern-lit corridor, colored emissive urban signs and a red gateway |
| UAE | Rounded tiered towers/spires, glass surfaces, waterfront and landscaped public space |
| Brazil | Curved mountain silhouettes, wave promenade, beach parasols and palms |
| Egypt | Pyramids, column walk, temple structure and dunes |

These are original recognizable studies, not official replicas or completed
realistic cities. Each country is built separately and the previous geometry,
textures and materials are disposed on travel. Physics includes map bounds and
main buildings; small decorative objects are not all solid yet. The avatar is a
human-proportioned placeholder, not a finished realistic person. There are no
vehicles crossing players, weapons, combat, crime, fake pedestrians or fake counts.

## Authenticated presence and privacy

`/vcr` is a separate Socket.IO namespace on the existing server. It reuses the
existing JWT authentication middleware and requires an expiring verified token.
It cannot disconnect the app's shared Chat/Live socket. Browsing the scene alone
does not connect to VCR; the user must explicitly agree to share virtual presence.
The server does not receive real-world location or photos through this protocol.

- `vcr:join`: country + protocol version + allowed clothing color. The server
  chooses the instance; client-supplied user IDs/instance IDs grant no authority.
- `vcr:move`: a fresh opaque membership token and finite bounded position/yaw.
  Both client and server share speed/collision rules. Excessive movement is
  corrected. Moves are volatile, sent at 10 Hz, rate-limited server-side.
- `vcr:travel`: only the four server-known safe positions. Clients cannot request
  arbitrary teleport coordinates. Changing countries creates fresh membership.
- `vcr:snapshot`: 5 Hz, **per recipient**, with current unblocked peer IDs,
  usernames, avatar color and virtual positions. No email, photo, real location,
  activity history, billing state, token, or private profile is sent.
- `vcr:leave`/disconnect: remove ephemeral membership. The next snapshot removes
  its avatar. Reconnection requires fresh membership and resets to a safe spawn.

Membership is deduplicated per account on the worker; a second tab replaces its
old membership. Slow joins cannot resurrect departed sockets or overwrite newer
country joins. Snapshots also guard membership changes across async DB reads.

Every snapshot batch rereads `isBlocked`, role and bilateral `blockedUsers` from
MongoDB. New blocks/moderation take effect on the next successful fresh snapshot
(normally within the 200ms polling period, plus DB/network latency). This is not
an instantaneous cross-system transaction: a snapshot already in flight can arrive
first. The local block action immediately removes its target, then server snapshots
enforce both directions. Staff accounts are rejected. Deleted/moderated accounts
and expired tokens lose membership. A DB/privacy failure clears all affected
presence instead of relaying a cached audience. It never auto-rejoins a revoked
membership. No public room broadcast circumvents block filtering.

Safety buttons call the existing authenticated report/block endpoints. Reporting
requires the person's own reason and confirmation, not an invented allegation.
Opening a profile uses the existing profile route and its protections. Chat,
calls, matching and media aren't added to VCR or bypassed by this prototype.

## Operational boundary: single-worker pilot

The current instance directory is ephemeral, local to one process: **16 members
per instance, 64 total per worker**. Full instances allocate another server-owned
instance; global capacity rejects additional joins. The displayed count is only
visible unblocked peers in that instance and explicitly excludes the visitor.
The short instance code lets testers check whether they are together.

Two workers currently have different directories. A Redis adapter alone does not
make membership, capacity or privacy checks distributed. Do not claim global
world population, cross-region continuity or cross-worker synchronization. A
production multi-worker release needs a shared authoritative instance service,
routing/stickiness, backpressure and load/privacy tests. Process restart loses
presence; clients reconnect safely, and no population is invented to hide it.
No infrastructure provisioning is authorized by this PR.

For testing, run ONE backend on this branch, with the test frontend's origin in
the existing `FRONTEND_URL` CORS configuration and the frontend pointing at it.
A frontend preview pointing at the old production backend has no `/vcr` protocol
and must show connection unavailable, not fake multiplayer. Do not point fixture
scripts or tests at production databases or use real credentials.

## Mobile behavior and honest limits

Touch controls support held movement, pointer cancellation/capture loss and blur;
the back arrow maps to backward movement. Scene drag changes yaw/pitch, camera
pitch is bounded, and camera raycasts reduce clipping against the environment.
Typing in inputs does not move the avatar. Hidden pages stop walking. WebGL
context loss stops rendering and shared presence and offers a reload.

Only one destination is loaded. Device pixel ratio is capped; mobile disables
dynamic shadows; sustained slow frames reduce resolution. All owned resources
and listeners are released. These are measures, not a verified FPS guarantee.
WebGL2, memory, thermal/battery behavior and background restoration still need
physical Android/iPhone testing. Desktop mobile emulation is not an iPhone test.
Clothing color is local to the account on this device, not synchronized across
devices. There is no custom photo upload/generation or subscription activation.

## Reproducible checks

Use Node 24 and a disposable local MongoDB replica set. All URI guards reject
remote MongoDB. No real account is used in the automated evidence.

```sh
cd backend
npm ci
INTEGRATION_MONGO_URI='mongodb://127.0.0.1:27117/vcr_test?replicaSet=rs0&directConnection=true' npx jest src/lib/__tests__/vcrWorld.integration.test.js src/lib/__tests__/vcrWorld.test.js --runInBand
cd ../frontend
npm ci
npm run lint
node --test --test-concurrency=1 tests/*.test.mjs
NEXT_TELEMETRY_DISABLED=1 npm run build
npx playwright install --with-deps chromium
INTEGRATION_MONGO_URI='mongodb://127.0.0.1:27117/vcr_browser?replicaSet=rs0&directConnection=true' node scripts/vcr-browser-check.mjs
```

The last script binds a loopback-only isolated harness, creates two synthetic
MongoDB users, uses real JWT/socket authentication and executes the actual renderer
and presence client in two Chromium contexts. One viewport is 390×844 with touch.
It verifies movement visible in the other browser, camera, touch cancel, country
travel, leave/reconnection, rendered bilateral block filtering, all six WebGL
scenes and context loss. It stores screenshots/results in
`/tmp/vcr-browser-artifacts` and deletes only its own fixture users. It does not
mount the entire React application or replace actual device acceptance.

GitHub's existing dedicated replica-set job includes the 13 VCR integration tests
and strictly requires **112** passes with zero skips (the previous 99 remain
unchanged). Six additional VCR unit tests run in backend general. The frontend
suite includes movement/camera/geometry disposal and seven connection lifecycle
tests. The browser harness runs after the replica-set suite; its screenshots and
JSON are uploaded as `vcr-browser-evidence`. Android AAB generation is explicitly
skipped for this PR branch because dependency edits otherwise trigger it. Apple
files/workflows, signing settings and IPA generation are untouched.

## Owner acceptance from phones — still pending

1. Use an authorized isolated test backend/frontend running the same commit.
   Sign in with two separate accounts on Android and iPhone; keep a third empty
   instance/country available for isolation checks. Do not use production data.
2. Open `/vcr`. Confirm that solo exploration shows nobody. Select a country,
   then each explicitly enters shared presence. Compare the instance codes.
3. Walk, turn, drag the camera and try all touch arrows (including back). Each
   person must see the other's movement/turning/outfit without a fake crowd.
4. Change country, leave, disable/re-enable network, background/restore the app
   and reconnect. Old avatars must disappear and new ones appear only after a
   confirmed connection. Test a second tab of the same account.
5. Block in each direction; verify both worlds hide each other. Confirm/report
   with an actual chosen reason; verify it reaches the existing moderation queue.
   Revoke an account in the authorized test admin and verify removal.
6. Visit each destination. Record device/OS/browser, country, time, connection
   errors, visual artifacts, average/worst FPS, thermal/battery/memory behavior
   during a 10-minute session and any crash. Review camera clipping and crowded
   instances. Check ES/EN/PT, narrow widths and safe areas.

Do not mark phone compatibility, two-real-person validation, production scale or
the approved visual quality complete until that evidence and product acceptance
exist. Keep PR #1135 Draft; do not merge, deploy production or activate $9.99.
