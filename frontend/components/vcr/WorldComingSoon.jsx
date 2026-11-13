"use client";

import Link from "next/link";
import { useLanguage } from "@/contexts/LanguageContext";
import styles from "./WorldComingSoon.module.css";

// Public-facing World entrance. The unfinished map, people and immersive
// engines stay isolated in World Test; nothing here claims they are live.
export default function WorldComingSoon() {
  const { t, lang, setLang } = useLanguage();
  const ISOLATED_TEST_PREVIEW = process.env.NEXT_PUBLIC_WORLD_TEST_MODE === "isolated";

  return (
    <section className={styles.shell} aria-labelledby="world-coming-soon-title">
      <div className={styles.glow} aria-hidden="true" />
      <div className={styles.visual} aria-hidden="true">
        <span className={styles.orbitOne} />
        <span className={styles.orbitTwo} />
        <span className={styles.globe}><span className={styles.globeLand} /></span>
        <span className={styles.sparkLeft}>✦</span>
        <span className={styles.sparkRight}>✧</span>
      </div>

      <div className={styles.content}>
        <div className={styles.languageSwitch} role="group" aria-label="Idioma / Language">
          {["es", "en", "pt"].map((code) => (
            <button type="button" key={code} onClick={() => setLang(code)}
              className={lang === code ? styles.languageActive : styles.languageChoice}
              aria-label={{ es: "Español", en: "English", pt: "Português" }[code]}
              aria-pressed={lang === code}>
              {code.toUpperCase()}
            </button>
          ))}
        </div>
        <span className={styles.badge}><span className={styles.dot} aria-hidden="true" /> {t("worldComingSoon.status")}</span>
        <p className={styles.eyebrow}>{t("worldComingSoon.eyebrow")}</p>
        <h1 id="world-coming-soon-title">{t("worldComingSoon.title")}</h1>
        <p className={styles.subtitle}>{t("worldComingSoon.subtitle")}</p>
        <div className={styles.features} aria-label={t("worldComingSoon.featuresLabel")}>
          {[
            { icon: "🗺️", title: "destinationTitle", body: "destinationBody" },
            { icon: "🤝", title: "peopleTitle", body: "peopleBody" },
            { icon: "✨", title: "experienceTitle", body: "experienceBody" },
          ].map((item) => (
            <div className={styles.feature} key={item.title}>
              <span className={styles.featureIcon} aria-hidden="true">{item.icon}</span>
              <strong>{t(`worldComingSoon.${item.title}`)}</strong>
              <p>{t(`worldComingSoon.${item.body}`)}</p>
            </div>
          ))}
        </div>
        <p className={styles.disclaimer}>{t("worldComingSoon.disclaimer")}</p>
        {!ISOLATED_TEST_PREVIEW && (
          <Link className={styles.backLink} href="/feed">{t("worldComingSoon.backToApp")}</Link>
        )}
      </div>
    </section>
  );
}
