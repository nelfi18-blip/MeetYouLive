const User = require("../models/User.js");
const mongoose = require("mongoose");
const { createNotification } = require("./notification.service.js");
const { sendTransactionalNotificationEmail } = require("./email.service.js");
const { sendPush } = require("../lib/fcm.js");
const { isUserInChatRoom } = require("../lib/socket.js");

const SUPPORTED_LANGS = new Set(["es", "en", "pt"]);
const LEGACY_PUSH_CATEGORIES = new Set(["match", "like", "live", "reward"]);

const MESSAGES = {
  new_message: {
    es: {
      title: "Nuevo mensaje",
      body: "Tienes un nuevo mensaje en MeetYouLive.",
    },
    en: {
      title: "New message",
      body: "You have a new message on MeetYouLive.",
    },
    pt: {
      title: "Nova mensagem",
      body: "Você tem uma nova mensagem no MeetYouLive.",
    },
  },
  call_incoming: {
    es: { title: "Llamada entrante", body: "Tienes una llamada entrante en MeetYouLive." },
    en: { title: "Incoming call", body: "You have an incoming call on MeetYouLive." },
    pt: { title: "Chamada recebida", body: "Você tem uma chamada recebida no MeetYouLive." },
  },
  call_missed: {
    es: { title: "Llamada perdida", body: "Perdiste una llamada en MeetYouLive." },
    en: { title: "Missed call", body: "You missed a call on MeetYouLive." },
    pt: { title: "Chamada perdida", body: "Você perdeu uma chamada no MeetYouLive." },
  },
  coins_purchase_confirmed: {
    es: ({ coins, balance, reference }) => ({
      title: "Compra de Coins confirmada",
      body: `Tu compra fue confirmada. Se acreditaron ${coins} Coins.${balance != null ? ` Nuevo balance: ${balance} Coins.` : ""} Referencia: ${reference}.`,
    }),
    en: ({ coins, balance, reference }) => ({
      title: "Coins purchase confirmed",
      body: `Your purchase was confirmed. ${coins} Coins were credited.${balance != null ? ` New balance: ${balance} Coins.` : ""} Reference: ${reference}.`,
    }),
    pt: ({ coins, balance, reference }) => ({
      title: "Compra de Coins confirmada",
      body: `Sua compra foi confirmada. ${coins} Coins foram creditadas.${balance != null ? ` Novo saldo: ${balance} Coins.` : ""} Referência: ${reference}.`,
    }),
  },
  subscription_activated: {
    es: ({ plan }) => ({ title: `${plan} activado`, body: `Tu plan ${plan} está activo.` }),
    en: ({ plan }) => ({ title: `${plan} activated`, body: `Your ${plan} plan is active.` }),
    pt: ({ plan }) => ({ title: `${plan} ativado`, body: `Seu plano ${plan} está ativo.` }),
  },
  subscription_renewed: {
    es: ({ plan }) => ({ title: `${plan} renovado`, body: `Tu plan ${plan} fue renovado correctamente.` }),
    en: ({ plan }) => ({ title: `${plan} renewed`, body: `Your ${plan} plan was renewed successfully.` }),
    pt: ({ plan }) => ({ title: `${plan} renovado`, body: `Seu plano ${plan} foi renovado com sucesso.` }),
  },
  subscription_canceled: {
    es: ({ plan }) => ({ title: `${plan} cancelado`, body: `Tu plan ${plan} fue cancelado.` }),
    en: ({ plan }) => ({ title: `${plan} canceled`, body: `Your ${plan} plan was canceled.` }),
    pt: ({ plan }) => ({ title: `${plan} cancelado`, body: `Seu plano ${plan} foi cancelado.` }),
  },
  subscription_payment_failed: {
    es: ({ plan }) => ({ title: `Pago de ${plan} fallido`, body: `No pudimos confirmar el pago de tu plan ${plan}.` }),
    en: ({ plan }) => ({ title: `${plan} payment failed`, body: `We could not confirm payment for your ${plan} plan.` }),
    pt: ({ plan }) => ({ title: `Pagamento do ${plan} falhou`, body: `Não conseguimos confirmar o pagamento do seu plano ${plan}.` }),
  },
  creator_approved: {
    es: { title: "Solicitud de creador aprobada", body: "Tu solicitud para convertirte en creador fue aprobada." },
    en: { title: "Creator request approved", body: "Your request to become a creator was approved." },
    pt: { title: "Solicitação de criador aprovada", body: "Sua solicitação para se tornar criador foi aprovada." },
  },
  creator_rejected: {
    es: { title: "Solicitud de creador no aprobada", body: "Tu solicitud para convertirte en creador no fue aprobada." },
    en: { title: "Creator request not approved", body: "Your request to become a creator was not approved." },
    pt: { title: "Solicitação de criador não aprovada", body: "Sua solicitação para se tornar criador não foi aprovada." },
  },
  withdrawal_requested: {
    es: ({ coins, date }) => ({ title: "Retiro solicitado", body: `Tu solicitud de retiro por ${coins} Coins fue creada el ${date}. Revisaremos la solicitud.` }),
    en: ({ coins, date }) => ({ title: "Withdrawal requested", body: `Your withdrawal request for ${coins} Coins was created on ${date}. We will review it.` }),
    pt: ({ coins, date }) => ({ title: "Saque solicitado", body: `Sua solicitação de saque de ${coins} Coins foi criada em ${date}. Vamos analisá-la.` }),
  },
  withdrawal_approved: {
    es: ({ coins, date }) => ({ title: "Retiro aprobado", body: `Tu retiro por ${coins} Coins fue aprobado el ${date}. El pago será procesado manualmente.` }),
    en: ({ coins, date }) => ({ title: "Withdrawal approved", body: `Your withdrawal for ${coins} Coins was approved on ${date}. Payment will be processed manually.` }),
    pt: ({ coins, date }) => ({ title: "Saque aprovado", body: `Seu saque de ${coins} Coins foi aprovado em ${date}. O pagamento será processado manualmente.` }),
  },
  withdrawal_rejected: {
    es: ({ coins, date }) => ({ title: "Retiro rechazado", body: `Tu retiro por ${coins} Coins fue rechazado el ${date}. Las Coins fueron restauradas a tu balance.` }),
    en: ({ coins, date }) => ({ title: "Withdrawal rejected", body: `Your withdrawal for ${coins} Coins was rejected on ${date}. The Coins were restored to your balance.` }),
    pt: ({ coins, date }) => ({ title: "Saque rejeitado", body: `Seu saque de ${coins} Coins foi rejeitado em ${date}. As Coins foram restauradas ao seu saldo.` }),
  },
};

const normalizeLang = (lang) => (SUPPORTED_LANGS.has(lang) ? lang : "en");
const openLabel = (lang) => ({ es: "Abrir MeetYouLive", en: "Open MeetYouLive", pt: "Abrir MeetYouLive" }[normalizeLang(lang)]);
const normalizeObjectId = (value) => {
  const id = String(value || "");
  return mongoose.Types.ObjectId.isValid(id) ? id : null;
};

const translate = (type, lang, vars = {}) => {
  const entry = MESSAGES[type];
  const value = entry?.[normalizeLang(lang)] || entry?.en;
  return typeof value === "function" ? value(vars) : value;
};

const appUrl = (path) => `${process.env.FRONTEND_URL || "http://localhost:3000"}${path}`;

const isSelfAction = (actorId, targetId) => String(actorId) === String(targetId);

const hasBlockBetween = (recipient, actorId) => {
  if (!recipient || !actorId) return false;
  const actor = String(actorId);
  return Array.isArray(recipient.blockedUsers) && recipient.blockedUsers.some((id) => String(id) === actor);
};

const shouldSendPush = (user, category, critical = false) => {
  if (!user?.pushToken) return false;
  if (critical) return true;
  const settings = user.pushSettings || {};
  if (settings.enabled === false) return false;
  const categories = Array.isArray(settings.categories) ? settings.categories : [];
  if (categories.includes(category)) return true;
  if (LEGACY_PUSH_CATEGORIES.has(category)) return false;
  return true;
};

const deliver = async ({
  user,
  type,
  vars = {},
  data = {},
  dedupeKey,
  inApp = true,
  push = false,
  email = false,
  pushCategory = null,
  critical = false,
}) => {
  if (!user?._id || !type) return { notification: null, emailSent: false, pushSent: false };
  const lang = normalizeLang(user.preferredLanguage);
  const text = translate(type, lang, vars);
  if (!text) return { notification: null, emailSent: false, pushSent: false };

  let notification = null;
  if (inApp) {
    notification = await createNotification(user._id, {
      type,
      title: text.title,
      message: text.body,
      data,
      dedupeKey,
    });
    if (dedupeKey && notification && notification.wasNewNotification === false) {
      return { notification, emailSent: false, pushSent: false, duplicate: true };
    }
  }

  let pushSent = false;
  if (push && shouldSendPush(user, pushCategory || type, critical)) {
    try {
      await sendPush(user._id, user.pushToken, text.title, text.body, data);
      pushSent = true;
    } catch (err) {
      console.error("[essential-notifications] Push delivery failed", {
        userId: String(user._id),
        type,
        message: err?.message || "Unknown push error",
      });
    }
  }

  let emailSent = false;
  if (email && user.email) {
    try {
      await sendTransactionalNotificationEmail(user.email, {
        subject: `${text.title} — MeetYouLive`,
        text: text.body,
        ctaUrl: data?.link ? appUrl(data.link) : null,
        ctaLabel: data?.ctaLabel || openLabel(lang),
      });
      emailSent = true;
    } catch (err) {
      console.error("[essential-notifications] Email delivery failed", {
        userId: String(user._id),
        type,
        code: err?.code || "EMAIL_DELIVERY_FAILED",
        message: err?.message || "Unknown email error",
      });
    }
  }

  return { notification, emailSent, pushSent };
};

const notifyNewMessage = async ({ chatId, messageId, senderId, recipientId }) => {
  const safeSenderId = normalizeObjectId(senderId);
  const safeRecipientId = normalizeObjectId(recipientId);
  const safeMessageId = normalizeObjectId(messageId);
  const safeChatId = normalizeObjectId(chatId);
  if (!safeChatId || !safeMessageId || !safeSenderId || !safeRecipientId || isSelfAction(safeSenderId, safeRecipientId)) return null;
  const [sender, recipient] = await Promise.all([
    User.findById(safeSenderId).select("_id blockedUsers").lean(),
    User.findById(safeRecipientId).select("_id email preferredLanguage pushToken pushSettings blockedUsers").lean(),
  ]);
  if (!sender || !recipient) return null;
  if (hasBlockBetween(recipient, safeSenderId) || hasBlockBetween(sender, safeRecipientId)) return null;
  const link = `/chats/${safeChatId}`;
  return deliver({
    user: recipient,
    type: "new_message",
    data: { chatId: safeChatId, messageId: safeMessageId, senderId: safeSenderId, link },
    dedupeKey: `message:${safeMessageId}`,
    inApp: true,
    push: !isUserInChatRoom(safeRecipientId, safeChatId),
    pushCategory: "message",
  });
};

const notifyIncomingCall = async ({ callId, callerId, recipientId }) => {
  const safeCallId = normalizeObjectId(callId);
  const safeCallerId = normalizeObjectId(callerId);
  const safeRecipientId = normalizeObjectId(recipientId);
  if (!safeCallId || !safeCallerId || !safeRecipientId || isSelfAction(safeCallerId, safeRecipientId)) return null;
  const [caller, recipient] = await Promise.all([
    User.findById(safeCallerId).select("_id blockedUsers").lean(),
    User.findById(safeRecipientId).select("_id preferredLanguage pushToken pushSettings blockedUsers").lean(),
  ]);
  if (!caller || !recipient) return null;
  if (hasBlockBetween(recipient, safeCallerId) || hasBlockBetween(caller, safeRecipientId)) return null;
  return deliver({
    user: recipient,
    type: "call_incoming",
    data: { callId: safeCallId, callerId: safeCallerId, link: `/call/${safeCallId}` },
    dedupeKey: `call:${safeCallId}:incoming`,
    inApp: true,
    push: true,
    pushCategory: "call",
  });
};

const notifyMissedCall = async ({ callId, callerId, recipientId }) => {
  const safeCallId = normalizeObjectId(callId);
  const safeCallerId = normalizeObjectId(callerId);
  const safeRecipientId = normalizeObjectId(recipientId);
  if (!safeCallId || !safeCallerId || !safeRecipientId || isSelfAction(safeCallerId, safeRecipientId)) return null;
  const recipient = await User.findById(safeRecipientId)
    .select("_id preferredLanguage pushToken pushSettings blockedUsers")
    .lean();
  if (!recipient || hasBlockBetween(recipient, safeCallerId)) return null;
  return deliver({
    user: recipient,
    type: "call_missed",
    data: { callId: safeCallId, callerId: safeCallerId, link: "/calls" },
    dedupeKey: `call:${safeCallId}:missed`,
    inApp: true,
    push: true,
    pushCategory: "call",
  });
};

const notifyCoinsPurchaseConfirmed = async ({ userId, coins, balance, reference }) => {
  const safeUserId = normalizeObjectId(userId);
  if (!safeUserId) return null;
  const user = await User.findById(safeUserId).select("_id email preferredLanguage").lean();
  return deliver({
    user,
    type: "coins_purchase_confirmed",
    vars: { coins, balance, reference },
    data: { coins: String(coins), ...(balance != null ? { balance: String(balance) } : {}), reference: String(reference), link: "/coins" },
    dedupeKey: `coins:${reference}`,
    inApp: true,
    email: true,
    critical: true,
  });
};

const notifySubscription = async ({ userId, action, plan, eventId, subscriptionId }) => {
  const safeUserId = normalizeObjectId(userId);
  if (!safeUserId) return null;
  const user = await User.findById(safeUserId).select("_id email preferredLanguage").lean();
  return deliver({
    user,
    type: `subscription_${action}`,
    vars: { plan },
    data: { plan, ...(subscriptionId ? { subscriptionId: String(subscriptionId) } : {}), link: "/vip" },
    dedupeKey: `subscription:${eventId || `${subscriptionId}:${action}`}`,
    inApp: true,
    email: true,
    critical: true,
  });
};

const notifyCreatorDecision = async ({ userId, approved }) => {
  const safeUserId = normalizeObjectId(userId);
  if (!safeUserId) return null;
  const user = await User.findById(safeUserId).select("_id email preferredLanguage pushToken pushSettings").lean();
  return deliver({
    user,
    type: approved ? "creator_approved" : "creator_rejected",
    data: { link: approved ? "/dashboard/creator" : "/creator-request" },
    dedupeKey: `creator:${safeUserId}:${approved ? "approved" : "rejected"}`,
    inApp: true,
    push: true,
    email: true,
    pushCategory: "creator",
  });
};

const notifyWithdrawal = async ({ userId, withdrawalId, status, amountCoins, date }) => {
  const safeUserId = normalizeObjectId(userId);
  if (!safeUserId) return null;
  const user = await User.findById(safeUserId).select("_id email preferredLanguage pushToken pushSettings").lean();
  return deliver({
    user,
    type: `withdrawal_${status}`,
    vars: { coins: amountCoins, date },
    data: { withdrawalId: String(withdrawalId), status, amountCoins: String(amountCoins), link: "/wallet" },
    dedupeKey: `withdrawal:${withdrawalId}:${status}`,
    inApp: true,
    push: status !== "requested",
    email: true,
    pushCategory: "withdrawal",
    critical: true,
  });
};

module.exports = {
  normalizeLang,
  translate,
  shouldSendPush,
  notifyNewMessage,
  notifyIncomingCall,
  notifyMissedCall,
  notifyCoinsPurchaseConfirmed,
  notifySubscription,
  notifyCreatorDecision,
  notifyWithdrawal,
};
