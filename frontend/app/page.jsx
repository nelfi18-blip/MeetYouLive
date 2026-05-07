import Link from "next/link";
import Image from "next/image";
import styles from './landing.module.css';

// Force static generation
export const dynamic = 'force-static';

export default function LandingPage() {
  return (
    <div className={styles.landingContainer}>
      {/* Hero Section */}
      <div className={styles.heroSection}>
        <div className={styles.logoContainer}>
          <Image
            src="/logo.svg"
            alt="MeetYouLive"
            width={120}
            height={120}
            priority
          />
        </div>

        <h1 className={styles.landingTitle}>
          MeetYouLive
        </h1>
        
        <p className={styles.landingSubtitle}>
          Match. Watch. Connect.
        </p>

        <div className={styles.ctaButtons}>
          <Link href="/feed" className={styles.btnPrimaryLanding}>
            Entrar ahora
          </Link>
          
          <Link href="/register" className={styles.btnSecondaryLanding}>
            Crear cuenta
          </Link>
        </div>
      </div>

      {/* Features Grid */}
      <div className={styles.featuresGrid}>
        <div className={styles.featureCard}>
          <div className={styles.featureIcon}>🔥</div>
          <h3 className={styles.featureTitle}>Match</h3>
          <p className={styles.featureDescription}>Swipe & connect</p>
        </div>

        <div className={styles.featureCard}>
          <div className={styles.featureIcon}>🔴</div>
          <h3 className={styles.featureTitle}>Live</h3>
          <p className={styles.featureDescription}>Watch streams</p>
        </div>

        <div className={styles.featureCard}>
          <div className={styles.featureIcon}>💬</div>
          <h3 className={styles.featureTitle}>Chat</h3>
          <p className={styles.featureDescription}>Message instantly</p>
        </div>
      </div>

      {/* Footer */}
      <div className={styles.landingFooter}>
        <Link href="/terms">Terms</Link>
        <Link href="/privacy">Privacy</Link>
        <Link href="/refunds">Refunds</Link>
      </div>
    </div>
  );
}
