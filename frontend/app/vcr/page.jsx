"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import PhotoWorld from "@/components/vcr/PhotoWorld";
import WalkableWorld from "@/components/vcr/WalkableWorld";
import AiWalkableWorld from "@/components/vcr/AiWalkableWorld";
import styles from "./vcr.module.css";

const WORLD_TEST_ONLY = process.env.NEXT_PUBLIC_WORLD_TEST_MODE === "isolated";

export default function VcrPage() {
  const { t, lang, setLang } = useLanguage();
  const [walkSession, setWalkSession] = useState(null);
  useEffect(() => {
    if (!WORLD_TEST_ONLY) return;
    document.body.classList.add("world-preview-isolated");
    return () => document.body.classList.remove("world-preview-isolated");
  }, []);
  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <div className={styles.heroCopy}>
          <span className={styles.eyebrow}>{t("vcrWorld.eyebrow")}</span>
          <h1 className={styles.title}>{t("vcrWorld.title")}</h1>
          <p className={styles.subtitle}>{t("worldPhoto.subtitle")}</p>
        </div>
        <div className={styles.heroActions}>
          <div className={styles.languageSwitch} role="group" aria-label={t("worldPhoto.language")}>
            {["es", "en", "pt"].map((code) => (
              <button type="button" key={code} aria-pressed={lang === code}
                onClick={() => setLang(code)} className={lang === code ? styles.languageActive : styles.languageButton}>
                {code.toUpperCase()}
              </button>
            ))}
          </div>
          {!WORLD_TEST_ONLY && <Link href="/profile" className={styles.profileLink}>{t("vcrWorld.toProfile")}</Link>}
        </div>
      </header>

      <div hidden={Boolean(walkSession)}>
        <PhotoWorld onEnterWalk={setWalkSession} />
      </div>
      {walkSession && (
        walkSession.mode === "ai"
          ? <AiWalkableWorld {...walkSession} onExit={() => setWalkSession(null)} />
          : <WalkableWorld {...walkSession} onExit={() => setWalkSession(null)}
              onTryAi={(selection) => setWalkSession({ ...selection, mode: "ai" })} />
      )}

      <details className={styles.disclosure}>
        <summary>{t("worldPhoto.moreInfo")}</summary>
        <p>{t("worldPhoto.notice")}</p>
        <small>{t("worldPhoto.performance")}</small>
      </details>
      {WORLD_TEST_ONLY && <style jsx global>{`
        body.world-preview-isolated footer { display: none !important; }
      `}</style>}
    </main>
  );
}
