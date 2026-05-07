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

      {/* Hero Section - Enhanced */}
      <div className={styles.heroSection}>
        <div className={styles.logoContainer}>
          <div className={styles.logoGlow}></div>
          <Image
            src="/logo.svg"
            alt="MeetYouLive"
            width={120}
            height={120}
            priority
          />
        </div>

        <h1 className={styles.landingTitle}>
          <span className={styles.titleWord}>Meet</span>
          <span className={styles.titleWord}>You</span>
          <span className={styles.titleWord}>Live</span>
        </h1>
        
        <p className={styles.landingSubtitle}>
          Connect. Stream. Meet.
        </p>

        <div className={styles.ctaButtons}>
          <Link href="/feed" className={styles.btnPrimaryLanding}>
            <span className={styles.btnText}>Entrar ahora</span>
            <span className={styles.btnGlow}></span>
          </Link>
          
          <Link href="/register" className={styles.btnSecondaryLanding}>
            <span className={styles.btnText}>Crear cuenta</span>
          </Link>
        </div>

        {/* Stats showcase */}
        <div className={styles.statsRow}>
          <div className={styles.statItem}>
            <div className={styles.statIcon} aria-label="Video en vivo">🎥</div>
            <div className={styles.statValue}>1000+</div>
            <div className={styles.statLabel}>Directos activos</div>
          </div>
          <div className={styles.statItem}>
            <div className={styles.statIcon} aria-label="Usuarios">👥</div>
            <div className={styles.statValue}>50K+</div>
            <div className={styles.statLabel}>Usuarios conectados</div>
          </div>
          <div className={styles.statItem}>
            <div className={styles.statIcon} aria-label="Experiencias premium">💎</div>
            <div className={styles.statValue}>∞</div>
            <div className={styles.statLabel}>Experiencias únicas</div>
          </div>
        </div>
      </div>

      {/* Feature highlights */}
      <div className={styles.featuresSection}>
        <div className={styles.featureCard}>
          <div className={styles.featureIconWrapper}>
            <span className={styles.featureEmoji}>💬</span>
          </div>
          <h3>Conecta en tiempo real</h3>
          <p>Conoce personas increíbles y crea conexiones auténticas</p>
        </div>

        <div className={styles.featureCard}>
          <div className={styles.featureIconWrapper}>
            <span className={styles.featureEmoji}>🎬</span>
          </div>
          <h3>Directos en vivo</h3>
          <p>Mira y crea transmisiones en directo espectaculares</p>
        </div>

        <div className={styles.featureCard}>
          <div className={styles.featureIconWrapper}>
            <span className={styles.featureEmoji}>🎁</span>
          </div>
          <h3>Regalos virtuales</h3>
          <p>Expresa tu aprecio con regalos únicos y animaciones</p>
        </div>
      </div>

      {/* CTA Section */}
      <div className={styles.ctaSection}>
        <h2 className={styles.ctaTitle}>Comienza tu aventura hoy</h2>
        <p className={styles.ctaDescription}>
          Únete a miles de personas que ya están disfrutando de MeetYouLive
        </p>
        <Link href="/register" className={styles.ctaButton}>
          <span>Crear cuenta gratis</span>
          <span className={styles.ctaArrow}>→</span>
        </Link>
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
