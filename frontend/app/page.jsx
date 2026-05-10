import Link from "next/link";
import Image from "next/image";
import AnimatedBackground from "@/components/AnimatedBackground";
import styles from './landing.module.css';

// Force static generation
export const dynamic = 'force-static';

export default function LandingPage() {
  return (
    <div className={styles.landingContainer}>
      {/* Animated particle background */}
      <AnimatedBackground />
      
      {/* Decorative floating orbs */}
      <div className={styles.floatingOrbs}>
        <div className={`${styles.orb} ${styles.orb1}`}></div>
        <div className={`${styles.orb} ${styles.orb2}`}></div>
        <div className={`${styles.orb} ${styles.orb3}`}></div>
      </div>

      {/* Main Card Container */}
      <div className={styles.cardContainer}>
        {/* Logo Section */}
        <div className={styles.logoContainer}>
          <div className={styles.logoGlow}></div>
          <Image
            src="/logo.svg"
            alt="MeetYouLive"
            width={80}
            height={80}
            priority
          />
        </div>

        {/* Brand Title */}
        <h1 className={styles.brandTitle}>
          <span className={styles.brandTitleWhite}>MeetYou</span>
          <span className={styles.brandTitlePink}>Live</span>
        </h1>

        {/* Tagline */}
        <div className={styles.tagline}>
          CONECTA <span className={styles.taglineDot}>•</span> EN VIVO <span className={styles.taglineDot}>•</span> VIVE
        </div>

        {/* Security Badge */}
        <div className={styles.securityBadge}>
          <svg className={styles.securityIcon} width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M8 1L3 3V7C3 10.5 5.5 13.5 8 15C10.5 13.5 13 10.5 13 7V3L8 1Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          ACCESO SEGURO
        </div>

        {/* Welcome Message */}
        <h2 className={styles.welcomeTitle}>Bienvenido de vuelta</h2>
        <p className={styles.welcomeDescription}>
          Conéctate y entra al universo premium de MeetYouLive
        </p>

        {/* CTA Buttons */}
        <div className={styles.ctaButtons}>
          <Link href="/login" className={styles.btnPrimaryLanding}>
            Entrar ahora
            <span className={styles.btnGlow}></span>
          </Link>
          
          <Link href="/register" className={styles.btnSecondaryLanding}>
            Crear cuenta
          </Link>
        </div>

        {/* Social Proof */}
        <div className={styles.socialProof}>
          <span className={styles.onlineDot}></span>
          Más de 1,000 usuarios conectados en este momento
        </div>

        {/* Footer Text */}
        <p className={styles.footerText}>
          Streaming en vivo, conexiones reales y experiencias exclusivas
        </p>
      </div>

      {/* Legal Links - Footer */}
      <div className={styles.legalLinks}>
        <Link href="/terms">Términos</Link>
        <span className={styles.separator}>•</span>
        <Link href="/privacy">Privacidad</Link>
        <span className={styles.separator}>•</span>
        <Link href="/refunds">Reembolsos</Link>
      </div>
    </div>
  );
}
