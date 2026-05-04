import Link from "next/link";

// Force static generation (no dynamic server rendering)
export const dynamic = 'force-static';

export default function LandingPage() {
  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, rgba(15,8,32,1) 0%, rgba(30,12,60,1) 100%)',
      padding: '2rem 1rem',
      color: '#ffffff'
    }}>
      <div style={{
        maxWidth: '1200px',
        margin: '0 auto'
      }}>
        {/* Proof Text - Visible confirmation that static landing loaded */}
        <div style={{
          position: 'fixed',
          bottom: '10px',
          left: '10px',
          background: 'rgba(139,92,246,0.9)',
          color: '#fff',
          padding: '0.5rem 1rem',
          borderRadius: '8px',
          fontSize: '0.75rem',
          fontWeight: '600',
          zIndex: '9999',
          boxShadow: '0 2px 10px rgba(0,0,0,0.3)'
        }}>
          ✓ MeetYouLive Public Landing Ready
        </div>

        {/* Hero Section */}
        <header style={{
          textAlign: 'center',
          padding: '3rem 1rem',
          marginBottom: '3rem'
        }}>
          <h1 style={{
            fontSize: '3rem',
            fontWeight: '800',
            background: 'linear-gradient(135deg, #e040fb, #8b5cf6)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            marginBottom: '1rem'
          }}>
            MeetYouLive
          </h1>
          <p style={{
            fontSize: '1.25rem',
            color: '#94a3b8',
            maxWidth: '700px',
            margin: '0 auto 2rem',
            lineHeight: '1.6'
          }}>
            The premier live-streaming platform combining real-time entertainment with meaningful connections. Stream, connect, and earn in a vibrant digital community.
          </p>
          <div style={{
            display: 'flex',
            gap: '1rem',
            justifyContent: 'center',
            flexWrap: 'wrap'
          }}>
            <Link href="/login" style={{
              padding: '0.875rem 2rem',
              background: 'linear-gradient(135deg, #e040fb, #8b5cf6)',
              borderRadius: '999px',
              fontWeight: '700',
              fontSize: '1rem',
              display: 'inline-block',
              boxShadow: '0 4px 15px rgba(224,64,251,0.3)',
              transition: 'all 0.3s'
            }}>
              Get Started
            </Link>
            <Link href="/register" style={{
              padding: '0.875rem 2rem',
              background: 'rgba(139,92,246,0.2)',
              border: '2px solid rgba(139,92,246,0.5)',
              borderRadius: '999px',
              fontWeight: '700',
              fontSize: '1rem',
              display: 'inline-block',
              transition: 'all 0.3s'
            }}>
              Sign Up Free
            </Link>
          </div>
        </header>

        {/* How It Works Section */}
        <section style={{
          marginBottom: '4rem',
          padding: '2rem',
          background: 'rgba(30,12,60,0.6)',
          borderRadius: '16px',
          border: '1px solid rgba(139,92,246,0.3)'
        }}>
          <h2 style={{
            fontSize: '2rem',
            fontWeight: '800',
            textAlign: 'center',
            marginBottom: '2rem'
          }}>
            How It Works
          </h2>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
            gap: '1.5rem'
          }}>
            <div style={{ textAlign: 'center', padding: '1rem' }}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📱</div>
              <h3 style={{ fontSize: '1.25rem', fontWeight: '700', marginBottom: '0.5rem' }}>Sign Up</h3>
              <p style={{ color: '#94a3b8', lineHeight: '1.5' }}>
                Create your free account in seconds. Choose between viewer or creator modes.
              </p>
            </div>
            <div style={{ textAlign: 'center', padding: '1rem' }}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🎥</div>
              <h3 style={{ fontSize: '1.25rem', fontWeight: '700', marginBottom: '0.5rem' }}>Go Live</h3>
              <p style={{ color: '#94a3b8', lineHeight: '1.5' }}>
                Start streaming instantly with HD quality. Share your passion with the world.
              </p>
            </div>
            <div style={{ textAlign: 'center', padding: '1rem' }}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>💰</div>
              <h3 style={{ fontSize: '1.25rem', fontWeight: '700', marginBottom: '0.5rem' }}>Earn Money</h3>
              <p style={{ color: '#94a3b8', lineHeight: '1.5' }}>
                Monetize your content through virtual gifts, subscriptions, and private calls.
              </p>
            </div>
          </div>
        </section>

        {/* Digital Economy Section */}
        <section style={{
          marginBottom: '4rem',
          padding: '2rem',
          background: 'rgba(12,5,25,0.8)',
          borderRadius: '16px',
          border: '1px solid rgba(139,92,246,0.3)'
        }}>
          <h2 style={{
            fontSize: '2rem',
            fontWeight: '800',
            textAlign: 'center',
            marginBottom: '2rem'
          }}>
            Powered by a Thriving Digital Economy
          </h2>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '1.5rem'
          }}>
            <div style={{ padding: '1.5rem' }}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: '700', marginBottom: '0.75rem', color: '#e040fb' }}>
                🎁 Virtual Gifts
              </h3>
              <p style={{ color: '#94a3b8', lineHeight: '1.6' }}>
                Viewers send gifts during live streams to support their favorite creators. From roses to luxury yachts, show your appreciation in style.
              </p>
            </div>
            <div style={{ padding: '1.5rem' }}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: '700', marginBottom: '0.75rem', color: '#8b5cf6' }}>
                📞 Private Video Calls
              </h3>
              <p style={{ color: '#94a3b8', lineHeight: '1.6' }}>
                Connect one-on-one with creators through secure, paid video calls. Build deeper relationships and exclusive interactions.
              </p>
            </div>
            <div style={{ padding: '1.5rem' }}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: '700', marginBottom: '0.75rem', color: '#22d3ee' }}>
                ⚡ Premium Features
              </h3>
              <p style={{ color: '#94a3b8', lineHeight: '1.6' }}>
                Unlock VIP subscriptions, exclusive content, and priority access to top streamers. Premium benefits for dedicated fans.
              </p>
            </div>
          </div>
        </section>

        {/* For Creators Section */}
        <section style={{
          marginBottom: '4rem',
          padding: '2rem',
          background: 'rgba(30,12,60,0.6)',
          borderRadius: '16px',
          border: '1px solid rgba(139,92,246,0.3)'
        }}>
          <h2 style={{
            fontSize: '2rem',
            fontWeight: '800',
            textAlign: 'center',
            marginBottom: '2rem'
          }}>
            Built for Creators
          </h2>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
            gap: '1.5rem',
            textAlign: 'center'
          }}>
            <div style={{ padding: '1rem' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>💵</div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: '700', marginBottom: '0.5rem' }}>60% Revenue Share</h3>
              <p style={{ color: '#94a3b8', fontSize: '0.95rem', lineHeight: '1.5' }}>
                Industry-leading creator payouts. Keep more of what you earn.
              </p>
            </div>
            <div style={{ padding: '1rem' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>📊</div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: '700', marginBottom: '0.5rem' }}>Analytics Dashboard</h3>
              <p style={{ color: '#94a3b8', fontSize: '0.95rem', lineHeight: '1.5' }}>
                Track earnings, viewers, and engagement in real-time.
              </p>
            </div>
            <div style={{ padding: '1rem' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>🌐</div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: '700', marginBottom: '0.5rem' }}>Multi-Guest Streaming</h3>
              <p style={{ color: '#94a3b8', fontSize: '0.95rem', lineHeight: '1.5' }}>
                Collaborate with up to 4 co-hosts simultaneously.
              </p>
            </div>
            <div style={{ padding: '1rem' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>🏆</div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: '700', marginBottom: '0.5rem' }}>VS Battles</h3>
              <p style={{ color: '#94a3b8', fontSize: '0.95rem', lineHeight: '1.5' }}>
                Compete live with other creators to boost engagement.
              </p>
            </div>
          </div>
        </section>

        {/* Safety & Moderation Section */}
        <section style={{
          marginBottom: '4rem',
          padding: '2rem',
          background: 'rgba(12,5,25,0.8)',
          borderRadius: '16px',
          border: '1px solid rgba(139,92,246,0.3)',
          textAlign: 'center'
        }}>
          <h2 style={{
            fontSize: '2rem',
            fontWeight: '800',
            marginBottom: '1rem'
          }}>
            Safety & Moderation
          </h2>
          <p style={{
            color: '#94a3b8',
            lineHeight: '1.6',
            maxWidth: '800px',
            margin: '0 auto 1.5rem',
            fontSize: '1.05rem'
          }}>
            We maintain a safe, respectful community through 24/7 moderation, automated content filtering, and strict community guidelines. 
            Our dedicated trust & safety team ensures every interaction meets our standards.
          </p>
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            gap: '2rem',
            flexWrap: 'wrap',
            marginTop: '1.5rem'
          }}>
            <div>
              <div style={{ fontSize: '1.8rem', marginBottom: '0.5rem' }}>🛡️</div>
              <p style={{ color: '#94a3b8', fontSize: '0.9rem' }}>Verified Profiles</p>
            </div>
            <div>
              <div style={{ fontSize: '1.8rem', marginBottom: '0.5rem' }}>🔒</div>
              <p style={{ color: '#94a3b8', fontSize: '0.9rem' }}>Secure Payments</p>
            </div>
            <div>
              <div style={{ fontSize: '1.8rem', marginBottom: '0.5rem' }}>👁️</div>
              <p style={{ color: '#94a3b8', fontSize: '0.9rem' }}>24/7 Monitoring</p>
            </div>
            <div>
              <div style={{ fontSize: '1.8rem', marginBottom: '0.5rem' }}>⚖️</div>
              <p style={{ color: '#94a3b8', fontSize: '0.9rem' }}>Fair Enforcement</p>
            </div>
          </div>
        </section>

        {/* Contact & Support Section */}
        <section style={{
          marginBottom: '4rem',
          padding: '2rem',
          background: 'rgba(30,12,60,0.6)',
          borderRadius: '16px',
          border: '1px solid rgba(139,92,246,0.3)',
          textAlign: 'center'
        }}>
          <h2 style={{
            fontSize: '2rem',
            fontWeight: '800',
            marginBottom: '1rem'
          }}>
            Contact & Support
          </h2>
          <p style={{
            color: '#94a3b8',
            lineHeight: '1.6',
            maxWidth: '600px',
            margin: '0 auto',
            fontSize: '1.05rem'
          }}>
            Need help? Our support team is available to assist you. Reach out through in-app support, 
            or visit our help center for guides, FAQs, and troubleshooting resources.
          </p>
        </section>

        {/* Footer CTA */}
        <section style={{
          textAlign: 'center',
          padding: '3rem 2rem',
          background: 'linear-gradient(135deg, rgba(30,12,60,0.8) 0%, rgba(12,5,25,0.9) 100%)',
          borderRadius: '16px',
          border: '1px solid rgba(139,92,246,0.4)'
        }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🚀</div>
          <h2 style={{
            fontSize: '2rem',
            fontWeight: '800',
            marginBottom: '1rem'
          }}>
            Ready to Get Started?
          </h2>
          <p style={{
            color: '#94a3b8',
            lineHeight: '1.6',
            maxWidth: '600px',
            margin: '0 auto 2rem',
            fontSize: '1.1rem'
          }}>
            Join thousands of creators and viewers already on MeetYouLive. Start streaming, connecting, and earning today.
          </p>
          <Link href="/register" style={{
            padding: '1rem 2.5rem',
            background: 'linear-gradient(135deg, #e040fb, #8b5cf6)',
            borderRadius: '999px',
            fontWeight: '800',
            fontSize: '1.1rem',
            display: 'inline-block',
            boxShadow: '0 4px 20px rgba(224,64,251,0.4)',
            transition: 'all 0.3s'
          }}>
            Create Your Account
          </Link>
        </section>

        {/* Footer Links */}
        <footer style={{
          marginTop: '3rem',
          padding: '2rem 1rem',
          textAlign: 'center',
          borderTop: '1px solid rgba(139,92,246,0.2)'
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            gap: '2rem',
            flexWrap: 'wrap',
            marginBottom: '1rem'
          }}>
            <Link href="/terms" style={{ color: '#94a3b8', fontSize: '0.9rem' }}>Terms of Service</Link>
            <Link href="/privacy" style={{ color: '#94a3b8', fontSize: '0.9rem' }}>Privacy Policy</Link>
            <Link href="/refunds" style={{ color: '#94a3b8', fontSize: '0.9rem' }}>Refund Policy</Link>
          </div>
          <p style={{ color: '#64748b', fontSize: '0.85rem', margin: '0' }}>
            © 2026 MeetYouLive. All rights reserved.
          </p>
        </footer>
      </div>
    </div>
  );
}
