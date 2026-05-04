import Link from "next/link";
import styles from "./landing.module.css";

/**
 * Static public landing page for Stripe review and new visitors.
 * No authentication, no API calls, no loading states.
 * Loads instantly to show business information.
 */
export default function LandingPage() {
  return (
    <div className={styles.landingPage}>
      <div className={styles.landingContainer}>
        {/* Hero Section */}
        <section className={styles.heroSection}>
          <h1 className={styles.heroTitle}>MeetYouLive</h1>
          <p className={styles.heroSubtitle}>Live Social & Creator Platform</p>
          <p className={styles.heroDescription}>
            Connect through live video, meet new people, and support your favorite creators in real-time.
          </p>
          <div className={styles.heroButtons}>
            <Link href="/login" className={`${styles.ctaButton} ${styles.primary}`}>
              Get Started
            </Link>
            <Link href="/feed" className={`${styles.ctaButton} ${styles.secondary}`}>
              Explore
            </Link>
          </div>
        </section>

        {/* How It Works Section */}
        <section className={styles.infoSection}>
          <h2 className={styles.sectionTitle}>How It Works</h2>
          <div className={styles.featuresGrid}>
            <div className={styles.featureCard}>
              <div className={styles.featureIcon}>🎥</div>
              <h3>Live Streaming</h3>
              <p>Watch and interact with creators streaming live video content in real-time.</p>
            </div>
            <div className={styles.featureCard}>
              <div className={styles.featureIcon}>💬</div>
              <h3>Social Discovery</h3>
              <p>Meet new people, chat, and build connections with users from around the world.</p>
            </div>
            <div className={styles.featureCard}>
              <div className={styles.featureIcon}>🎁</div>
              <h3>Send Gifts</h3>
              <p>Support creators by sending virtual gifts during their live streams.</p>
            </div>
            <div className={styles.featureCard}>
              <div className={styles.featureIcon}>⭐</div>
              <h3>Creator Tools</h3>
              <p>Start your own live streams and build your audience on the platform.</p>
            </div>
          </div>
        </section>

        {/* Monetization Section */}
        <section className={styles.infoSection}>
          <h2 className={styles.sectionTitle}>Digital Economy</h2>
          <div className={styles.monetizationContent}>
            <p className={styles.sectionDescription}>
              <strong>Digital Coins:</strong> Purchase coins to send gifts to creators, unlock premium features, 
              and enhance your experience on the platform.
            </p>
            <p className={styles.sectionDescription}>
              <strong>Virtual Gifts:</strong> Express appreciation and support creators by sending 
              beautiful animated gifts during live streams.
            </p>
            <p className={styles.sectionDescription}>
              <strong>Subscriptions:</strong> Subscribe to your favorite creators for exclusive content 
              and special perks.
            </p>
          </div>
        </section>

        {/* Creator Section */}
        <section className={styles.infoSection}>
          <h2 className={styles.sectionTitle}>For Creators</h2>
          <div className={styles.creatorContent}>
            <p className={styles.sectionDescription}>
              <strong>Become an Approved Creator:</strong> Apply to become a creator and start earning 
              from your live streams and content.
            </p>
            <p className={styles.sectionDescription}>
              <strong>Earn from Gifts:</strong> Receive virtual gifts from viewers during your live streams 
              and convert them into real earnings.
            </p>
            <p className={styles.sectionDescription}>
              <strong>Build Your Audience:</strong> Connect with fans, grow your following, and monetize 
              your content through multiple revenue streams.
            </p>
            <p className={styles.sectionDescription}>
              All creators must go through an approval process to ensure quality and safety standards.
            </p>
          </div>
        </section>

        {/* Safety Section */}
        <section className={styles.infoSection}>
          <h2 className={styles.sectionTitle}>Safety & Moderation</h2>
          <div className={styles.safetyContent}>
            <p className={styles.sectionDescription}>
              <strong>18+ Platform:</strong> MeetYouLive is an adult platform (18+). All users must be 
              at least 18 years old to register and use the service.
            </p>
            <p className={styles.sectionDescription}>
              <strong>Content Moderation:</strong> We employ active moderation to maintain community 
              standards and ensure a safe environment for all users.
            </p>
            <p className={styles.sectionDescription}>
              <strong>Reporting System:</strong> Users can report inappropriate content or behavior. 
              Our team reviews all reports promptly.
            </p>
            <p className={styles.sectionDescription}>
              <strong>Community Guidelines:</strong> All users must follow our community guidelines. 
              Violations may result in account suspension or termination.
            </p>
          </div>
        </section>

        {/* Contact Section */}
        <section className={styles.infoSection}>
          <h2 className={styles.sectionTitle}>Contact & Support</h2>
          <div className={styles.contactContent}>
            <p className={styles.sectionDescription}>
              For questions, support, or business inquiries, please reach out to us through the 
              platform's support channels after creating an account.
            </p>
            <p className={styles.sectionDescription}>
              <Link href="/terms" className={styles.infoLink}>Terms of Service</Link> | 
              <Link href="/privacy" className={styles.infoLink}>Privacy Policy</Link>
            </p>
          </div>
        </section>

        {/* Footer CTA */}
        <section className={styles.footerCta}>
          <h2>Ready to Get Started?</h2>
          <p>Join thousands of users connecting and creating on MeetYouLive</p>
          <Link href="/login" className={`${styles.ctaButton} ${styles.primary} ${styles.large}`}>
            Join Now
          </Link>
        </section>
      </div>
    </div>
  );
}
