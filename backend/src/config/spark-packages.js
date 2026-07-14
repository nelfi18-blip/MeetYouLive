const SPARK_PACKAGES = [
  {
    id: 50,
    label: "Starter",
    sparks: 50,
    priceUsd: 0.99,
    icon: "✨",
    description: "Ideal para explorar",
    save: null,
  },
  {
    id: 150,
    label: "Explorer",
    sparks: 150,
    priceUsd: 2.49,
    icon: "⚡",
    description: "Más presencia social",
    save: "Ahorra 16%",
  },
  {
    id: 300,
    label: "Popular",
    sparks: 300,
    priceUsd: 4.49,
    icon: "🌟",
    description: "El más elegido",
    save: "Ahorra 24%",
    highlight: true,
  },
  {
    id: 600,
    label: "Elite",
    sparks: 600,
    priceUsd: 7.99,
    icon: "💥",
    description: "Domina la descubierta social",
    save: "Ahorra 32%",
  },
];

const SPARK_PACKAGE_IDS = SPARK_PACKAGES.map((pkg) => pkg.id);

module.exports = { SPARK_PACKAGES, SPARK_PACKAGE_IDS };
