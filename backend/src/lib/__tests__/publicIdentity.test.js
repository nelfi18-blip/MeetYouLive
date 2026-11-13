const {
  getPublicName, validatePublicName, toPublicIdentity,
} = require("../publicIdentity.js");

describe("public profile identity privacy", () => {
  it("defaults to only the first given name, not the surname or internal email-derived username", () => {
    const source = {
      _id: "507f1f77bcf86cd799439021", role: "user",
      name: "María Rodríguez Pérez", firstName: "María", lastName: "Rodríguez Pérez",
      username: "maria.rodriguez1987", email: "maria.rodriguez1987@example.com",
    };
    expect(getPublicName(source)).toBe("María");
    const visible = toPublicIdentity(source);
    expect(visible).toMatchObject({ name: "María", publicName: "María" });
    expect(JSON.stringify(visible)).not.toMatch(/Rodríguez|maria\.rodriguez|example\.com/);
    expect(source.name).toBe("María Rodríguez Pérez");
  });

  it("honors a chosen nickname and a creator's multi-word artistic name", () => {
    expect(getPublicName({ publicName: "Estrella", name: "María Rodríguez" })).toBe("Estrella");
    expect(getPublicName({ role: "creator", creatorProfile: { displayName: "Luna Latina" }, name: "Legal Name" })).toBe("Luna Latina");
    expect(getPublicName({ role: "agency", publicName: "Agencia Estrellas" })).toBe("Agencia Estrellas");
  });

  it("does not fall back to username, and rejects email-like or multiple words for ordinary users", () => {
    expect(getPublicName({ username: "juanlopez@gmail" })).toBe("Usuario");
    expect(validatePublicName("Juan Pérez")).toMatchObject({ ok: false, reason: "single_word" });
    expect(validatePublicName("jane@example.com").ok).toBe(false);
    expect(validatePublicName("https://example.com").ok).toBe(false);
    expect(validatePublicName("Ana").ok).toBe(true);
    expect(validatePublicName("DJ Estrella", { creator: true })).toEqual({ ok: true, value: "DJ Estrella" });
  });
});
