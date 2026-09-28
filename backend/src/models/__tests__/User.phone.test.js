const User = require("../User.js");

describe("User model phone verification fields", () => {
  test("adds phone fields with safe defaults, without requiring a phone", () => {
    const user = new User({
      email: "no-phone@example.com",
      password: "secret",
    });

    expect(user.validateSync()).toBeUndefined();
    expect(user.phone).toBeNull();
    expect(user.phoneVerified).toBe(false);
    expect(user.phoneVerificationCode).toBeNull();
    expect(user.phoneVerificationExpires).toBeNull();
    expect(user.phoneVerificationSentAt).toBeNull();
  });

  test("stores a normalized E.164 phone number and its verification metadata", () => {
    const expires = new Date(Date.now() + 10 * 60 * 1000);
    const sentAt = new Date();
    const user = new User({
      email: "with-phone@example.com",
      password: "secret",
      phone: "+34123456789",
      phoneVerificationCode: "hashed-code",
      phoneVerificationExpires: expires,
      phoneVerificationSentAt: sentAt,
    });

    expect(user.validateSync()).toBeUndefined();
    expect(user.phone).toBe("+34123456789");
    expect(user.phoneVerificationCode).toBe("hashed-code");
    expect(user.phoneVerificationExpires).toEqual(expires);
    expect(user.phoneVerificationSentAt).toEqual(sentAt);
  });

  test("never exposes OTP/verification secrets via toObject()/toJSON(), for phone or email", () => {
    const user = new User({
      email: "secrets@example.com",
      password: "super-secret-hash",
      phone: "+34123456789",
      phoneVerified: false,
      phoneVerificationCode: "phone-otp-hash",
      phoneVerificationExpires: new Date(Date.now() + 60000),
      emailVerificationCode: "email-otp-hash",
      emailVerificationExpires: new Date(Date.now() + 60000),
      passwordResetCode: "reset-otp-hash",
    });

    const asObject = user.toObject();
    const asJson = user.toJSON();

    for (const secretField of [
      "password",
      "phoneVerificationCode",
      "phoneVerificationExpires",
      "emailVerificationCode",
      "emailVerificationExpires",
      "passwordResetCode",
    ]) {
      expect(asObject).not.toHaveProperty(secretField);
      expect(asJson).not.toHaveProperty(secretField);
    }

    // The raw phone is never serialized — only a backend-computed masked
    // representation, so the frontend never has to (and can't inconsistently)
    // derive a mask itself.
    expect(asObject).not.toHaveProperty("phone");
    expect(asObject.phoneMasked).toBe("+34*******89");
    expect(asObject.phoneVerified).toBe(false);
  });

  test("enforces phone uniqueness only for verified phones (partial index), leaving unverified/missing phones untouched", () => {
    const indexes = User.schema.indexes();
    const phoneIndex = indexes.find(([fields]) => fields.phone === 1);
    expect(phoneIndex).toBeTruthy();
    const [, options] = phoneIndex;
    expect(options.unique).toBe(true);
    expect(options.partialFilterExpression).toEqual({ phoneVerified: true });
  });
});
