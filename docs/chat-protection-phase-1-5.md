# Chat protection Phase 1.5

Phase 1.5 blocks early attempts to share external contact information in private chat before a message is persisted or emitted.

## Backend flow

`chat.controller.js` keeps the existing authorization and user-block checks first. After idempotency lookup and before `Message.create`, it calls `chatProtection.service.js`.

If contact sharing is restricted, the backend returns:

```json
{
  "code": "CONTACT_SHARING_RESTRICTED",
  "message": "Por seguridad y para proteger la comunidad, todavía no puedes compartir información de contacto. Continúa interactuando en MeetYouLive para desbloquear esta función.",
  "detectedTypes": ["phone"]
}
```

Blocked attempts do not create `Message`, do not update `Chat.lastMessage`, do not emit Socket.io events, do not create notifications, and do not run successful-message tracking.

## Services

- `contactDetection.service.js` normalizes bounded text and detects phones, emails, URLs/domains, and social media/contact handles with linear regexes.
- `chatTrust.service.js` calculates trust server-side. `minimumMessages` is total persisted messages in the conversation. Blocked attempts are not counted because they are not `Message` documents.
- `platformSettings.service.js` reads/writes persistent MongoDB settings without importing admin controllers.
- `chatProtection.service.js` combines settings, detection, trust, and minimal audit logging.

## Persistent settings

`PlatformSettings` stores one global document keyed by `global`. Admin changes apply immediately without redeploy and persist across restarts.

## Audit data

Blocked attempts are stored in `ChatProtectionAttempt` with:

- `senderId`
- `recipientId`
- `chatId`
- `detectedTypes`
- `ruleApplied`
- `source`
- `contentHash`
- timestamps

The complete message text is never stored in this model, `FraudAlert`, logs, or analytics by this implementation.

## Coins and calls

Completed calls and coin spending are read-only trust conditions. Coin spending is calculated from completed negative `CoinTransaction` spend records only; no balances, Stripe data, payouts, or transactions are modified.
