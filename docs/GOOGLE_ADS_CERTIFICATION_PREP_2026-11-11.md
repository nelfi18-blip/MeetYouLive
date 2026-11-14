# MeetYouLive — preparación de certificación Google Ads (11-nov-2026)

**Estado al 12-nov-2026:** Google confirmó recepción de la **solicitud de certificación General Dating and Companionship**. **Pendiente de evaluación; no aprobada ni autorizada para anunciar.** Mantener en el PR Draft existente **#1157** sobre mensajes comerciales verificables, separado del PR R8 #1158, agencias y World. No merge ni publicación sin validación.

## Datos conocidos y verificables

| Campo | Valor |
|---|---|
| Producto | MeetYouLive |
| Operador / entidad legal declarada | MeetYouLive Technologies LLC |
| Canal primario para la campaña inicial | Android / Google Play |
| Package ID | `com.meetyoulive.app` |
| Ficha Google Play | https://play.google.com/store/apps/details?id=com.meetyoulive.app |
| Dominio de la empresa | https://www.meetyoulive.net |
| Versión Android observada en **Producción** por el propietario (captura 11-nov) | 1.0.57, versionCode 57, estado Active, 178 países/regiones seleccionados |
| Restricción prevista | Servicio solo para adultos (18+), con autodeclaración y comprobaciones existentes; validar comportamiento real de acceso durante revisión |
| Estado de Stripe web | Pendiente de revisión; **NO** afirmar que web checkout o retiros están autorizados |
| iOS | No promocionar como publicación aprobada: proceso de revisión/finanzas pendiente |
| World IA | Piloto en PR separado, **NO** representarlo como una experiencia pública disponible |
| Google Ads Customer ID (CID) | **Cuenta identificada por captura del propietario**, valor reservado al expediente privado (no incluirlo en GitHub público) |
| Certificación Google Ads | **Solicitud enviada 12-nov-2026, recepción confirmada; aprobación pendiente** |
| Credenciales de revisión segura | **No verificadas por esta auditoría**; el formulario requería acceso. Nunca copiar contraseñas al repositorio |
| Grabación de revisión app | Propietario informó haber subido ZIP; captura de recepción del formulario confirma envío, no revisión de contenido ni validez del archivo |

## Política de referencia oficial

- https://support.google.com/adspolicy/answer/15328393?hl=en — incluye expresamente *livestream or chat apps whose primary focus is meeting new people*.
- https://support.google.com/adspolicy/answer/6368711?hl=en — explica necesidad de certificación y acceso de prueba.
- https://support.google.com/google-ads/answer/16056245?hl=en — medición de conversiones de apps.
- https://support.google.com/google-ads/answer/6255257?hl=en — conversiones procedentes de Google Play.
- Formulario de solicitud: https://support.google.com/google-ads/contact/dating_and_companionship_ads_certification_application

**No segmentar menores de 18 años**, no promover compensación por encuentros, escort, “sugar dating”, contenido sexual, amistades/usuarios falsos ni recompensas inventadas. Las políticas también restringen edad, país y el contenido de las páginas de destino. Asegurar que el material mostrado en anuncios coincide con pantallas reales.

## Presentación propuesta en inglés para la solicitud (sujeta a comprobación)

> MeetYouLive is a social communication and live-streaming app for adults aged 18 and older. Members can create profiles, discover and connect with other members, send messages, participate in permitted live video experiences, and interact with eligible creators. The app offers optional digital Coins purchases through Google Play on Android for supported in-app digital features. MeetYouLive prohibits paid dating or sexual encounters, escort solicitation, exploitation, deceptive identities, and underage participation. We provide in-app reporting and blocking, with moderation workflows. All statements about availability, purchases, and safety must be verified against the current production app.

No afirmar detección automática universal de vídeo/audio, monitorización 24/7 ni verificación documental del 100 % de usuarios.

## Verificación pública y requisitos exactos del formulario (11-nov-2026)

- **Google Play público confirmado:** https://play.google.com/store/apps/details?id=com.meetyoulive.app muestra botón Install, compras dentro de la app y ficha de MeetYouLive (última actualización visible: 6-nov-2026). La clasificación visible *Mature 17+* es una calificación de contenido de Play y **no sustituye** la regla interna 18+ exigida por Google Ads. Verificar enforcement real durante la prueba.
- **Producción web aún no lista para anuncios:** en https://www.meetyoulive.net/ todavía aparecen afirmaciones "Secure payments with Stripe" y "Payments processed through Stripe", un indicador "● Live" sin comprobación, y la promesa de un minuto. El PR #1157 las corrige en Preview; no dirigir campañas a la web hasta aprobar la prueba visual y autorizar su merge/despliegue. No confundir código Preview con producción.
- **Portada 18+:** el PR #1157 ahora muestra un aviso explícito en ES/EN/PT junto al registro, sin cambiar los controles backend.
- **Cuenta publicitaria:** el CID aparece en capturas del propietario; la certificación fue enviada. El conector Supermetrics muestra autenticación para Google Ads pero al 12-nov **no expone cuentas publicitarias accesibles en el equipo conectado**; no asumir que podamos crear campañas desde la integración.
- **Formulario oficial (revisado):** https://support.google.com/google-ads/contact/dating_and_companionship_ads_certification_application . Exige CID real de cuenta individual, empresa, dominio y/o ID Android, descripción honesta del funcionamiento y acceso de revisión. La solicitud exige confirmar prohibición de menores, citas remuneradas, explotación y perfiles sintéticos engañosos.
- **Revisión interna:** si una parte requiere inicio de sesión, Google solicita credenciales de acceso y grabación auténtica **en ZIP inferior a 20 MB**, mostrando dominio/ID coincidente, inicio/login, post-login, navegación entre TODOS los menús, recorrido completo, medios en reproducción y planes si existen. Nunca subir secretos o sesiones personales a PR público.
- **Importante:** el formulario advierte que después de enviar la solicitud **no se puede volver a aplicar para el mismo CID durante 30 días**. No enviarla incompleta.
- **Clasificación inicial a verificar:** general, "Livestream or chat apps whose primary focus is meeting new people"; contenido sexualizado o sugerente puede cambiar la categoría o impedir la certificación. No seleccionar casillas que no describan el producto real.

### Anuncios de texto propuestos (no activados ni aprobados por Google)

ES (conceptos breves): «MeetYouLive: conecta y chatea»; «Conoce personas en MeetYouLive»; «Descubre transmisiones Live»; «Comunidad para mayores de 18»; «Crea tu perfil y conversa». Descripción: «Conoce personas, conversa y participa en experiencias Live. Servicio para adultos 18+.»

EN: «MeetYouLive: Meet New People»; «Chat and Explore Live Streams»; «Connect on MeetYouLive». Description: «Meet people, chat and discover live experiences. For adults ages 18 and older.»

PT: «MeetYouLive: conheça pessoas»; «Converse e descubra Lives»; «Conecte-se no MeetYouLive». Descrição: «Conheça pessoas, converse e descubra transmissões Live. Apenas para maiores de 18 anos.»

**Destino inicial sugerido:** ficha oficial Google Play de MeetYouLive; evitar un enlace a World IA, Stripe web o VIP. Anuncios solo tras certificación, presupuesto aprobado, prueba real de registro, política 18+ y seguimiento de conversiones confirmado. No inventar métricas, testimonios ni perfiles/usuarios.

## Seguimiento posterior a solicitud — no presentar de nuevo

- [x] Identificar CID real por captura del propietario y **enviar** la solicitud desde el formulario oficial; captura de recepción conservada en conversación, sin insertar datos privados en el repositorio.
- [ ] Confirmar que el contenido de producción, fichas Play, páginas legales y experiencia tras login respetan Google Ads (18+, no paid companionship, tratamiento de Live y perfiles).
- [ ] Revisar la clasificación de la publicidad: *General Dating and Companionship* solo si el contenido real y los anuncios califican; de lo contrario, consultar la categoría correcta.
- [ ] Confirmar que la cuenta de revisión **ingrese realmente** si Google la utiliza; no publicar credenciales en GitHub ni cambiar autenticación en producción.
- [x] El propietario informó haber subido un ZIP y recibió confirmación de recepción; **no se verificó el contenido del ZIP** y Google podría solicitar documentación adicional.
- [ ] Revisar textos de la landing en ES/EN/PT del PR #1157. El cambio elimina declaraciones de cobros Stripe y “Live ahora” no verificadas; CI aprobada en HEAD 101913a2. La visualización móvil/desktop en Preview todavía requiere aceptación.
- [ ] Verificar acceso real de una cuenta no beta a la ficha pública de Google Play y que la lista de países objetivo coincide con los permitidos por Google Ads. La captura del propietario confirma la pista Producción, no certifica todos los territorios para publicidad.
- [ ] Seleccionar una primera campaña pequeña solo después de la certificación y **con presupuesto expresamente aprobado**. Sin contratar, crear o publicar campañas automáticamente.
- [ ] Considerar medición de instalaciones por Google Play. Para eventos adicionales de alta calidad (first_open, compra), revisar primero si el Firebase/GA4 y la vinculación a Ads existen: no inventar eventos ni métricas de ROAS.

## Paquete de anuncios Android (preparación, sin publicar)

**Destino:** ficha oficial `https://play.google.com/store/apps/details?id=com.meetyoulive.app`; objetivo **instalaciones**, no llamadas telefónicas. Google Ads exige certificación previa para esta categoría. País, idioma, gasto y CPI todavía **no autorizados ni seleccionados**.

**Titulares ES (máximo 30 caracteres):**
- MeetYouLive: conoce gente
- Chatea y conecta en vivo
- Descubre personas nuevas
- Explora Lives y perfiles
- MeetYouLive para adultos 18+

**Descripciones ES (máximo 90 caracteres):**
- Conoce personas y conversa en MeetYouLive. Solo para adultos de 18 años o más.
- Explora perfiles y descubre transmisiones en vivo desde tu Android.
- Crea tu perfil gratis y conoce gente a través de chats y experiencias Live.
- Descubre creadores y nuevas experiencias sociales. Disponible en Google Play.
- Conecta a tu ritmo con herramientas para bloquear y denunciar dentro de la app.

Comprobar de nuevo la disponibilidad real de las funciones en la versión Play publicada, y la equivalencia de los elementos visuales. No utilizar fotografías reales de miembros sin autorización ni inventar identidades/testimonios. Las campañas de instalaciones pueden aprovechar vídeos alojados en YouTube e imágenes de capturas autorizadas. No colocar texto de «Instalar» sobre imágenes si vulnera la política de recursos.

**Estado de respuesta externa:** Google abrió expediente de soporte/certificación según correo del 12-nov-2026. El ID exacto de expediente, cuentas de acceso, datos privados y video original se conservan fuera de GitHub. No hay respuesta de aprobación en la bandeja conectada al revisar esta fecha.

**Políticas de referencia:** https://support.google.com/adspolicy/answer/15328393?hl=en ; especificaciones de textos e imágenes: https://support.google.com/google-ads/answer/17091671 y https://support.google.com/google-ads/answer/9948381?hl=en .

## Estrategia inicial sin gasto (borrador)

- Objetivo: instalaciones de Android de usuarios adultos y sus primeras experiencias reales de registro/uso.
- Ángulo creativo: conocer personas reales, chat, Live, comunidad y seguridad sin garantías irreales ni contadores ficticios.
- Mensaje ES propuesto: **«MeetYouLive: conoce personas, conversa y descubre transmisiones en vivo. Solo para mayores de 18 años.»**
- Mensaje EN propuesto: **«MeetYouLive: meet people, chat, and discover live streams. For adults 18+.»**
- Mensaje PT propuesto: **«MeetYouLive: conheça pessoas, converse e descubra transmissões ao vivo. Para maiores de 18 anos.»**
- Estos mensajes son conceptos para revisión, **no anuncios publicados**. No usar fotografías no autorizadas, perfiles ficticios o imágenes fotorrealistas creadas con IA que sugieran personas realmente registradas.

## Límites operativos

La corrección de marketing del PR #1157 es **solo copy/landing**, no cambia Android, Google Play Billing, Stripe, MongoDB, Discover, autenticación, Live, agencia, pagos ni configuración de Google Ads. No usar este PR para crear credenciales de prueba ni modificar sistemas protegidos. Conservar en Draft sin merge.

**Bloqueo de lanzamiento:** esperar la aprobación expresa de Google, verificar permisos y edad 18+ de la app real, validar cuenta de revisión si Google la solicita, corregir cualquier rechazo y aprobar presupuesto antes de activar la campaña. No enviar una segunda solicitud.
