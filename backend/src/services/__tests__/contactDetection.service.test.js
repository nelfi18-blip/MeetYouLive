const { detectContactTypes } = require("../contactDetection.service.js");

const options = {
  blockPhones: true,
  blockEmails: true,
  blockUrls: true,
  blockSocialMedia: true,
  blockMoneyRequests: true,
};

describe("contactDetection.service", () => {
  test.each([
    "Tengo 10 monedas",
    "La línea está ocupada",
    "Ese juego tiene nivel 7",
    "Instagramable sin intención de compartir contacto",
    "Mi edad es 25",
    "Hay 3 regalos y 7 niveles disponibles",
    "ig",
    "snap fue una decisión rápida",
    "Tengo 2 perros",
    "Nos vemos a las 8",
    "Me gusta Instagram",
    "Facebook cambió su diseño",
    "Juan Pérez",
    "Me encantan los Gifts oficiales de MeetYouLive",
    "Ya tengo 500 coins acumulados",
  ])("does not flag normal text: %s", (text) => {
    expect(detectContactTypes(text, options)).toEqual([]);
  });

  test.each([
    ["Mi teléfono es 5551234567", "phone"],
    ["Llámame al 555 123 4567", "phone"],
    ["Mi cel es 555-123-4567", "phone"],
    ["Mi número es +1 555 123 4567", "phone"],
    ["correo test@example.com", "email"],
    ["correo test arroba example punto com", "email"],
    ["visita https://example.com/perfil", "url"],
    ["www.example.com", "url"],
    ["example.com", "url"],
    ["sígueme en instagram.com/usuario", "url"],
    ["escríbeme por t.me/usuario", "url"],
    ["háblame por WhatsApp", "social_media"],
    ["whats app 555 123 4567", "social_media"],
    ["tele gram usuario123", "social_media"],
    ["instagram @usuario123", "social_media"],
    ["ig es usuario123", "social_media"],
    ["TikTok usuario123", "social_media"],
    ["mi discord es user123", "social_media"],
    ["búscame en instagram @usuario123", "social_media"],
    ["usuario punto com", "url"],
    ["páseme su cashapp $johndoe123", "money_request"],
    ["te pago por venmo", "money_request"],
    ["mándame el dinero por zelle", "money_request"],
    ["mi paypal es john@example.com para pagos", "money_request"],
    ["necesito que me compres una gift card", "money_request"],
    ["send me a gift card please", "money_request"],
    ["mi wallet de bitcoin es 0x1234567890abcdef1234567890abcdef12345678", "money_request"],
    ["enviame dinero por favor", "money_request"],
    ["send me some money please", "money_request"],
  ])("flags %s as %s", (text, type) => {
    expect(detectContactTypes(text, options)).toContain(type);
  });

  test("respects disabled categories", () => {
    expect(detectContactTypes("test@example.com", { ...options, blockEmails: false })).toEqual([]);
    expect(detectContactTypes("https://example.com", { ...options, blockUrls: false })).toEqual([]);
    expect(detectContactTypes("555-123-4567", { ...options, blockPhones: false })).toEqual([]);
    expect(detectContactTypes("telegram usuario", { ...options, blockSocialMedia: false })).toEqual([]);
    expect(detectContactTypes("te pago por venmo", { ...options, blockMoneyRequests: false })).toEqual([]);
  });
});
