import Link from "next/link";

/**
 * Static public landing page for Stripe review and new visitors.
 * No authentication, no API calls, no loading states.
 * Loads instantly to show business information.
 */
export default function LandingPage() {
  return (
    <>
      <div className="landing-page">
        <div className="landing-container">
          {/* Hero Section */}
          <section className="hero-section">
            <h1 className="hero-title">MeetYouLive</h1>
            <p className="hero-subtitle">Live Social & Creator Platform</p>
            <p className="hero-description">
              Connect through live video, meet new people, and support your favorite creators in real-time.
            </p>
            <div className="hero-buttons">
              <Link href="/login" className="cta-button primary">
                Get Started
              </Link>
              <Link href="/feed" className="cta-button secondary">
                Explore
              </Link>
            </div>
          </section>

          {/* How It Works Section */}
          <section className="info-section">
            <h2 className="section-title">How It Works</h2>
            <div className="features-grid">
              <div className="feature-card">
                <div className="feature-icon">🎥</div>
                <h3>Live Streaming</h3>
                <p>Watch and interact with creators streaming live video content in real-time.</p>
              </div>
              <div className="feature-card">
                <div className="feature-icon">💬</div>
                <h3>Social Discovery</h3>
                <p>Meet new people, chat, and build connections with users from around the world.</p>
              </div>
              <div className="feature-card">
                <div className="feature-icon">🎁</div>
                <h3>Send Gifts</h3>
                <p>Support creators by sending virtual gifts during their live streams.</p>
              </div>
              <div className="feature-card">
                <div className="feature-icon">⭐</div>
                <h3>Creator Tools</h3>
                <p>Start your own live streams and build your audience on the platform.</p>
              </div>
            </div>
          </section>

          {/* Monetization Section */}
          <section className="info-section">
            <h2 className="section-title">Digital Economy</h2>
            <div className="monetization-content">
              <p className="section-description">
                <strong>Digital Coins:</strong> Purchase coins to send gifts to creators, unlock premium features, 
                and enhance your experience on the platform.
              </p>
              <p className="section-description">
                <strong>Virtual Gifts:</strong> Express appreciation and support creators by sending 
                beautiful animated gifts during live streams.
              </p>
              <p className="section-description">
                <strong>Subscriptions:</strong> Subscribe to your favorite creators for exclusive content 
                and special perks.
              </p>
            </div>
          </section>

          {/* Creator Section */}
          <section className="info-section">
            <h2 className="section-title">For Creators</h2>
            <div className="creator-content">
              <p className="section-description">
                <strong>Become an Approved Creator:</strong> Apply to become a creator and start earning 
                from your live streams and content.
              </p>
              <p className="section-description">
                <strong>Earn from Gifts:</strong> Receive virtual gifts from viewers during your live streams 
                and convert them into real earnings.
              </p>
              <p className="section-description">
                <strong>Build Your Audience:</strong> Connect with fans, grow your following, and monetize 
                your content through multiple revenue streams.
              </p>
              <p className="section-description">
                All creators must go through an approval process to ensure quality and safety standards.
              </p>
            </div>
          </section>

          {/* Safety Section */}
          <section className="info-section">
            <h2 className="section-title">Safety & Moderation</h2>
            <div className="safety-content">
              <p className="section-description">
                <strong>18+ Platform:</strong> MeetYouLive is an adult platform (18+). All users must be 
                at least 18 years old to register and use the service.
              </p>
              <p className="section-description">
                <strong>Content Moderation:</strong> We employ active moderation to maintain community 
                standards and ensure a safe environment for all users.
              </p>
              <p className="section-description">
                <strong>Reporting System:</strong> Users can report inappropriate content or behavior. 
                Our team reviews all reports promptly.
              </p>
              <p className="section-description">
                <strong>Community Guidelines:</strong> All users must follow our community guidelines. 
                Violations may result in account suspension or termination.
              </p>
            </div>
          </section>

          {/* Contact Section */}
          <section className="info-section">
            <h2 className="section-title">Contact & Support</h2>
            <div className="contact-content">
              <p className="section-description">
                For questions, support, or business inquiries, please reach out to us through the 
                platform's support channels after creating an account.
              </p>
              <p className="section-description">
                <Link href="/terms" className="info-link">Terms of Service</Link> | 
                <Link href="/privacy" className="info-link">Privacy Policy</Link>
              </p>
            </div>
          </section>

          {/* Footer CTA */}
          <section className="footer-cta">
            <h2>Ready to Get Started?</h2>
            <p>Join thousands of users connecting and creating on MeetYouLive</p>
            <Link href="/login" className="cta-button primary large">
              Join Now
            </Link>
          </section>
        </div>
      </div>


      <style jsx>{`
        .landing-page {
          min-height: 100vh;
          background: linear-gradient(135deg, rgba(15,8,32,1) 0%, rgba(30,12,60,1) 100%);
          padding: 2rem 1rem;
        }

        .landing-container {
          max-width: 1200px;
          margin: 0 auto;
        }

        /* Hero Section */
        .hero-section {
          text-align: center;
          padding: 4rem 1rem;
          margin-bottom: 4rem;
        }

        .hero-title {
          font-size: 4rem;
          font-weight: 900;
          background: linear-gradient(135deg, #e040fb, #8b5cf6);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          margin: 0 0 1rem 0;
        }

        .hero-subtitle {
          font-size: 1.8rem;
          font-weight: 700;
          color: var(--text);
          margin: 0 0 1.5rem 0;
        }

        .hero-description {
          font-size: 1.2rem;
          color: var(--text-muted);
          margin: 0 0 3rem 0;
          max-width: 700px;
          margin-left: auto;
          margin-right: auto;
          line-height: 1.6;
        }

        .hero-buttons {
          display: flex;
          gap: 1rem;
          justify-content: center;
          flex-wrap: wrap;
        }

        .cta-button {
          padding: 1rem 2.5rem;
          border-radius: 999px;
          font-weight: 800;
          font-size: 1.1rem;
          cursor: pointer;
          transition: all 0.3s;
          text-decoration: none;
          display: inline-block;
        }

        .cta-button.primary {
          background: linear-gradient(135deg, #e040fb, #8b5cf6);
          color: white;
          border: none;
          box-shadow: 0 4px 15px rgba(224,64,251,0.3);
        }

        .cta-button.primary:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 25px rgba(224,64,251,0.5);
        }

        .cta-button.secondary {
          background: rgba(30,12,60,0.6);
          color: #e040fb;
          border: 2px solid rgba(224,64,251,0.5);
        }

        .cta-button.secondary:hover {
          background: rgba(30,12,60,0.8);
          border-color: #e040fb;
          box-shadow: 0 0 20px rgba(224,64,251,0.3);
        }

        .cta-button.large {
          padding: 1.2rem 3rem;
          font-size: 1.2rem;
        }

        /* Info Sections */
        .info-section {
          margin-bottom: 5rem;
          padding: 0 1rem;
        }

        .section-title {
          font-size: 2.5rem;
          font-weight: 800;
          color: var(--text);
          margin: 0 0 2rem 0;
          text-align: center;
        }

        .section-description {
          font-size: 1.1rem;
          color: var(--text-muted);
          margin: 1.5rem 0;
          line-height: 1.7;
          max-width: 900px;
          margin-left: auto;
          margin-right: auto;
        }

        .section-description strong {
          color: var(--text);
          font-weight: 700;
        }

        /* Features Grid */
        .features-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: 2rem;
          margin-top: 3rem;
        }

        .feature-card {
          background: rgba(30,12,60,0.6);
          border: 1px solid rgba(139,92,246,0.3);
          border-radius: var(--radius);
          padding: 2rem;
          text-align: center;
          transition: all 0.3s;
        }

        .feature-card:hover {
          border-color: rgba(139,92,246,0.6);
          background: rgba(30,12,60,0.8);
          transform: translateY(-4px);
          box-shadow: 0 8px 20px rgba(0,0,0,0.3);
        }

        .feature-icon {
          font-size: 3.5rem;
          margin-bottom: 1rem;
        }

        .feature-card h3 {
          font-size: 1.4rem;
          font-weight: 700;
          color: var(--text);
          margin: 0 0 1rem 0;
        }

        .feature-card p {
          font-size: 1rem;
          color: var(--text-muted);
          line-height: 1.6;
          margin: 0;
        }

        /* Content Sections */
        .monetization-content,
        .creator-content,
        .safety-content,
        .contact-content {
          max-width: 900px;
          margin: 0 auto;
        }

        .info-link {
          color: #e040fb;
          text-decoration: none;
          font-weight: 600;
          margin: 0 0.5rem;
          transition: color 0.2s;
        }

        .info-link:hover {
          color: #8b5cf6;
          text-decoration: underline;
        }

        /* Footer CTA */
        .footer-cta {
          text-align: center;
          padding: 5rem 1rem;
          margin-top: 4rem;
          background: linear-gradient(135deg, rgba(30,12,60,0.8) 0%, rgba(12,5,25,0.9) 100%);
          border: 1px solid rgba(139,92,246,0.4);
          border-radius: var(--radius);
        }

        .footer-cta h2 {
          font-size: 2.5rem;
          font-weight: 800;
          color: var(--text);
          margin: 0 0 1rem 0;
        }

        .footer-cta p {
          font-size: 1.2rem;
          color: var(--text-muted);
          margin: 0 0 2.5rem 0;
        }

        /* Mobile Optimizations */
        @media (max-width: 768px) {
          .hero-title {
            font-size: 2.5rem;
          }

          .hero-subtitle {
            font-size: 1.3rem;
          }

          .hero-description {
            font-size: 1rem;
          }

          .cta-button {
            padding: 0.85rem 1.5rem;
            font-size: 1rem;
          }

          .cta-button.large {
            padding: 1rem 2rem;
            font-size: 1.1rem;
          }

          .section-title {
            font-size: 1.8rem;
          }

          .section-description {
            font-size: 1rem;
          }

          .features-grid {
            grid-template-columns: 1fr;
            gap: 1.5rem;
          }

          .feature-icon {
            font-size: 3rem;
          }

          .feature-card h3 {
            font-size: 1.2rem;
          }

          .footer-cta {
            padding: 3rem 1rem;
          }

          .footer-cta h2 {
            font-size: 1.8rem;
          }

          .footer-cta p {
            font-size: 1rem;
          }
        }
      `}</style>
    </>
  );
}
