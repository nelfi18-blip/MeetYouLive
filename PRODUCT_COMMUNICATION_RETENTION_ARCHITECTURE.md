# Arquitectura oficial del producto – Comunicación y retención de usuarios

Este documento define la dirección oficial de MeetYouLive. No implementar toda la lógica en este PR. Cada fase deberá abordarse en PRs separados y acotados, utilizando este documento como guía para las próximas fases del desarrollo.

## Objetivo

MeetYouLive no es únicamente una aplicación de citas.

Es una plataforma social donde los usuarios pueden conocerse, chatear, realizar llamadas, videollamadas, disfrutar de directos, apoyar a creadores y participar en experiencias interactivas, manteniendo la mayor parte de la interacción dentro de la plataforma.

## Usuarios normales

Después de un Match podrán utilizar:

- Chat.
- Llamadas de voz (fase futura).
- Videollamadas (fase futura).
- Mensajes de voz (fase futura).
- Envío de imágenes (fase futura).

Durante las primeras interacciones el sistema deberá proteger automáticamente contra el intercambio de:

- Teléfonos.
- Correos electrónicos.
- WhatsApp.
- Telegram.
- Instagram.
- TikTok.
- Discord.
- URLs externas.

En futuras fases podrá existir un mecanismo de desbloqueo de contacto únicamente cuando exista suficiente confianza entre ambos usuarios.

## Cuentas de creador

Las cuentas de creador tienen reglas diferentes.

Su objetivo es construir comunidad y monetizar dentro de MeetYouLive.

Los creadores no deberán utilizar la plataforma para redirigir usuarios hacia servicios externos.

No deberán compartirse:

- Teléfonos.
- WhatsApp.
- Telegram.
- Instagram.
- TikTok.
- Correos electrónicos.
- Enlaces externos.
- Métodos de pago externos.

Toda la interacción premium deberá realizarse dentro de MeetYouLive.

## Videollamadas

Las llamadas sociales estarán disponibles únicamente entre usuarios que tengan Match.

Las reglas de duración deberán ser configurables desde la plataforma en futuras fases, sin modificar código.

No mostrar límites de tiempo al iniciar una llamada.

Si existe una finalización automática, deberá mostrarse únicamente un mensaje elegante al finalizar la sesión.

## Próximas fases

1. Chat Premium (completado).
2. Llamadas de voz.
3. Videollamadas.
4. Mensajes de voz.
5. Envío de imágenes.
6. Regalos durante llamadas y chat.
7. Batallas entre creadores.
8. Eventos en vivo.
9. Monetización avanzada.
10. IA y experiencias inmersivas.

## Restricciones

No modificar en este PR:

- Feed.
- Perfil.
- Likes.
- Matches.
- Auth.
- Google Login.
- Stripe.
- Coins.
- Monetización existente.
- Admin.
- Live.
- Cloudinary.
- Base de datos.
- Contratos actuales de la API.

## Decisiones abiertas para futuras fases

Antes de implementar las protecciones de contacto, deberá definirse desde producto qué cuenta como "primeras interacciones" y cuál es el criterio de confianza que permite relajar o desbloquear restricciones.

Antes de implementar reglas de duración para llamadas sociales, deberá definirse dónde se administran esas reglas dentro de la plataforma para que puedan actualizarse sin modificar código.

Este documento define únicamente la dirección oficial del producto y deberá servir como referencia para las siguientes fases del desarrollo.
