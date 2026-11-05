"use client";

import Link from "next/link";
import { useLanguage } from "@/contexts/LanguageContext";
import VcrWorld from "@/components/vcr/VcrWorld";
import styles from "./vcr.module.css";

export default function VcrPage() {
  const { t } = useLanguage();
  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <div className={styles.heroCopy}>
          <span className={styles.eyebrow}>{t("vcrWorld.eyebrow")}</span>
          <h1 className={styles.title}>{t("vcrWorld.title")}</h1>
          <p className={styles.subtitle}>{t("vcrWorld.subtitle")}</p>
        </div>
        <Link href="/profile" className={styles.profileLink}>{t("vcrWorld.toProfile")}</Link>
      </header>

      <VcrWorld />

      <section className={styles.disclosure} aria-label={t("vcrWorld.preview")}>
        <strong>{t("vcrWorld.preview")}</strong>
        <p>{t("vcrWorld.notice")}</p>
        <small>{t("vcrWorld.performance")}</small>
      </section>
    </main>
  );
}
