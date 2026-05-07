import Link from "next/link";
import Image from "next/image";
import styles from './landing.module.css';

// Force static generation
export const dynamic = 'force-static';

export default function LandingPage() {
  return (
    <div className={styles.landingContainer}>
      {/* Hero Section - Clean and Modern */}
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
          Connect. Stream. Meet.
        </p>

        <div className={styles.ctaButtons}>
          <Link href="/feed" className={styles.btnPrimaryLanding}>
            Entrar ahora
          </Link>
          
          <Link href="/register" className={styles.btnSecondaryLanding}>
            Crear cuenta
          </Link>
        </div>

        {/* Legal Links - Minimal Footer */}
        <div className={styles.legalLinks}>
          <Link href="/terms">Términos</Link>
          <span className={styles.separator}>•</span>
          <Link href="/privacy">Privacidad</Link>
          <span className={styles.separator}>•</span>
          <Link href="/refunds">Reembolsos</Link>
        </div>
      </div>
    </div>
  );
}
