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

  it("exposes only adult age in whole years, never the birthday", () => {
    const birthdate = new Date(2000, 0, 1);
    const person = toPublicIdentity({
      role: "user", name: "María Rodríguez", birthdate, username: "maria2000",
    });
    expect(person.age).toEqual(expect.any(Number));
    expect(person.age).toBeGreaterThanOrEqual(18);
    expect(person.age).toBeLessThan(120);
    expect(person.birthdate).toBeUndefined();
    expect(JSON.stringify(person)).not.toContain("2000-01-01");
    expect(person.name).toBe("María");

    const unknown = toPublicIdentity({ name: "Kelly", birthdate: "invalid" });
    expect(unknown.age).toBeNull();
    const minor = toPublicIdentity({ name: "NoVisible", birthdate: new Date() });
    expect(minor.age).toBeNull();
  });

  it("hides a repeated Google name without deleting the stored biography", () => {
    const legacy = {
      role: "user",
      name: "Mutah hir Hussain",
      username: "mutah.hussain123",
      bio: " Mutah   hir Hussain. ",
    };
    const safe = toPublicIdentity(legacy);
    expect(safe.name).toBe("Mutah");
    expect(safe.bio).toBe("");
    expect(JSON.stringify(safe)).not.toMatch(/hir Hussain|mutah\.hussain123/);
    expect(legacy.bio).toBe(" Mutah   hir Hussain. ");

    expect(toPublicIdentity({ name: "Kelly Johnson", bio: "Kelly" }).bio).toBe("");
    expect(toPublicIdentity({ name: "Kelly Johnson", bio: "Confident, fun and a little sarcastic." }).bio)
      .toBe("Confident, fun and a little sarcastic.");
    expect(toPublicIdentity({ role: "creator", name: "Legal Person", creatorProfile: { displayName: "DJ Estrella" }, bio: "DJ Estrella" }).bio)
      .toBe("");
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
