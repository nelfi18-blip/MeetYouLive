import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

const eslintConfig = [
  {
    ignores: [
      ".next/**",
      "out/**",
      "node_modules/**",
      "android/**",
      "ios/**",
    ],
  },
  ...nextCoreWebVitals,
  {
    linterOptions: {
      reportUnusedDisableDirectives: "off",
    },
    rules: {
      "@next/next/no-img-element": "off",
      "@next/next/no-page-custom-font": "off",
      "react-hooks/exhaustive-deps": "off",
      "react-hooks/purity": "off",
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/unsupported-syntax": "off",
      "react/no-unescaped-entities": "off",
    },
  },
];

export default eslintConfig;
