const Chat = require("../../models/Chat.js");
const Message = require("../../models/Message.js");

const currentUserId = "507f1f77bcf86cd799439011";
const otherUserId = "507f1f77bcf86cd799439012";
const chatId = "507f1f77bcf86cd799439013";
const clientMessageId = "550e8400-e29b-41d4-a716-446655440000";

jest.mock("../../models/Chat.js", () => ({
  findOne: jest.fn(),
  findByIdAndUpdate: jest.fn(),
}));

jest.mock("../../models/Message.js", () => ({
  create: jest.fn(),
  find: jest.fn(),
  findOne: jest.fn(),
  findById: jest.fn(),
}));

jest.mock("../../models/User.js", () => ({}));
jest.mock("../../services/missions.service.js", () => ({ trackEvent: jest.fn() }));
jest.mock("../../services/essentialNotification.service.js", () => ({ notifyNewMessage: jest.fn() }));
jest.mock("../../lib/socket.js", () => ({ emitChatMessage: jest.fn() }));
jest.mock("../../lib/photoFields.js", () => ({ withSerializedUserPhotoFields: (_req, user) => user }));
jest.mock("../../services/chatProtection.service.js", () => ({ checkChatMessageProtection: jest.fn() }));

const { trackEvent } = require("../../services/missions.service.js");
const { notifyNewMessage } = require("../../services/essentialNotification.service.js");
const { emitChatMessage } = require("../../lib/socket.js");
const { checkChatMessageProtection } = require("../../services/chatProtection.service.js");
const { sendMessage, getMessages } = require("../chat.controller.js");
const { getChats } = require("../chat.controller.js");

const makeRes = () => {
  const res = {
    status: jest.fn(() => res),
    json: jest.fn(),
  };
  return res;
};

const blockedChat = {
  _id: chatId,
  participants: [
    { _id: currentUserId, blockedUsers: [otherUserId] },
    { _id: otherUserId, blockedUsers: [] },
  ],
};

const openChat = {
  _id: chatId,
  participants: [
    { _id: currentUserId, blockedUsers: [] },
    { _id: otherUserId, blockedUsers: [] },
  ],
};

const makeChatQuery = (value) => ({
  populate: jest.fn().mockResolvedValue(value),
});

const makeMessageFindOneQuery = (value) => ({
  populate: jest.fn().mockResolvedValue(value),
});

describe("chat blocking", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    checkChatMessageProtection.mockResolvedValue({ allowed: true, detectedTypes: [] });
    Chat.findOne.mockReturnValue(makeChatQuery(blockedChat));
    Message.findOne.mockReturnValue(makeMessageFindOneQuery(null));
  });

  test("rejects messages after a unilateral block", async () => {
    const res = makeRes();
    await sendMessage({ userId: currentUserId, params: { chatId }, body: { text: "hello" } }, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ message: "No puedes enviar mensajes a este usuario" });
    expect(Message.create).not.toHaveBeenCalled();
    expect(emitChatMessage).not.toHaveBeenCalled();
    expect(notifyNewMessage).not.toHaveBeenCalled();
    expect(checkChatMessageProtection).not.toHaveBeenCalled();
  });

  test("rejects reading messages after a unilateral block", async () => {
    const res = makeRes();
    await getMessages({ userId: currentUserId, params: { chatId }, query: {} }, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ message: "No puedes ver esta conversación" });
    expect(Message.find).not.toHaveBeenCalled();
  });

  test("hides blocked chats from the chat list", async () => {
    Chat.findOne.mockReset();
    Chat.findOne.mockReturnValue(makeChatQuery(blockedChat));
    Chat.find = jest.fn(() => ({
      populate: jest.fn(() => ({
        populate: jest.fn(() => ({
          sort: jest.fn().mockResolvedValue([blockedChat]),
        })),
      })),
    }));

    const res = makeRes();
    await getChats({ userId: currentUserId }, res);

    expect(res.json).toHaveBeenCalledWith([]);
  });
});

describe("chat message idempotency", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    checkChatMessageProtection.mockResolvedValue({ allowed: true, detectedTypes: [] });
    Chat.findOne.mockReturnValue(makeChatQuery(openChat));
    Message.findOne.mockReturnValue(makeMessageFindOneQuery(null));
    Chat.findByIdAndUpdate.mockResolvedValue({});
    emitChatMessage.mockResolvedValue();
    notifyNewMessage.mockResolvedValue();
    trackEvent.mockResolvedValue();
  });

  test("persists, emits, and notifies a valid normal message", async () => {
    const createdMessage = { _id: "507f1f77bcf86cd799439099" };
    const populatedMessage = {
      _id: createdMessage._id,
      chat: chatId,
      sender: { _id: currentUserId },
      text: "hello",
      clientMessageId,
      toObject() {
        return {
          _id: this._id,
          chat: this.chat,
          sender: this.sender,
          text: this.text,
          clientMessageId: this.clientMessageId,
        };
      },
    };
    Message.create.mockResolvedValue(createdMessage);
    Message.findById.mockReturnValue({ populate: jest.fn().mockResolvedValue(populatedMessage) });

    const res = makeRes();
    await sendMessage(
      { userId: currentUserId, params: { chatId }, body: { text: "hello", clientMessageId } },
      res
    );

    expect(Message.create).toHaveBeenCalledWith({
      chat: chatId,
      sender: currentUserId,
      text: "hello",
      clientMessageId,
    });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ clientMessageId }));
    expect(emitChatMessage).toHaveBeenCalledWith({
      chatId,
      message: expect.objectContaining({ clientMessageId, text: "hello" }),
      senderId: currentUserId,
      participants: openChat.participants,
    });
    expect(notifyNewMessage).toHaveBeenCalledWith({
      chatId,
      messageId: createdMessage._id,
      senderId: currentUserId,
      recipientId: otherUserId,
    });
    expect(trackEvent).toHaveBeenCalledWith(currentUserId, "message");
  });

  test("rejects contact sharing before persisting, emitting, notifying, or tracking", async () => {
    checkChatMessageProtection.mockResolvedValue({
      allowed: false,
      status: 403,
      code: "CONTACT_SHARING_RESTRICTED",
      message: "Por seguridad y para proteger la comunidad, todavía no puedes compartir información de contacto.",
      detectedTypes: ["phone", "social_media"],
    });

    const res = makeRes();
    await sendMessage({ userId: currentUserId, params: { chatId }, body: { text: "whatsapp 555-123-4567" } }, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      code: "CONTACT_SHARING_RESTRICTED",
      message: expect.stringContaining("Por seguridad"),
      detectedTypes: ["phone", "social_media"],
    });
    expect(Message.create).not.toHaveBeenCalled();
    expect(Chat.findByIdAndUpdate).not.toHaveBeenCalled();
    expect(emitChatMessage).not.toHaveBeenCalled();
    expect(notifyNewMessage).not.toHaveBeenCalled();
    expect(trackEvent).not.toHaveBeenCalled();
  });

  test("returns an existing message when clientMessageId was already processed", async () => {
    const existingMessageId = "507f1f77bcf86cd799439098";
    const populatedMessage = {
      _id: existingMessageId,
      chat: chatId,
      sender: { _id: currentUserId },
      text: "hello",
      clientMessageId,
      toObject() {
        return {
          _id: this._id,
          chat: this.chat,
          sender: this.sender,
          text: this.text,
          clientMessageId: this.clientMessageId,
        };
      },
    };
    Message.findOne.mockReturnValue(makeMessageFindOneQuery(populatedMessage));

    const res = makeRes();
    await sendMessage({ userId: currentUserId, params: { chatId }, body: { text: "hello", clientMessageId } }, res);

    expect(Message.create).not.toHaveBeenCalled();
    expect(Chat.findByIdAndUpdate).not.toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ _id: existingMessageId }));
  });
});
