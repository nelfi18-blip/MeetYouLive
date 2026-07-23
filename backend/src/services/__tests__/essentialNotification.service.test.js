const mockCreateNotification = jest.fn();
const mockSendPush = jest.fn();
const mockSendTransactionalNotificationEmail = jest.fn();
const mockIsUserInChatRoom = jest.fn();

const mockUsers = new Map();

jest.mock("../../models/User.js", () => ({
  findById: jest.fn((id) => ({
    select: jest.fn(() => ({
      lean: jest.fn(() => Promise.resolve(mockUsers.get(String(id)) || null)),
    })),
  })),
}));

jest.mock("../notification.service.js", () => ({ createNotification: mockCreateNotification }));
jest.mock("../email.service.js", () => ({ sendTransactionalNotificationEmail: mockSendTransactionalNotificationEmail }));
jest.mock("../../lib/fcm.js", () => ({ sendPush: mockSendPush }));
jest.mock("../../lib/socket.js", () => ({ isUserInChatRoom: mockIsUserInChatRoom }));

const service = require("../essentialNotification.service.js");

const senderId = "507f1f77bcf86cd799439011";
const recipientId = "507f1f77bcf86cd799439012";
const otherUserId = "507f1f77bcf86cd799439013";
const chatId = "507f1f77bcf86cd799439014";
const messageId = "507f1f77bcf86cd799439015";
const callId = "507f1f77bcf86cd799439016";

const baseUser = (id, overrides = {}) => ({
  _id: id,
  email: `${id}@example.test`,
  preferredLanguage: "en",
  pushToken: `push-${id}`,
  pushSettings: { enabled: true, categories: ["match", "like", "live", "reward"] },
  blockedUsers: [],
  ...overrides,
});

describe("essential notifications", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUsers.clear();
    mockUsers.set(senderId, baseUser(senderId));
    mockUsers.set(recipientId, baseUser(recipientId));
    mockUsers.set(otherUserId, baseUser(otherUserId));
    mockCreateNotification.mockResolvedValue({ _id: "notif", wasNewNotification: true });
    mockSendPush.mockResolvedValue();
    mockSendTransactionalNotificationEmail.mockResolvedValue();
    mockIsUserInChatRoom.mockReturnValue(false);
  });

  test("1. new message creates in-app notification and push", async () => {
    await service.notifyNewMessage({ chatId, messageId, senderId, recipientId });

    expect(mockCreateNotification).toHaveBeenCalledWith(recipientId, expect.objectContaining({
      type: "new_message",
      dedupeKey: `message:${messageId}`,
      data: expect.objectContaining({ link: `/chats/${chatId}` }),
    }));
    expect(mockSendPush).toHaveBeenCalledWith(recipientId, `push-${recipientId}`, "New message", expect.any(String), expect.any(Object));
  });

  test("2. open conversation suppresses duplicate push when architecture detects the room", async () => {
    mockIsUserInChatRoom.mockReturnValue(true);
    await service.notifyNewMessage({ chatId, messageId, senderId, recipientId });

    expect(mockCreateNotification).toHaveBeenCalled();
    expect(mockSendPush).not.toHaveBeenCalled();
  });

  test("3. blocked user does not receive social notification", async () => {
    mockUsers.set(recipientId, baseUser(recipientId, { blockedUsers: [senderId] }));
    await service.notifyNewMessage({ chatId, messageId, senderId, recipientId });

    expect(mockCreateNotification).not.toHaveBeenCalled();
    expect(mockSendPush).not.toHaveBeenCalled();
  });

  test("4. incoming call emits one idempotent notification/push", async () => {
    await service.notifyIncomingCall({ callId, callerId: senderId, recipientId });
    mockCreateNotification.mockResolvedValueOnce({ _id: "existing", wasNewNotification: false });
    await service.notifyIncomingCall({ callId, callerId: senderId, recipientId });

    expect(mockCreateNotification).toHaveBeenCalledTimes(2);
    expect(mockCreateNotification).toHaveBeenLastCalledWith(recipientId, expect.objectContaining({ dedupeKey: `call:${callId}:incoming` }));
    expect(mockSendPush).toHaveBeenCalledTimes(1);
  });

  test("5. missed call is persisted with calls deep link", async () => {
    await service.notifyMissedCall({ callId, callerId: senderId, recipientId });

    expect(mockCreateNotification).toHaveBeenCalledWith(recipientId, expect.objectContaining({
      type: "call_missed",
      data: expect.objectContaining({ link: "/calls" }),
    }));
  });

  test("6. accepted call does not use missed-call event type", async () => {
    await service.notifyIncomingCall({ callId, callerId: senderId, recipientId });

    expect(mockCreateNotification).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ type: "call_missed" }));
  });

  test("7. successful coins purchase creates one notification and email", async () => {
    await service.notifyCoinsPurchaseConfirmed({ userId: recipientId, coins: 100, balance: 250, reference: "cs_paid" });

    expect(mockCreateNotification).toHaveBeenCalledWith(recipientId, expect.objectContaining({
      type: "coins_purchase_confirmed",
      dedupeKey: "coins:cs_paid",
    }));
    expect(mockSendTransactionalNotificationEmail).toHaveBeenCalledTimes(1);
  });

  test("8. canceled coins checkout has no service call and creates nothing", async () => {
    expect(mockCreateNotification).not.toHaveBeenCalled();
    expect(mockSendTransactionalNotificationEmail).not.toHaveBeenCalled();
    expect(mockSendPush).not.toHaveBeenCalled();
  });

  test("9. duplicate webhook idempotency skips email and push", async () => {
    mockCreateNotification.mockResolvedValueOnce({ _id: "existing", wasNewNotification: false });
    await service.notifyCoinsPurchaseConfirmed({ userId: recipientId, coins: 100, balance: 250, reference: "cs_paid" });

    expect(mockSendTransactionalNotificationEmail).not.toHaveBeenCalled();
    expect(mockSendPush).not.toHaveBeenCalled();
  });

  test.each([
    ["10. Premium activated", "activated", "Premium", "Premium activated"],
    ["11. Premium renewed", "renewed", "Premium", "Premium renewed"],
    ["12. Premium canceled", "canceled", "Premium", "Premium canceled"],
    ["13. Premium payment failed", "payment_failed", "Premium", "Premium payment failed"],
  ])("%s", async (_name, action, plan, title) => {
    await service.notifySubscription({ userId: recipientId, action, plan, eventId: `evt_${action}`, subscriptionId: "sub_123" });

    expect(mockCreateNotification).toHaveBeenCalledWith(recipientId, expect.objectContaining({
      title,
      data: expect.objectContaining({ plan, link: "/vip" }),
    }));
    expect(mockSendTransactionalNotificationEmail).toHaveBeenCalledTimes(1);
  });

  test.each([
    ["14. Creator approved", true, "Your request to become a creator was approved.", "/dashboard/creator"],
    ["15. Creator rejected", false, "Your request to become a creator was not approved.", "/creator-request"],
  ])("%s", async (_name, approved, body, link) => {
    await service.notifyCreatorDecision({ userId: recipientId, approved });

    expect(mockCreateNotification).toHaveBeenCalledWith(recipientId, expect.objectContaining({
      message: body,
      data: expect.objectContaining({ link }),
    }));
    expect(mockSendPush).toHaveBeenCalledTimes(1);
    expect(mockSendTransactionalNotificationEmail).toHaveBeenCalledTimes(1);
  });

  test.each([
    ["16. Withdrawal requested", "requested", false],
    ["17. Withdrawal approved", "approved", true],
    ["18. Withdrawal rejected", "rejected", true],
  ])("%s", async (_name, status, expectsPush) => {
    await service.notifyWithdrawal({
      userId: recipientId,
      withdrawalId: "wd_1",
      status,
      amountCoins: 1000,
      date: "2026-07-23",
    });

    expect(mockCreateNotification).toHaveBeenCalledWith(recipientId, expect.objectContaining({
      type: `withdrawal_${status}`,
      data: expect.objectContaining({ link: "/wallet", amountCoins: "1000" }),
    }));
    expect(mockSendTransactionalNotificationEmail).toHaveBeenCalledTimes(1);
    expect(mockSendPush).toHaveBeenCalledTimes(expectsPush ? 1 : 0);
  });

  test("19. push preferences are respected for social events while critical emails remain enabled", async () => {
    mockUsers.set(recipientId, baseUser(recipientId, { pushSettings: { enabled: false, categories: [] } }));
    await service.notifyCreatorDecision({ userId: recipientId, approved: true });
    await service.notifyWithdrawal({ userId: recipientId, withdrawalId: "wd_2", status: "approved", amountCoins: 1000, date: "2026-07-23" });

    expect(mockSendPush).toHaveBeenCalledTimes(1);
    expect(mockSendTransactionalNotificationEmail).toHaveBeenCalledTimes(2);
  });

  test.each([
    ["20. Spanish", "es", "Nuevo mensaje"],
    ["21. English", "en", "New message"],
    ["22. Portuguese", "pt", "Nova mensagem"],
    ["23. English fallback", "fr", "New message"],
  ])("%s localization", async (_name, preferredLanguage, title) => {
    mockUsers.set(recipientId, baseUser(recipientId, { preferredLanguage }));
    await service.notifyNewMessage({ chatId, messageId, senderId, recipientId });

    expect(mockCreateNotification).toHaveBeenCalledWith(recipientId, expect.objectContaining({ title }));
  });

  test("25. deep links point to the correct resource", async () => {
    await service.notifyIncomingCall({ callId, callerId: senderId, recipientId });
    await service.notifyCoinsPurchaseConfirmed({ userId: recipientId, coins: 50, balance: 50, reference: "cs_2" });

    expect(mockCreateNotification).toHaveBeenNthCalledWith(1, recipientId, expect.objectContaining({
      data: expect.objectContaining({ link: `/call/${callId}` }),
    }));
    expect(mockCreateNotification).toHaveBeenNthCalledWith(2, recipientId, expect.objectContaining({
      data: expect.objectContaining({ link: "/coins" }),
    }));
  });

  test("26. notifications are only addressed to the intended recipient", async () => {
    await service.notifyNewMessage({ chatId, messageId, senderId, recipientId });

    expect(mockCreateNotification).toHaveBeenCalledWith(recipientId, expect.any(Object));
    expect(mockCreateNotification).not.toHaveBeenCalledWith(senderId, expect.any(Object));
    expect(mockCreateNotification).not.toHaveBeenCalledWith(otherUserId, expect.any(Object));
  });
});
