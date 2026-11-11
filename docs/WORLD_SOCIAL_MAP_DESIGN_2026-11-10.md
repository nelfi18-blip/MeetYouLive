# MeetYouLive World — mapa social global como puerta de entrada

**Decisión del propietario (10-nov-2026):** el primer nivel de `World` será un **mapa social mundial interactivo** inspirado en la navegación visual de las capturas compartidas de Bumpy: fotografías de perfiles con consentimiento, bandera de país, búsqueda y zoom. Desde el mismo mapa se accederá a un segundo nivel de **mundo inmersivo realista** con movimiento, convivencia y, posteriormente, IA contextual. La referencia es de concepto/flujo, **no se copiarán marca, logos, imágenes, iconos privativos ni diseño exacto**.

**Estado de este documento:** especificación aprobada de producto, **NO implementación del mapa** y NO evidencia de lanzamiento. Solo se documenta en el PR Draft existente **#1135**, rama `feat/vcr-horizon-3d-world`. Conservar los avances, pruebas y restricciones de [WORLD_ACCEPTANCE_2026-11-09.md](WORLD_ACCEPTANCE_2026-11-09.md) y [VCR_WORLD.md](VCR_WORLD.md). No fusionar, desplegar, crear PR paralelo, alterar producción ni tocar el flujo estable de Discover, pagos, autenticación, Lives o perfiles como efecto colateral.

## Flujo de usuario aprobado

1. **Abrir World** desde el menú actual `/vcr`: mostrar **Mapa global** como vista inicial, optimizada para móvil, con zoom y desplazamiento, sin obligar a cargar WebGL/3D ni unirse a una instancia Socket.IO.
2. **Explorar el mapa:** ver solo perfiles reales elegibles que hayan aceptado aparecer públicamente en World, representados por círculos con su imagen de perfil **pública y vigente**. Banderas/etiquetas indican el país escogido para mostrar, no una geolocalización verificada a nivel de calle. Agrupar puntos cuando haya muchas personas; sin contadores, likes, actividad ni iconos inventados.
3. **Seleccionar país o región:** centrar mapa y filtrar perfiles (no cambiar el país de residencia real ni los filtros de Discover). Si no hay perfiles autorizados, mostrar un estado vacío honesto y la opción de explorar otra zona.
4. **Tocar persona:** abrir una tarjeta de vista previa con nombre e imagen permitidos, país general y botones a rutas ya existentes del **perfil**; las opciones de chat/llamada solo aparecerán según permisos y reglas actuales, sin saltarse bloqueos, aceptación o restricciones. No inferir interés romántico.
5. **«Mostrarme en el mapa»**: decisión **voluntaria, separada y reversible**. Desactivada por defecto. Explicar que otros usuarios podrán descubrir el perfil en un país/área aproximados; permitir ocultarlo inmediatamente. No usar GPS preciso ni publicar latitud/longitud.
6. **«Entrar al mundo»**: desde un país compatible, intentar la ruta inmersiva existente sin cambiar su protocolo. Los seis destinos pilotos actuales son `us`, `fr`, `jp`, `ae`, `br` y `eg`. El mapa cubre más países que los mundos inmersivos disponibles; no prometer que todos tienen escenarios. Si no existe escena aprobada, ofrecer información honesta, sin sustituirla automáticamente por decorados procedurales.
7. **Volver** desde el mundo inmersivo al mapa con el país/zoom previo preservado localmente; al salir o perder acceso limpiar presencia, fotos y solicitudes en curso.

## Pantalla / UX móvil (concepto, no mockup implementado)

- Encabezado compacto: **World** y controles **Buscar país**, **Filtros**, **Privacidad**.
- Área principal: mapa prácticamente a pantalla completa; círculos fotográficos con borde visual neutro, banderas y distintivos **solo si realmente están verificados**. Evitar saturación, superposición y exposición accidental de perfiles.
- Panel inferior contextual: **Explorar personas**, **Mostrarme en el mapa** (con explicación de consentimiento), **Entrar al mundo** (solo cuando un destino está seleccionado y existe una experiencia permitida).
- Perfil al tocar pin: ficha modal o panel deslizante con cerrar, ver perfil y acciones autorizadas; navegación accesible para lector de pantalla y controles táctiles >=44px.
- ES/EN/PT, móvil Android/iOS/web, modo oscuro integrado con MeetYouLive, compatibilidad con `safe-area`, bajo consumo de batería y carga diferida.
- Estados obligatorios: cargando, sin perfiles, sin permiso de visibilidad, conexión fallida/reintentar, usuario bloqueado, país sin mundo inmersivo, escena no aprobada. Nunca llenar vacíos con datos, fotografías o personas sintéticas en producción.

## Privacidad, seguridad y datos reales

- No introducir la ubicación GPS actual exacta ni coordenadas de dispositivo en respuestas del mapa. Un pin no debe representar la posición de casa, empleo o trayectoria de viaje. Mostrar **ubicación aproximada autorizada**, preferentemente un punto determinístico de centro de país/región sin coordenadas privadas; no usar dispersión tan pequeña que pueda reidentificar.
- Un país introducido manualmente es **país seleccionado para aparecer/buscar**, nunca afirmación de GPS verificado. La búsqueda remota no mueve la ubicación de la persona. La ubicación real del perfil y ajustes de Discover siguen independientes.
- Aplicar backend: adulto elegible (18+ conforme a las reglas vigentes), perfil público autorizado, foto pública vigente, bloqueo bidireccional, restricciones/suspensiones, eliminación y revocación. No filtrar perfiles privados/inactivos ni cuentas no elegibles.
- `worldMapVisible` sería una preferencia de **opt-in explícito** propia de World; no reutilizar automáticamente consentimiento GPS ni visibilidad de Discover. Cambio a «oculto» deja de devolver el perfil y expira cachés/snapshots; probar revocación entre dispositivos.
- La foto mostrada debe corresponder a la foto pública auténtica autorizada, con URL firmada/segura cuando aplique. Sin raspar imágenes ni reutilizarlas para entrenamiento de IA.
- No mostrar «en línea», «transmitiendo», corazones, regalos o notificaciones salvo evidencia reciente y exacta del backend. No interpretar `updatedAt` como actividad ni mostrar indicadores falsos.
- Respuestas paginadas, antirraspado y rate limits; no entregar un listado ilimitado de usuarios ni ubicaciones sensibles. Conteos solo si son reales, con privacidad y umbrales adecuados.

## Arquitectura recomendada (sujeta a revisión técnica)

- Integrar la nueva vista **dentro de `frontend/app/vcr/page.jsx`** como entrada `Mapa`, dejando `PhotoWorld`, `WalkableWorld`, `AiWalkableWorld` y la salida sin regresiones. No sustituir automáticamente los escenarios o las escenas IA.
- Componente independiente `WorldSocialMap`, de carga diferida; separar la librería de mapa 2D del renderer WebGL del mundo. No añadir proveedor de mapas ni coste hasta evaluar precio/licencia, términos de uso, atribución, privacidad y funcionamiento móvil.
- Fuente de perfiles: endpoint backend **específico de World**, autenticado, seguro, paginado, filtrado en el servidor por elegibilidad/bloqueo/consentimiento, con país/región aprobados. **No existe hoy un endpoint validado para poblar este mapa; no asumir que `/api/user/discover` o `/vcr` son sustitutos.**
- La presencia actual `/vcr` es por instancia y debe quedar reservada al mundo inmersivo; no usarla para fabricar usuarios repartidos por el globo. No cambiar Socket.IO compartido, JWT ni auth sin revisión y autorización.
- Cache corta y invalidación por revocación; límite de puntos/cluster y paginación durante zoom/búsqueda; sensible a bloqueo y cambio de país. Red y API abortables al desmontar o cambiar filtros.
- Progresión: (A) especificación; (B) vista mapa con datos reales/autorizados en Preview aislada; (C) detalles/acciones de perfiles sin saltar seguridad; (D) integración a mundos aprobados; (E) experiencias inmersivas e IA cuando se aprueben activos, licencias y costes.

## Criterios de aceptación: no declarar «listo» antes de estas evidencias

1. Un usuario **sin opt-in** nunca aparece en el mapa. Opt-in, opt-out y bloqueo aplican inmediatamente a dos cuentas de prueba y a cachés; sin coordenadas reales filtradas por API/HTML/telemetría.
2. Cada perfil mostrado proviene de una cuenta real elegible y una foto pública autorizada. Con 0 resultados aparece un estado vacío verdadero, no perfiles inventados.
3. Zoom, pan, búsqueda de país, clusters, apertura/cierre de ficha, retorno al mapa y navegación funcionan sin desbordamiento en Chrome Android/Safari iPhone; también teclado y lector de pantalla.
4. Carga del mapa no conecta innecesariamente `/vcr` ni precarga escenas volumétricas; memoria y batería verificadas en teléfonos reales.
5. Abrir perfil y acciones existentes respeta autenticación, bloqueos, roles y permisos, sin alterar Discover, pagos, Live ni notificaciones existentes.
6. «Entrar al mundo» pasa al flujo `PhotoWorld`/escena aprobada sin falsa disponibilidad, redirección a producción ni cambio de origen; fallo 401/403/404/500 se maneja sin contenido engañoso.
7. ES/EN/PT, privacidad, estados vacíos, regresiones frontend/backend/integ Mongo y CI del **nuevo HEAD** aprobados. Evidencia física de dos teléfonos y autorización expresa antes de considerar merge/deploy.

## Orden de prioridad del negocio

La dirección de diseño queda documentada y conservada; **no desplazar la finalización/monetización de MeetYouLive Android ni la promoción por Google**. World inmersivo e IA no bloquean el lanzamiento comercial ya en curso. No se crea una rama adicional, no se aprueban compras ni se activan servicios externos.
