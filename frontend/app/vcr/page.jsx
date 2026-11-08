"use client";

import Link from "next/link";
import { useLanguage } from "@/contexts/LanguageContext";
import PhotoWorld from "@/components/vcr/PhotoWorld";
import styles from "./vcr.module.css";

const WORLD_TEST_ONLY = process.env.NEXT_PUBLIC_WORLD_TEST_MODE === "isolated";

export default function VcrPage() {
  const { t } = useLanguage();
  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <div className={styles.heroCopy}>
          <span className={styles.eyebrow}>{t("vcrWorld.eyebrow")}</span>
          <h1 className={styles.title}>{t("vcrWorld.title")}</h1>
          <p className={styles.subtitle}>{t("worldPhoto.subtitle")}</p>
        </div>
        {!WORLD_TEST_ONLY && <Link href="/profile" className={styles.profileLink}>{t("vcrWorld.toProfile")}</Link>}
      </header>

      <PhotoWorld />

      <section className={styles.disclosure} aria-label={t("worldPhoto.preview")}>
        <strong>{t("worldPhoto.preview")}</strong>
        <p>{t("worldPhoto.notice")}</p>
        <small>{t("worldPhoto.performance")}</small>
      </section>
    </main>
  );
}
