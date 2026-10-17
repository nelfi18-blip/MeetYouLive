/**
 * Preview-only manifest for the MYL World & Beyond animated gift concepts.
 *
 * IMPORTANT: this is intentionally NOT wired into the real gift catalog
 * (backend GiftCatalog / frontend lib/gifts.js). It exists only to drive the
 * isolated dev preview route at /dev/gift-animations-preview so design can be
 * reviewed before any monetization, purchase flow or catalog entry exists.
 * Coin values below are proposals only — nothing here charges or reserves
 * Coins.
 */

import EiffelTowerGiftPreview, {
  EIFFEL_TOWER_DURATION_MS,
} from "@/components/gifts/previews/EiffelTowerGiftPreview";
import ExplorerShipGiftPreview, {
  EXPLORER_SHIP_DURATION_MS,
} from "@/components/gifts/previews/ExplorerShipGiftPreview";
import ConnectedPlanetGiftPreview, {
  CONNECTED_PLANET_DURATION_MS,
} from "@/components/gifts/previews/ConnectedPlanetGiftPreview";

export const GIFT_ANIMATION_PREVIEWS = [
  {
    id: "eiffel-tower",
    icon: "🗼",
    Component: EiffelTowerGiftPreview,
    durationMs: EIFFEL_TOWER_DURATION_MS,
    proposedCoins: 300,
    tierKey: "medium",
    nameKey: "giftAnimationsPreview.items.eiffelTower.name",
    descriptionKey: "giftAnimationsPreview.items.eiffelTower.description",
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
    id: "connected-planet",
    icon: "🌍",
    Component: ConnectedPlanetGiftPreview,
    durationMs: CONNECTED_PLANET_DURATION_MS,
    proposedCoins: 8000,
    tierKey: "legendary",
    nameKey: "giftAnimationsPreview.items.connectedPlanet.name",
    descriptionKey: "giftAnimationsPreview.items.connectedPlanet.description",
  },
];
