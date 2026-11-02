/**
 * Preview-only manifest for the MYL World & Beyond animated gift concepts.
 *
 * IMPORTANT: this is intentionally NOT wired into the real gift catalog
 * (backend GiftCatalog / frontend lib/gifts.js). It exists only to drive the
 * isolated dev preview route at /dev/gift-animations-preview (and the
 * creator-only, feature-flagged demo trigger in the Live room) so design can
 * be reviewed before any monetization, purchase flow or catalog entry
 * exists. Coin values below are proposals only — nothing here charges or
 * reserves Coins.
 *
 * The full 12-gift "MYL World & Beyond" collection is organized into three
 * visual-intensity tiers (see `tierKey`), scaling animation complexity,
 * particle density and finale drama with the proposed Coin value:
 *  - "basic"   — short, light-touch effects (Mariposa luminosa, Delfín de
 *                cristal, Rosa holográfica).
 *  - "premium" — medium-length builds with a dedicated lighting/finale
 *                phase (Torre Eiffel mágica, Portal de Japón, Nave
 *                exploradora, Pirámide encantada).
 *  - "super"   — the most elaborate, multi-phase scenes with particle
 *                bursts and a cinematic close (Castillo celestial, Gran
 *                Muralla de luz, Galaxia MYL, Planeta conectado, Vuelta al
 *                Mundo).
 */

import LuminousButterflyGiftPreview, {
  LUMINOUS_BUTTERFLY_DURATION_MS,
} from "@/components/gifts/previews/LuminousButterflyGiftPreview";
import CrystalDolphinGiftPreview, {
  CRYSTAL_DOLPHIN_DURATION_MS,
} from "@/components/gifts/previews/CrystalDolphinGiftPreview";
import HolographicRoseGiftPreview, {
  HOLOGRAPHIC_ROSE_DURATION_MS,
} from "@/components/gifts/previews/HolographicRoseGiftPreview";
import EiffelTowerGiftPreview, {
  EIFFEL_TOWER_DURATION_MS,
} from "@/components/gifts/previews/EiffelTowerGiftPreview";
import JapanPortalGiftPreview, {
  JAPAN_PORTAL_DURATION_MS,
} from "@/components/gifts/previews/JapanPortalGiftPreview";
import ExplorerShipGiftPreview, {
  EXPLORER_SHIP_DURATION_MS,
} from "@/components/gifts/previews/ExplorerShipGiftPreview";
import EnchantedPyramidGiftPreview, {
  ENCHANTED_PYRAMID_DURATION_MS,
} from "@/components/gifts/previews/EnchantedPyramidGiftPreview";
import CelestialCastleGiftPreview, {
  CELESTIAL_CASTLE_DURATION_MS,
} from "@/components/gifts/previews/CelestialCastleGiftPreview";
import GreatWallOfLightGiftPreview, {
  GREAT_WALL_OF_LIGHT_DURATION_MS,
} from "@/components/gifts/previews/GreatWallOfLightGiftPreview";
import MylGalaxyGiftPreview, {
  MYL_GALAXY_DURATION_MS,
} from "@/components/gifts/previews/MylGalaxyGiftPreview";
import ConnectedPlanetGiftPreview, {
  CONNECTED_PLANET_DURATION_MS,
} from "@/components/gifts/previews/ConnectedPlanetGiftPreview";
import AroundTheWorldGiftPreview, {
  AROUND_THE_WORLD_DURATION_MS,
} from "@/components/gifts/previews/AroundTheWorldGiftPreview";

export const GIFT_ANIMATION_PREVIEWS = [
  {
    id: "luminous-butterfly",
    icon: "🦋",
    Component: LuminousButterflyGiftPreview,
    durationMs: LUMINOUS_BUTTERFLY_DURATION_MS,
    proposedCoins: 20,
    tierKey: "basic",
    nameKey: "giftAnimationsPreview.items.luminousButterfly.name",
    descriptionKey: "giftAnimationsPreview.items.luminousButterfly.description",
  },
  {
    id: "crystal-dolphin",
    icon: "🐬",
    Component: CrystalDolphinGiftPreview,
    durationMs: CRYSTAL_DOLPHIN_DURATION_MS,
    proposedCoins: 80,
    tierKey: "basic",
    nameKey: "giftAnimationsPreview.items.crystalDolphin.name",
    descriptionKey: "giftAnimationsPreview.items.crystalDolphin.description",
  },
  {
    id: "holographic-rose",
    icon: "🌹",
    Component: HolographicRoseGiftPreview,
    durationMs: HOLOGRAPHIC_ROSE_DURATION_MS,
    proposedCoins: 150,
    tierKey: "basic",
    nameKey: "giftAnimationsPreview.items.holographicRose.name",
    descriptionKey: "giftAnimationsPreview.items.holographicRose.description",
  },
  {
    id: "eiffel-tower",
    icon: "🗼",
    Component: EiffelTowerGiftPreview,
    durationMs: EIFFEL_TOWER_DURATION_MS,
    proposedCoins: 300,
    tierKey: "premium",
    nameKey: "giftAnimationsPreview.items.eiffelTower.name",
    descriptionKey: "giftAnimationsPreview.items.eiffelTower.description",
  },
  {
    id: "japan-portal",
    icon: "⛩️",
    Component: JapanPortalGiftPreview,
    durationMs: JAPAN_PORTAL_DURATION_MS,
    proposedCoins: 500,
    tierKey: "premium",
    nameKey: "giftAnimationsPreview.items.japanPortal.name",
    descriptionKey: "giftAnimationsPreview.items.japanPortal.description",
  },
  {
    id: "explorer-ship",
    icon: "🚀",
    Component: ExplorerShipGiftPreview,
    durationMs: EXPLORER_SHIP_DURATION_MS,
    proposedCoins: 800,
    tierKey: "premium",
    nameKey: "giftAnimationsPreview.items.explorerShip.name",
    descriptionKey: "giftAnimationsPreview.items.explorerShip.description",
  },
  {
    id: "enchanted-pyramid",
    icon: "🔺",
    Component: EnchantedPyramidGiftPreview,
    durationMs: ENCHANTED_PYRAMID_DURATION_MS,
    proposedCoins: 1200,
    tierKey: "premium",
    nameKey: "giftAnimationsPreview.items.enchantedPyramid.name",
    descriptionKey: "giftAnimationsPreview.items.enchantedPyramid.description",
  },
  {
    id: "celestial-castle",
    icon: "🏰",
    Component: CelestialCastleGiftPreview,
    durationMs: CELESTIAL_CASTLE_DURATION_MS,
    proposedCoins: 2000,
    tierKey: "super",
    nameKey: "giftAnimationsPreview.items.celestialCastle.name",
    descriptionKey: "giftAnimationsPreview.items.celestialCastle.description",
  },
  {
    id: "great-wall-of-light",
    icon: "🧱",
    Component: GreatWallOfLightGiftPreview,
    durationMs: GREAT_WALL_OF_LIGHT_DURATION_MS,
    proposedCoins: 3000,
    tierKey: "super",
    nameKey: "giftAnimationsPreview.items.greatWallOfLight.name",
    descriptionKey: "giftAnimationsPreview.items.greatWallOfLight.description",
  },
  {
    id: "myl-galaxy",
    icon: "🌌",
    Component: MylGalaxyGiftPreview,
    durationMs: MYL_GALAXY_DURATION_MS,
    proposedCoins: 5000,
    tierKey: "super",
    nameKey: "giftAnimationsPreview.items.mylGalaxy.name",
    descriptionKey: "giftAnimationsPreview.items.mylGalaxy.description",
  },
  {
    id: "connected-planet",
    icon: "🌍",
    Component: ConnectedPlanetGiftPreview,
    durationMs: CONNECTED_PLANET_DURATION_MS,
    proposedCoins: 8000,
    tierKey: "super",
    nameKey: "giftAnimationsPreview.items.connectedPlanet.name",
    descriptionKey: "giftAnimationsPreview.items.connectedPlanet.description",
  },
  {
    id: "around-the-world",
    icon: "✈️",
    Component: AroundTheWorldGiftPreview,
    durationMs: AROUND_THE_WORLD_DURATION_MS,
    proposedCoins: 15000,
    tierKey: "super",
    nameKey: "giftAnimationsPreview.items.aroundTheWorld.name",
    descriptionKey: "giftAnimationsPreview.items.aroundTheWorld.description",
  },
];
