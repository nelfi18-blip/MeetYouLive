const COIN_PACKAGES = [
  {
    id: 100,
    label: "Starter",
    coins: 100,
    priceUsd: 0.99,
    icon: "🪙",
    description: "Ideal para empezar",
    save: null,
  },
  {
    id: 500,
    label: "Popular",
    coins: 500,
    priceUsd: 4.49,
    icon: "💰",
    description: "El más elegido por la comunidad",
    save: "Ahorra 9%",
    highlight: true,
  },
  {
    id: 1000,
    label: "Pro",
    coins: 1000,
    priceUsd: 7.99,
    icon: "💎",
    description: "Mejor precio por moneda",
    save: "Ahorra 19%",
  },
];

const getPackages = (req, res) => {
  res.json(COIN_PACKAGES);
};

module.exports = { getPackages, COIN_PACKAGES };
