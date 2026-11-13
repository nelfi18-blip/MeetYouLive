# World pilot — isolated Render + MongoDB + Vercel verification

This file documents the existing free resources only. This is **not** a production release instruction.

## Verified existing infrastructure

- Render workspace: meetyoulive-api; **test service** `srv-dbmf5u15efls73e5s9sg`, `meetyoulive-world-test`, free plan, branch `feat/vcr-horizon-3d-world`, auto-deploy disabled.
- Atlas project **MeetYouLive World Test**, free **WorldTestFree** cluster. Dedicated DB `world_test` (no application accounts were present on initial inspection). Runtime Mongo user must have readWrite scoped ONLY to `world_test`.
- Vercel branch-preview alias: `https://meetyoulive-git-feat-vcr-horizon-3d-world-meetyoulive.vercel.app`.
- Branch-only Vercel settings: `NEXT_PUBLIC_API_URL` and `API_URL` point to `https://meetyoulive-world-test.onrender.com`; `NEXT_PUBLIC_WORLD_TEST_MODE=isolated`, `NEXTAUTH_URL` points at the World preview alias; server-only `MONGODB_URI` is an intentionally unreachable local URL. Do not modify general/production settings.
- Production API and MongoDB must NEVER be used to log in, run tests, or migrate pilot data.

## Separate test-only entrypoint

`backend/world-test-server.js` is independent of `index.js` and `src/app.js`; it starts no reactivation, push, moderation worker, admin seed, payment, email, Apple, Google OAuth, Live or creator jobs. Only these test routes are exposed:

- GET `/api/health` (no secrets)
- POST `/api/auth/login` (two synthetic .invalid addresses only)
- GET `/api/user/me` (minimal synthetic profile)
- POST `/api/moderation/users/:id/block`
- POST `/api/moderation/report`
- Authenticated Socket.IO namespace `/vcr`

Only one instance/worker. No real user profiles, payments, Live calls or off-platform messaging.

## Required Render Settings (human-controlled; do not guess or paste secrets in chat)

On the **test** service ONLY, start command must be:

```bash
node world-test-server.js
```

Do NOT select the live production service. Auto Deploy may remain disabled. Do not click Manual Deploy until every isolated variable below has been verified:

- `WORLD_TEST_MODE=isolated`
- `WORLD_TEST_MONGODB_URI`: dedicated WorldTestFree SRV URI, database **/world_test**, unique MongoDB user readWrite limited to `world_test`
- `WORLD_TEST_JWT_SECRET`: independent cryptographically random secret (32+ chars, e.g. Render generated), never same as production JWT
- `WORLD_TEST_FRONTEND_ORIGIN=https://meetyoulive-git-feat-vcr-horizon-3d-world-meetyoulive.vercel.app`
- `WORLD_TEST_ACCOUNT_A_PASSWORD`, `WORLD_TEST_ACCOUNT_B_PASSWORD`: different long random temporary passwords for two synthetic accounts

**Must be unset (no inherited production secrets):** `JWT_SECRET`, `MONGO_URI`, `MONGODB_URI`, `DATABASE_URL`, `STRIPE_SECRET_KEY`, `GOOGLE_CLIENT_SECRET`, `SMTP_PASS`, `AGORA_APP_CERTIFICATE`. Unrelated third-party API keys must not be copied. The server preflight rejects these known risky variables, validates the exact DB host and test origin, and exits BEFORE connecting if any check fails.

Never publish the World passwords in source code, GitHub issues, screenshots or browser bundles. Test accounts are `world-pilot-a@example.invalid` and `world-pilot-b@example.invalid`; these are explicitly synthetic and cannot receive email.

## Readiness gates

1. GitHub CI for current HEAD: backend, real disposable MongoDB integration, frontend lint/tests/build and WebGL browser harness all SUCCESS. Android AAB remains skipped.
2. Render environment variables names and start command inspected, production credentials absent. Only then manually deploy the updated branch to the existing test service.
3. Render /api/health returns `environment:world_test, pilot:isolated`; ordinary payment/Live/register paths return 404. If health returns `World test inactive`, the old diagnostic is still running. If preflight fails, stop and correct the test settings; never temporarily point at production.
4. New Vercel Preview build has branch-only test URLs and `NEXT_PUBLIC_WORLD_TEST_MODE=isolated`. Confirm its login only permits the synthetic test accounts; no Google/Apple; other site routes redirected to the test login. No requests to `meetyoulive.onrender.com`.
5. With two devices, sign in with different synthetic accounts, enter the same World country, confirm same instance, move, travel, reconnect, mutually block and report. Use browser network logs with private data redacted. Do not merge until physical test acceptance.
6. After testing, remove or rotate test credentials and revoke database access when no longer needed; keep production untouched.

The Render service is currently pinned to a **diagnostic start command**. The available Render connector cannot change the start command, and security controls blocked automated injection of test JWT/account credentials. The owner must set these values via Render's authenticated Settings/Environment UI before activating the World backend; this is an explicit blocker, not a reason to turn on full backend/index.js.


## World IA — catálogo aprobado del servidor (desactivado por defecto)

Este avance solo se aplica al servicio **meetyoulive-world-test**, nunca al
backend habitual. No genera mundos, no usa claves World Labs ni compra créditos.

- Al arrancar sin `WORLD_TEST_AI_ASSETS_ENABLED`, el catálogo IA queda vacío;
  las entradas con `scene: "ai"` reciben `AI_SCENE_UNAVAILABLE`.
  Los clientes/protocolos anteriores de World continúan igual.
- Solo después de aprobación expresa del propietario, añadir al **servicio
  de pruebas** un Render Secret File llamado `world-ai-scenes.json`. Render
  lo expone en `/etc/secrets/world-ai-scenes.json` (ruta fija en el código).
  No subir el archivo al repositorio, a un comentario ni a una captura.
- Su estructura debe ser un objeto con `schemaVersion: 1`, `approvedHosts`
  (dominios HTTPS exactos) y `scenes` (lista de registros aprobados).
  Cada registro incluye país, ID real del proveedor, huellas SHA-256 reales
  del SPZ/GLB, URLs autorizadas, escala, offset y manifiesto de navegación
  derivado del **mismo** collider; además de las revisiones de propietario,
  derechos comerciales, entrega y privacidad. **Nunca inventar estos datos.**
- La herramienta de preparación del mapa de navegación está en
  `frontend/lib/vcr/worldAiColliderBake.mjs`. Revisar físicamente las
  colisiones, el punto de aparición y el encaje visual antes de aprobarla.
- Después de verificar la licencia y los archivos con sus hashes reales,
  el operador puede activar `WORLD_TEST_AI_ASSETS_ENABLED=true` únicamente
  en World Test. Si falta el archivo, está corrupto o no coinciden los hashes
  e identificadores, el servidor **rechaza el arranque**.
- Solo las dos cuentas sintéticas autorizadas pueden consultar
  `GET /api/world-ai/scenes/:country`; devuelve el descriptor de activos y
  el mapa filtrado, nunca contraseñas. En Socket.IO, el cliente solicita
  `scene:"ai"` con el ID y los dos hashes del catálogo. El servidor
  comprueba los datos antes de dar entrada; separa instancias del prototipo
  y valida alturas, paredes, velocidad y recorrido con su propio mapa.
- El botón existente del prototipo no solicita todavía `scene:"ai"`.
  Falta integrar el visor real y demostrar un recorrido con el SPZ y GLB
  concretos en Android/iPhone. No fingir que la ruta de metadatos es un mundo
  navegable completo ni habilitar el botón sin prueba física.
- No actualizar Render, entorno de producción ni credenciales antes de
  contar con un mundo licenciado, evidencia de descarga, pruebas y permiso.

Pruebas automatizadas: `worldAiSceneCatalog.test.js`,
`worldAiCatalogFile.test.js` y `vcrWorld.ai.test.js`. Todos los cambios
están limitados al PR #1135 Draft.
