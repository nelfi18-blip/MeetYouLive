import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// These informational banners must describe navigation/features, not invent
// active admirers, pending matches, expiring lives or scarce offers.
const approvedMessages = {
  "es": {
    "message1": "Explora los paquetes de Coins y elige el que necesites",
    "message2": "Descubre todas las formas de utilizar Coins",
    "message3": "Consulta tus coincidencias desde la sección Matches",
    "message4": "Consulta cómo usar Coins para regalos y experiencias",
    "message5": "Compara los paquetes de Coins disponibles",
    "message6": "Explora perfiles y descubre nuevas conexiones",
    "message7": "Consulta las transmisiones en directo disponibles"
  },
  "en": {
    "message1": "Explore Coins packages and choose what suits you",
    "message2": "Discover the ways to use Coins",
    "message3": "Check your matches in the Matches section",
    "message4": "Learn how to use Coins for gifts and experiences",
    "message5": "Compare the available Coins packages",
    "message6": "Explore profiles and discover new connections",
    "message7": "Browse available live streams"
  },
  "pt": {
    "message1": "Explore os pacotes de Coins e escolha o ideal para você",
    "message2": "Descubra as formas de usar Coins",
    "message3": "Confira suas conexões na seção Matches",
    "message4": "Veja como usar Coins em presentes e experiências",
    "message5": "Compare os pacotes de Coins disponíveis",
    "message6": "Explore perfis e descubra novas conexões",
    "message7": "Confira as transmissões ao vivo disponíveis"
  }
};

for (const lang of ["es", "en", "pt"]) {
  test(`informational banner has neutral copy in ${lang}`, async () => {
    const messages = JSON.parse(await readFile(
      new URL(`../messages/${lang}.json`, import.meta.url), "utf8"));
    for (const [key, expected] of Object.entries(approvedMessages[lang])) {
      assert.equal(messages.urgencyBanner[key], expected);
    }
    for (const cta of ["unlockNow", "seeWho", "useNow", "seeNow", "exploreNow", "viewLives"]) {
      assert.ok(messages.urgencyBanner[cta]?.trim(), `Missing CTA ${cta} in ${lang}`);
    }
  });
}

test("banner keeps existing Coins, Matches, Explore and Live routes", async () => {
  const banner = await readFile(new URL("../components/UrgencyBanner.jsx", import.meta.url), "utf8");
  for (const route of ["/coins", "/matches", "/explore", "/live"]) {
    assert.ok(banner.includes(`href: "${route}"`), `Missing banner route ${route}`);
  }
});
