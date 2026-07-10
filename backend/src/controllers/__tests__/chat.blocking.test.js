const Chat = require("../../models/Chat.js");
const Message = require("../../models/Message.js");

const currentUserId = "507f1f77bcf86cd799439011";
const otherUserId = "507f1f77bcf86cd799439012";
const chatId = "507f1f77bcf86cd799439013";

jest.mock("../../models/Chat.js", () => ({
  findOne: jest.fn(),
  findByIdAndUpdate: jest.fn(),
}));

jest.mock("../../models/Message.js", () => ({
  create: jest.fn(),
  find: jest.fn(),
}));

jest.mock("../../models/User.js", () => ({}));
jest.mock("../../services/missions.service.js", () => ({ trackEvent: jest.fn() }));
jest.mock("../../lib/socket.js", () => ({ emitChatMessage: jest.fn() }));
jest.mock("../../lib/photoFields.js", () => ({ withSerializedUserPhotoFields: (_req, user) => user }));

const { sendMessage, getMessages } = require("../chat.controller.js");

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

const makeChatQuery = (value) => ({
  populate: jest.fn().mockResolvedValue(value),
});

describe("chat blocking", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Chat.findOne.mockReturnValue(makeChatQuery(blockedChat));
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
});
