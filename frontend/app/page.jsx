import Image from "next/image";

export default function LandingPage() {
  return (
    <>
      <div className="landing-page">
        {/* Header with Logo */}
        <header className="landing-header">
          <div className="logo-container">
            <Image 
              src="/logo.svg" 
              alt="MeetYouLive Logo" 
              width={120} 
              height={84}
              priority
            />
            <h1 className="logo-text">MeetYouLive</h1>
          </div>
        </header>

        {/* Hero Section */}
        <section className="hero-section">
          <h2 className="hero-title">MeetYouLive – Live Social &amp; Creator Platform</h2>
          <p className="hero-description">
            Connect with people, watch live streams, and interact with creators in real time.
          </p>
        </section>

        {/* Main Content */}
        <div className="content-container">
          {/* Section 1: How it Works */}
          <section className="content-section">
            <div className="section-icon">🎬</div>
            <h3 className="section-title">How it Works</h3>
            <ul className="section-list">
              <li>Users join and explore profiles</li>
              <li>Watch live streams</li>
              <li>Send virtual gifts</li>
              <li>Subscribe to creators</li>
            </ul>
          </section>

          {/* Section 2: Monetization */}
          <section className="content-section">
            <div className="section-icon">💰</div>
            <h3 className="section-title">Monetization</h3>
            <ul className="section-list">
              <li>Digital coins</li>
              <li>Virtual gifts</li>
              <li>Premium subscriptions</li>
              <li>Platform takes a service fee</li>
            </ul>
          </section>

          {/* Section 3: Creators */}
          <section className="content-section">
            <div className="section-icon">⭐</div>
            <h3 className="section-title">Creators</h3>
            <ul className="section-list">
              <li>Can go live</li>
              <li>Receive gifts</li>
              <li>Earn income</li>
              <li>Must be approved</li>
            </ul>
          </section>

          {/* Section 4: Safety */}
          <section className="content-section">
            <div className="section-icon">🛡️</div>
            <h3 className="section-title">Safety</h3>
            <ul className="section-list">
              <li>Moderation system</li>
              <li>Reporting system</li>
              <li>18+ only</li>
            </ul>
          </section>
        </div>

        {/* Footer */}
        <footer className="landing-footer">
          <p className="footer-contact">
            Contact: <a href="mailto:support@meetyoulive.com">support@meetyoulive.com</a>
          </p>
          <p className="footer-disclaimer">
            All transactions are digital services
          </p>
        </footer>
      </div>

      <style jsx>{`
        .landing-page {
          min-height: 100vh;
          background: linear-gradient(135deg, rgba(15,8,32,1) 0%, rgba(30,12,60,1) 100%);
          color: white;
          padding: 0;
          margin: 0;
        }

        /* Header */
        .landing-header {
          padding: 2rem 1rem;
          text-align: center;
          border-bottom: 1px solid rgba(139,92,246,0.2);
        }

        .logo-container {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1rem;
        }

        .logo-text {
          font-size: 2rem;
          font-weight: 800;
          background: linear-gradient(135deg, #ff0088, #8b5cf6);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          margin: 0;
        }

        /* Hero Section */
        .hero-section {
          padding: 3rem 1.5rem;
          text-align: center;
          max-width: 800px;
          margin: 0 auto;
        }

        .hero-title {
          font-size: 2rem;
          font-weight: 800;
          margin: 0 0 1.5rem 0;
          line-height: 1.3;
          color: #ffffff;
        }

        .hero-description {
          font-size: 1.25rem;
          color: rgba(255,255,255,0.85);
          margin: 0;
          line-height: 1.6;
        }

        /* Content Container */
        .content-container {
          max-width: 1000px;
          margin: 0 auto;
          padding: 2rem 1.5rem;
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 2rem;
        }

        /* Content Sections */
        .content-section {
          background: rgba(30,12,60,0.6);
          border: 1px solid rgba(139,92,246,0.3);
          border-radius: 12px;
          padding: 2rem;
          transition: all 0.3s ease;
        }

        .content-section:hover {
          border-color: rgba(139,92,246,0.6);
          background: rgba(30,12,60,0.8);
          transform: translateY(-4px);
          box-shadow: 0 8px 20px rgba(0,0,0,0.3);
        }

        .section-icon {
          font-size: 3rem;
          margin-bottom: 1rem;
          text-align: center;
        }

        .section-title {
          font-size: 1.5rem;
          font-weight: 700;
          margin: 0 0 1.25rem 0;
          text-align: center;
          color: #ffffff;
        }

        .section-list {
          list-style: none;
          padding: 0;
          margin: 0;
        }

        .section-list li {
          padding: 0.75rem 0;
          font-size: 1rem;
          color: rgba(255,255,255,0.8);
          line-height: 1.5;
          border-bottom: 1px solid rgba(139,92,246,0.15);
        }

        .section-list li:last-child {
          border-bottom: none;
        }

        .section-list li::before {
          content: "✓ ";
          color: #8b5cf6;
          font-weight: bold;
          margin-right: 0.5rem;
        }

        /* Footer */
        .landing-footer {
          padding: 3rem 1.5rem 2rem;
          text-align: center;
          border-top: 1px solid rgba(139,92,246,0.2);
          margin-top: 3rem;
        }

        .footer-contact {
          font-size: 1rem;
          margin: 0 0 1rem 0;
          color: rgba(255,255,255,0.85);
        }

        .footer-contact a {
          color: #8b5cf6;
          text-decoration: none;
          font-weight: 600;
          transition: color 0.3s;
        }

        .footer-contact a:hover {
          color: #a78bfa;
        }

        .footer-disclaimer {
          font-size: 0.9rem;
          color: rgba(255,255,255,0.6);
          margin: 0;
          font-style: italic;
        }

        /* Mobile Responsive */
        @media (max-width: 768px) {
          .landing-header {
            padding: 1.5rem 1rem;
          }

          .logo-text {
            font-size: 1.5rem;
          }

          .hero-section {
            padding: 2rem 1rem;
          }

          .hero-title {
            font-size: 1.5rem;
            margin-bottom: 1rem;
          }

          .hero-description {
            font-size: 1.1rem;
          }

          .content-container {
            padding: 1.5rem 1rem;
            gap: 1.5rem;
            grid-template-columns: 1fr;
          }

          .content-section {
            padding: 1.5rem;
          }

          .section-icon {
            font-size: 2.5rem;
          }

          .section-title {
            font-size: 1.25rem;
          }

          .section-list li {
            font-size: 0.95rem;
            padding: 0.6rem 0;
          }

          .landing-footer {
            padding: 2rem 1rem 1.5rem;
            margin-top: 2rem;
          }

          .footer-contact {
            font-size: 0.95rem;
          }

          .footer-disclaimer {
            font-size: 0.85rem;
          }
        }

        /* Extra small devices */
        @media (max-width: 480px) {
          .hero-title {
            font-size: 1.25rem;
          }

          .hero-description {
            font-size: 1rem;
          }

          .section-icon {
            font-size: 2rem;
          }

          .section-title {
            font-size: 1.1rem;
          }
        }
      `}</style>
    </>
  );
}
