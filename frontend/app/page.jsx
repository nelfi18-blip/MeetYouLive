import Link from "next/link";
import Image from "next/image";

// Force static generation
export const dynamic = 'force-static';

export default function LandingPage() {
  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, rgba(15,8,32,1) 0%, rgba(30,12,60,1) 100%)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem 1rem',
      color: '#ffffff'
    }}>
      {/* Hero Section */}
      <div style={{
        textAlign: 'center',
        maxWidth: '600px',
        marginBottom: '3rem'
      }}>
        <div style={{
          width: '120px',
          height: '120px',
          margin: '0 auto 2rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          filter: 'drop-shadow(0 0 40px rgba(224, 64, 251, 0.5))'
        }}>
          <Image
            src="/logo.svg"
            alt="MeetYouLive"
            width={120}
            height={120}
            priority
          />
        </div>

        <h1 style={{
          fontSize: '3.5rem',
          fontWeight: '800',
          background: 'linear-gradient(135deg, #e040fb, #22d3ee)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
          marginBottom: '1rem'
        }}>
          MeetYouLive
        </h1>
        
        <p style={{
          fontSize: '1.5rem',
          color: '#94a3b8',
          marginBottom: '3rem',
          lineHeight: '1.6'
        }}>
          Match. Watch. Connect.
        </p>

        <div style={{
          display: 'flex',
          gap: '1rem',
          justifyContent: 'center',
          flexWrap: 'wrap'
        }}>
          <Link href="/feed" style={{
            padding: '1rem 2.5rem',
            background: 'linear-gradient(135deg, #e040fb, #8b5cf6)',
            borderRadius: '999px',
            fontWeight: '700',
            fontSize: '1.1rem',
            display: 'inline-block',
            boxShadow: '0 8px 24px rgba(224,64,251,0.4)',
            transition: 'all 0.3s',
            border: 'none',
            color: 'white'
          }}>
            Entrar ahora
          </Link>
          
          <Link href="/register" style={{
            padding: '1rem 2.5rem',
            background: 'rgba(139,92,246,0.2)',
            border: '2px solid rgba(139,92,246,0.5)',
            borderRadius: '999px',
            fontWeight: '700',
            fontSize: '1.1rem',
            display: 'inline-block',
            transition: 'all 0.3s',
            color: 'white'
          }}>
            Crear cuenta
          </Link>
        </div>
      </div>

      {/* Features Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '2rem',
        maxWidth: '900px',
        width: '100%',
        marginBottom: '3rem'
      }}>
        <div style={{
          textAlign: 'center',
          padding: '2rem',
          background: 'rgba(30,12,60,0.6)',
          borderRadius: '20px',
          border: '1px solid rgba(224,64,251,0.2)',
          transition: 'all 0.3s'
        }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔥</div>
          <h3 style={{ fontSize: '1.2rem', fontWeight: '700', marginBottom: '0.5rem' }}>Match</h3>
          <p style={{ color: '#94a3b8', fontSize: '0.9rem' }}>Swipe & connect</p>
        </div>

        <div style={{
          textAlign: 'center',
          padding: '2rem',
          background: 'rgba(30,12,60,0.6)',
          borderRadius: '20px',
          border: '1px solid rgba(224,64,251,0.2)',
          transition: 'all 0.3s'
        }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔴</div>
          <h3 style={{ fontSize: '1.2rem', fontWeight: '700', marginBottom: '0.5rem' }}>Live</h3>
          <p style={{ color: '#94a3b8', fontSize: '0.9rem' }}>Watch streams</p>
        </div>

        <div style={{
          textAlign: 'center',
          padding: '2rem',
          background: 'rgba(30,12,60,0.6)',
          borderRadius: '20px',
          border: '1px solid rgba(224,64,251,0.2)',
          transition: 'all 0.3s'
        }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>💬</div>
          <h3 style={{ fontSize: '1.2rem', fontWeight: '700', marginBottom: '0.5rem' }}>Chat</h3>
          <p style={{ color: '#94a3b8', fontSize: '0.9rem' }}>Message instantly</p>
        </div>
      </div>

      {/* Footer */}
      <div style={{
        display: 'flex',
        gap: '2rem',
        flexWrap: 'wrap',
        justifyContent: 'center',
        fontSize: '0.85rem',
        color: '#64748b',
        marginTop: '2rem'
      }}>
        <Link href="/terms" style={{ color: '#94a3b8' }}>Terms</Link>
        <Link href="/privacy" style={{ color: '#94a3b8' }}>Privacy</Link>
        <Link href="/refunds" style={{ color: '#94a3b8' }}>Refunds</Link>
      </div>
    </div>
  );
}
