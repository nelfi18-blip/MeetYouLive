import Link from "next/link";
import Image from "next/image";
import AnimatedBackground from "@/components/AnimatedBackground";
import styles from './landing.module.css';

// Force static generation
export const dynamic = 'force-static';

// Metadata mejorada para la landing page
export const metadata = {
  title: "MeetYouLive - App de Citas con Streaming en Vivo",
  description: "Conoce personas, mira directos en vivo y conecta en tiempo real. Haz match con personas de tu zona, disfruta transmisiones en vivo y chatea. Los creadores pueden ganar dinero compartiendo contenido.",
  keywords: "app de citas, citas en vivo, streaming en vivo, conocer personas, video chat, dating app, live streaming, creadores de contenido",
  openGraph: {
    title: "MeetYouLive - Conecta en vivo con personas reales",
    description: "La app de citas con streaming en vivo. Haz match, mira directos y conecta en tiempo real.",
    url: "https://www.meetyoulive.net",
    type: "website",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 835,
        alt: "MeetYouLive - Conecta en vivo",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "MeetYouLive - App de Citas con Streaming en Vivo",
    description: "Conoce personas, mira directos en vivo y conecta en tiempo real.",
  },
  alternates: {
    canonical: "https://www.meetyoulive.net",
  },
};

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
            <span className={styles.btnText}>Entrar ahora</span>
            <span className={styles.btnGlow}></span>
          </Link>
          
          <Link href="/register" className={styles.btnSecondaryLanding}>
            <span className={styles.btnText}>Crear cuenta</span>
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
