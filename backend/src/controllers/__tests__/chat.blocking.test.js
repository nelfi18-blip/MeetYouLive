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
jest.mock("../../lib/socket.js", () => ({ emitChatMessage: jest.fn() }));
jest.mock("../../lib/photoFields.js", () => ({ withSerializedUserPhotoFields: (_req, user) => user }));

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
    Chat.findOne.mockReturnValue(makeChatQuery(blockedChat));
    Message.findOne.mockReturnValue(makeMessageFindOneQuery(null));
  });

  test("rejects messages after a unilateral block", async () => {
    const res = makeRes();
    await sendMessage({ userId: currentUserId, params: { chatId }, body: { text: "hello" } }, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ message: "No puedes enviar mensajes a este usuario" });
    expect(Message.create).not.toHaveBeenCalled();
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
    Chat.findOne.mockReturnValue(makeChatQuery(openChat));
    Message.findOne.mockReturnValue(makeMessageFindOneQuery(null));
    Chat.findByIdAndUpdate.mockResolvedValue({});
  });

  test("persists a valid clientMessageId with the message", async () => {
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
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ clientMessageId: "client-1" }));
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
