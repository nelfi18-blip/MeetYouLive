jest.mock("../../models/ChatProtectionAttempt.js", () => ({ create: jest.fn() }));
jest.mock("../platformSettings.service.js", () => ({ getPlatformSettings: jest.fn() }));
jest.mock("../chatTrust.service.js", () => ({
  evaluateChatTrust: jest.fn(),
  getOtherParticipantId: jest.fn(() => "507f1f77bcf86cd799439012"),
}));

const ChatProtectionAttempt = require("../../models/ChatProtectionAttempt.js");
const { getPlatformSettings } = require("../platformSettings.service.js");
const { evaluateChatTrust } = require("../chatTrust.service.js");
const {
  CONTACT_SHARING_RESTRICTED,
  checkChatMessageProtection,
} = require("../chatProtection.service.js");

const senderId = "507f1f77bcf86cd799439011";
const recipientId = "507f1f77bcf86cd799439012";
const chatId = "507f1f77bcf86cd799439013";
const chat = { _id: chatId, participants: [{ _id: senderId }, { _id: recipientId }] };

const baseSettings = {
  chatProtection: {
    chatProtectionEnabled: true,
    blockPhones: true,
    blockEmails: true,
    blockUrls: true,
    blockSocialMedia: true,
    minimumDaysSinceMatch: 7,
    minimumMessages: 20,
    minimumCompletedCalls: 0,
    minimumCoinsSpent: 0,
    trustRuleMode: "all",
  },
};

describe("chatProtection.service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getPlatformSettings.mockResolvedValue(baseSettings);
    evaluateChatTrust.mockResolvedValue({
      trusted: false,
      otherParticipantId: recipientId,
      mode: "all",
      checks: { minimumMessages: { required: 20, actual: 0, passed: false } },
    });
    ChatProtectionAttempt.create.mockResolvedValue({});
  });

  test("allows messages when protection is disabled", async () => {
    getPlatformSettings.mockResolvedValue({
      chatProtection: { ...baseSettings.chatProtection, chatProtectionEnabled: false },
    });

    const result = await checkChatMessageProtection({ text: "555-123-4567", chat, chatId, senderId });

    expect(result.allowed).toBe(true);
    expect(evaluateChatTrust).not.toHaveBeenCalled();
    expect(ChatProtectionAttempt.create).not.toHaveBeenCalled();
  });

  test("allows disabled categories", async () => {
    getPlatformSettings.mockResolvedValue({
      chatProtection: { ...baseSettings.chatProtection, blockPhones: false },
    });

    const result = await checkChatMessageProtection({ text: "555-123-4567", chat, chatId, senderId });

    expect(result.allowed).toBe(true);
    expect(ChatProtectionAttempt.create).not.toHaveBeenCalled();
  });

  test("blocks untrusted contact sharing and stores only minimal metadata", async () => {
    const result = await checkChatMessageProtection({
      text: "mi whatsapp es 555-123-4567",
      chat,
      chatId,
      senderId,
      req: { headers: { "user-agent": "Mozilla/5.0" } },
    });

    expect(result.allowed).toBe(false);
    expect(result.code).toBe(CONTACT_SHARING_RESTRICTED);
    expect(result.detectedTypes).toEqual(expect.arrayContaining(["phone", "social_media"]));
    expect(ChatProtectionAttempt.create).toHaveBeenCalledWith(expect.objectContaining({
      senderId,
      recipientId,
      chatId,
      detectedTypes: expect.arrayContaining(["phone", "social_media"]),
      source: "web",
      contentHash: expect.any(String),
      ruleApplied: expect.objectContaining({ code: CONTACT_SHARING_RESTRICTED }),
    }));
    expect(JSON.stringify(ChatProtectionAttempt.create.mock.calls[0][0])).not.toContain("whatsapp");
    expect(JSON.stringify(ChatProtectionAttempt.create.mock.calls[0][0])).not.toContain("555-123-4567");
  });

  test("allows trusted users", async () => {
    evaluateChatTrust.mockResolvedValue({ trusted: true, otherParticipantId: recipientId, mode: "any", checks: {} });

    const result = await checkChatMessageProtection({ text: "test@example.com", chat, chatId, senderId });

    expect(result.allowed).toBe(true);
    expect(ChatProtectionAttempt.create).not.toHaveBeenCalled();
  });
});
