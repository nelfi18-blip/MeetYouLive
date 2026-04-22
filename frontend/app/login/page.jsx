"use client";

import { Suspense, useState, useEffect, useRef } from "react";
import { signIn, signOut, useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { login as authLogin } from "@/lib/auth.service";
import { setToken, clearToken } from "@/lib/token";
import FuturisticCard from "@/components/ui/FuturisticCard";
import GradientButton from "@/components/ui/GradientButton";
import NeonInput from "@/components/ui/NeonInput";

function MailIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m4 7 8 6 8-6" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="11" width="16" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 1 1 8 0v3" />
    </svg>
  );
}

function EyeIcon({ off = false }) {
  if (off) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20C7 20 2.73 16.11 1 12c.92-2.19 2.43-4.05 4.33-5.39" />
        <path d="M10.58 10.58A2 2 0 0 0 12 14a2 2 0 0 0 1.42-.58" />
        <path d="M9.88 4.24A10.93 10.93 0 0 1 12 4c5 0 9.27 3.89 11 8a11 11 0 0 1-1.42 2.5" />
        <line x1="1" y1="1" x2="23" y2="23" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function LoginForm() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);
  // Prevents flashing the login form while we verify existing auth state.
  const [checking, setChecking] = useState(true);
  const [connecting, setConnecting] = useState(false);

  const retryStartedRef = useRef(false);
  const timeoutIdsRef = useRef([]);

  useEffect(() => {
    const emailParam = searchParams.get("email");
    if (emailParam) {
      setEmail(emailParam);
      setInfo("Esta cuenta ya existe. Ingresa tu contraseña o continúa con Google.");
    }
  }, [searchParams]);

  // Cleanup pending retry timeouts on unmount.
  useEffect(() => {
    return () => {
      timeoutIdsRef.current.forEach(clearTimeout);
      timeoutIdsRef.current = [];
    };
  }, []);

  useEffect(() => {
    // Email/password users: redirect immediately from localStorage token.
    // Do this first so returning users are never shown the login form.
    const localToken = localStorage.getItem("token");
    if (localToken) {
      // Re-sync the session cookie in case it expired (e.g. user cleared cookies)
      setToken(localToken);
      router.replace("/dashboard");
      return;
    }

    // Keep the loading screen visible while the NextAuth session is being
    // read. This prevents Google OAuth users from briefly seeing the login
    // form (and thinking login failed) before the redirect to /dashboard fires.
    if (status === "loading") return;

    if (status === "authenticated") {
      if (session?.backendToken) {
        // Cancel any in progress retry loop so its timeouts don't fire after
        // navigation has already started.
        timeoutIdsRef.current.forEach(clearTimeout);
        timeoutIdsRef.current = [];
        console.log("[login] session.backendToken available – saving token and redirecting to /dashboard");
        setToken(session.backendToken);
        router.replace("/dashboard");
        return;
      }

      if (session?.googleEmail) {
        if (retryStartedRef.current) return;
        retryStartedRef.current = true;

        // Show the connecting screen so the user can see the progress/error messages.
        setChecking(false);
        setConnecting(true);
        setError("");
        setInfo("Conectando con el servidor…");

        // Allow up to 8 attempts with 4-second gaps so a cold-starting Render
        // backend (which can take 30-60 s to wake up) has time to respond.
        const maxAttempts = 8;
        const retryDelay = 4000;

        const tryFetchToken = async (attempt) => {
          console.log(`[login] backend-token attempt ${attempt}/${maxAttempts}`);
          setInfo(`Conectando con el servidor… (${attempt}/${maxAttempts})`);

          try {
            const response = await fetch("/api/auth/backend-token", { method: "POST" });

            if (response.ok) {
              const data = await response.json();

              if (data?.token) {
                console.log(`[login] Token received on attempt ${attempt}/${maxAttempts} – redirecting to /dashboard`);
                // Cancel any pending retries so they don't fire after navigation.
                timeoutIdsRef.current.forEach(clearTimeout);
                timeoutIdsRef.current = [];
                // Save the token and navigate immediately.
                // Do NOT reset connecting/info state here – keeping the connecting
                // screen visible prevents a flash of the login form before the
                // router navigation completes.
                setToken(data.token);
                router.replace("/dashboard");
                return;
              }

              // Proxy responded OK but sent no token – treat as a recoverable error.
              console.error(`[login] backend-token attempt ${attempt} returned ok but no token:`, data);
            } else if (response.status === 401) {
              console.warn(`[login] backend-token attempt ${attempt} returned 401 – session invalid`);
              retryStartedRef.current = false;
              setConnecting(false);
              setInfo("");
              setError("Tu sesión de Google ya no es válida. Inténtalo otra vez.");
              clearToken();
              await signOut({ redirect: false });
              return;
            } else if (response.status === 403) {
              console.warn(`[login] backend-token attempt ${attempt} returned 403 – account blocked`);
              retryStartedRef.current = false;
              setConnecting(false);
              setInfo("");
              setError("Tu cuenta ha sido bloqueada. Contacta al soporte.");
              clearToken();
              await signOut({ redirect: false });
              return;
            } else {
              // Log non-401 errors for debugging; they will be retried below.
              let body = {};
              try { body = await response.json(); } catch { /* ignore */ }
              console.warn(`[login] backend-token attempt ${attempt}/${maxAttempts} failed (${response.status}):`, body);
            }
          } catch (err) {
            console.warn(`[login] backend-token attempt ${attempt}/${maxAttempts} fetch error:`, err?.message);
          }

          if (attempt < maxAttempts) {
            const timeoutId = setTimeout(() => {
              timeoutIdsRef.current = timeoutIdsRef.current.filter((id) => id !== timeoutId);
              tryFetchToken(attempt + 1);
            }, retryDelay);
            timeoutIdsRef.current.push(timeoutId);
          } else {
            console.error(`[login] All ${maxAttempts} backend-token attempts failed – signing out`);
            retryStartedRef.current = false;
            setConnecting(false);
            setInfo("");
            setError("Error al iniciar sesión con Google. Por favor, inténtalo de nuevo.");
            clearToken();
            await signOut({ redirect: false });
          }
        };

        tryFetchToken(1);
        return;
      }

      retryStartedRef.current = false;
      setChecking(false);
      setError("No se pudo conectar con el servidor. Por favor, inténtalo de nuevo.");
      clearToken();
      signOut({ redirect: false });
      return;
    }

    if (status === "unauthenticated") {
      retryStartedRef.current = false;
      setChecking(false);
    }
  }, [status, session, router]);

  if (checking) return (
    <div
      aria-busy="true"
      aria-label="Verificando sesión…"
      style={{ minHeight: "100vh", background: "#060411" }}
    />
  );

  if (connecting) return (
    <div className="login-bg" aria-label="Conectando con el servidor">
      <div className="orb orb-1" />
      <div className="orb orb-2" />
      <div className="orb orb-3" />
      <div className="grid-overlay" aria-hidden="true" />

      <div className="login-card connecting-card">
        <div className="login-logo">
          <Image
            src="/logo.svg"
            alt="MeetYouLive logo"
            width={110}
            height={110}
            priority
            className="logo-img"
          />
          <div className="login-logo-text">
            Meet You<span className="logo-live">Live</span>
          </div>
        </div>

        <div className="connecting-body" role="status">
          <div className="connecting-spinner" aria-hidden="true" />
          <p className="connecting-message" aria-live="polite">{info}</p>
          <p className="connecting-hint">Iniciando el servidor, por favor espera…</p>
        </div>
      </div>

      <style jsx>{`
        .login-bg {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background:
            radial-gradient(ellipse at 50% 0%, rgba(224,64,251,0.28) 0%, transparent 55%),
            radial-gradient(ellipse at 20% 100%, rgba(139,92,246,0.22) 0%, transparent 50%),
            radial-gradient(ellipse at 85% 60%, rgba(96,165,250,0.10) 0%, transparent 40%),
            #06020f;
          padding: 2rem 1rem;
          position: relative;
          overflow: hidden;
        }
        .orb {
          position: absolute;
          border-radius: 50%;
          filter: blur(80px);
          pointer-events: none;
          animation: orb-float 10s ease-in-out infinite alternate;
        }
        .orb-1 {
          width: 520px; height: 520px;
          background: radial-gradient(circle, rgba(224,64,251,0.22), transparent 70%);
          top: -220px; left: 50%;
          transform: translateX(-50%);
          animation-delay: 0s;
        }
        .orb-2 {
          width: 380px; height: 380px;
          background: radial-gradient(circle, rgba(139,92,246,0.18), transparent 70%);
          bottom: -160px; left: -80px;
          animation-delay: -4s;
        }
        .orb-3 {
          width: 280px; height: 280px;
          background: radial-gradient(circle, rgba(96,165,250,0.12), transparent 70%);
          top: 50%; right: -80px;
          animation-delay: -7s;
        }
        @keyframes orb-float {
          0%   { transform: translate(0, 0) scale(1); }
          100% { transform: translate(20px, 18px) scale(1.05); }
        }
        .grid-overlay {
          position: absolute;
          inset: 0;
          background-image:
            linear-gradient(rgba(224,64,251,0.04) 1px, transparent 1px),
            linear-gradient(90deg, rgba(224,64,251,0.04) 1px, transparent 1px);
          background-size: 48px 48px;
          mask-image: radial-gradient(ellipse at 50% 50%, black 0%, transparent 72%);
          pointer-events: none;
        }
        .login-card {
          position: relative;
          z-index: 1;
          width: 100%;
          max-width: 420px;
          background: rgba(10,5,22,0.90);
          border: 1px solid rgba(224,64,251,0.18);
          border-radius: 32px;
          padding: 2.5rem 2.25rem 2.25rem;
          box-shadow:
            0 24px 80px rgba(0,0,0,0.75),
            0 0 0 1px rgba(255,255,255,0.04),
            0 0 80px rgba(224,64,251,0.12);
          backdrop-filter: blur(32px) saturate(1.6);
        }
        .login-logo {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.5rem;
          margin-bottom: 2rem;
        }
        :global(.logo-img) {
          filter: drop-shadow(0 0 18px rgba(224,64,251,0.55)) drop-shadow(0 0 36px rgba(96,165,250,0.3));
        }
        .login-logo-text {
          font-size: 1.9rem;
          font-weight: 800;
          letter-spacing: -0.03em;
          color: var(--text);
          line-height: 1;
        }
        .logo-live {
          font-style: italic;
          background: linear-gradient(135deg, #ff2d78 0%, #e040fb 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        .connecting-body {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1.25rem;
          padding-bottom: 0.5rem;
        }
        .connecting-spinner {
          width: 48px;
          height: 48px;
          border: 3px solid rgba(224,64,251,0.2);
          border-top-color: #e040fb;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        .connecting-message {
          color: var(--text);
          font-size: 1rem;
          font-weight: 600;
          text-align: center;
          letter-spacing: -0.01em;
        }
        .connecting-hint {
          color: var(--text-muted);
          font-size: 0.8rem;
          text-align: center;
          max-width: 260px;
          line-height: 1.5;
        }
        @media (max-width: 480px) {
          .login-card { padding: 2rem 1.5rem; }
          .login-logo-text { font-size: 1.65rem; }
        }
      `}</style>
    </div>
  );

  const login = async () => {
    setError("");
    setInfo("");
    setLoading(true);

    try {
      const data = await authLogin({ email, password });

      if (data.error) {
        // "Use Google" suggestions are shown as info (blue) rather than an error (red)
        // so the user clearly understands they need to click the Google button above.
        if (data.code === "GOOGLE_ACCOUNT") {
          setInfo(data.error);
        } else if (data.code === "EMAIL_NOT_VERIFIED") {
          // Redirect to verify-email page with the email pre-filled
          router.push(`/verify-email?email=${encodeURIComponent(data.email || email)}`);
          return;
        } else {
          setError(data.error);
        }
        setLoading(false);
        return;
      }

      if (data.token) {
        setToken(data.token);
        router.replace("/dashboard");
        return;
      }

      setLoading(false);
    } catch {
      setError("No se pudo conectar con el servidor");
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") login();
  };

  return (
    <div className="login-bg">
      {/* Aurora orbs */}
      <div className="orb orb-1" />
      <div className="orb orb-2" />
      <div className="orb orb-3" />

      {/* Grid lines overlay */}
      <div className="grid-overlay" aria-hidden="true" />

      {/* Particles */}
      <div className="particles" aria-hidden="true">
        {[...Array(16)].map((_, i) => (
          <div key={i} className={`particle particle-${i + 1}`} />
        ))}
      </div>

      <FuturisticCard className="login-card" accent="pink" hover={false}>
        {/* Logo */}
        <div className="login-logo">
          <Image
            src="/logo.svg"
            alt="MeetYouLive logo"
            width={110}
            height={110}
            priority
            className="logo-img"
          />
          <span className="login-kicker">Acceso seguro</span>
          <div className="login-logo-text">
            Meet You<span className="logo-live">Live</span>
          </div>
        </div>

        <div className="login-header">
          <h1 className="login-title">Bienvenido de vuelta</h1>
          <p className="login-subtitle">Conéctate y entra al universo premium de MeetYouLive</p>
        </div>

        {error && <div className="banner-error">{error}</div>}
        {info && <div className="banner-info">{info}</div>}

        <button
          className="btn-google"
          onClick={() => signIn("google", { callbackUrl: "/login" })}
        >
          <span className="btn-google-icon" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-label="Google" role="img">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
          </span>
          Continuar con Google
        </button>

        <p className="urgency-msg">Más de 1,000 usuarios conectados en este momento</p>

        <div className="divider-text">o continúa con email</div>

        <div className="login-form">
          <NeonInput
            type="email"
            placeholder="EMAIL"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={handleKeyDown}
            icon={<MailIcon />}
            autoComplete="email"
          />

          <NeonInput
            type={showPassword ? "text" : "password"}
            placeholder="CONTRASEÑA"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={handleKeyDown}
            icon={<LockIcon />}
            autoComplete="current-password"
            endSlot={(
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                aria-pressed={showPassword}
              >
                <EyeIcon off={showPassword} />
              </button>
            )}
          />

          <div className="forgot-row">
            <Link href="/forgot-password">¿Olvidaste tu contraseña?</Link>
          </div>

          <GradientButton className="submit-btn" onClick={login} disabled={loading}>
            {loading ? (
              <>
                <span className="spinner" />
                Iniciando sesión…
              </>
            ) : "Iniciar sesión"}
          </GradientButton>
        </div>

        <p className="differentiator-msg">Streaming en vivo, conexiones reales y experiencias exclusivas</p>

        <div className="login-footer">
          <p className="footer-link">
            ¿No tienes cuenta?{" "}
            <Link href="/register">Regístrate gratis</Link>
          </p>
        </div>
      </FuturisticCard>

      <style jsx>{`
        /* ── Background ── */
        .login-bg {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background:
            radial-gradient(ellipse at 50% 0%, rgba(224,64,251,0.28) 0%, transparent 55%),
            radial-gradient(ellipse at 20% 100%, rgba(139,92,246,0.22) 0%, transparent 50%),
            radial-gradient(ellipse at 85% 60%, rgba(96,165,250,0.10) 0%, transparent 40%),
            #06020f;
          padding: 2rem 1rem;
          position: relative;
          overflow: hidden;
        }

        /* ── Aurora orbs ── */
        .orb {
          position: absolute;
          border-radius: 50%;
          filter: blur(80px);
          pointer-events: none;
          animation: orb-float 10s ease-in-out infinite alternate;
        }
        .orb-1 {
          width: 520px; height: 520px;
          background: radial-gradient(circle, rgba(224,64,251,0.22), transparent 70%);
          top: -220px; left: 50%;
          transform: translateX(-50%);
          animation-delay: 0s;
        }
        .orb-2 {
          width: 380px; height: 380px;
          background: radial-gradient(circle, rgba(139,92,246,0.18), transparent 70%);
          bottom: -160px; left: -80px;
          animation-delay: -4s;
        }
        .orb-3 {
          width: 280px; height: 280px;
          background: radial-gradient(circle, rgba(96,165,250,0.12), transparent 70%);
          top: 50%; right: -80px;
          animation-delay: -7s;
        }

        @keyframes orb-float {
          0%   { transform: translate(0, 0) scale(1); }
          100% { transform: translate(20px, 18px) scale(1.05); }
        }

        /* ── Grid overlay ── */
        .grid-overlay {
          position: absolute;
          inset: 0;
          background-image:
            linear-gradient(rgba(224,64,251,0.04) 1px, transparent 1px),
            linear-gradient(90deg, rgba(224,64,251,0.04) 1px, transparent 1px);
          background-size: 48px 48px;
          mask-image: radial-gradient(ellipse at 50% 50%, black 0%, transparent 72%);
          pointer-events: none;
        }

        /* ── Particles ── */
        .particles { position: absolute; inset: 0; pointer-events: none; }

        .particle {
          position: absolute;
          width: 3px; height: 3px;
          border-radius: 50%;
          background: rgba(224,64,251,0.55);
          animation: particle-rise 8s ease-in-out infinite;
        }

        .particle-1  { left:  5%; top: 75%; animation-delay: 0s;   animation-duration: 9s; }
        .particle-2  { left: 12%; top: 85%; animation-delay: 1.2s; animation-duration: 11s; }
        .particle-3  { left: 22%; top: 65%; animation-delay: 2.1s; animation-duration: 8s; }
        .particle-4  { left: 33%; top: 90%; animation-delay: 0.6s; animation-duration: 7s; background: rgba(139,92,246,0.5); }
        .particle-5  { left: 48%; top: 78%; animation-delay: 1.8s; animation-duration: 12s; width: 4px; height: 4px; }
        .particle-6  { left: 57%; top: 82%; animation-delay: 3.2s; animation-duration: 9s; }
        .particle-7  { left: 68%; top: 70%; animation-delay: 0.9s; animation-duration: 10s; background: rgba(96,165,250,0.4); width: 4px; height: 4px; }
        .particle-8  { left: 79%; top: 88%; animation-delay: 2.7s; animation-duration: 8s; }
        .particle-9  { left: 88%; top: 60%; animation-delay: 1.4s; animation-duration: 7s; }
        .particle-10 { left: 43%; top: 93%; animation-delay: 4s;   animation-duration: 13s; width: 2px; height: 2px; }
        .particle-11 { left: 18%; top: 42%; animation-delay: 5s;   animation-duration: 9s; background: rgba(255,45,120,0.5); }
        .particle-12 { left: 75%; top: 35%; animation-delay: 0.4s; animation-duration: 10s; width: 2px; height: 2px; }
        .particle-13 { left: 30%; top: 55%; animation-delay: 3.5s; animation-duration: 8s; }
        .particle-14 { left: 62%; top: 48%; animation-delay: 1.9s; animation-duration: 11s; background: rgba(139,92,246,0.4); }
        .particle-15 { left: 90%; top: 80%; animation-delay: 2.3s; animation-duration: 9s; width: 4px; height: 4px; }
        .particle-16 { left: 7%;  top: 30%; animation-delay: 6s;   animation-duration: 10s; background: rgba(96,165,250,0.5); }

        @keyframes particle-rise {
          0%   { transform: translateY(0) scale(1);      opacity: 0; }
          10%  { opacity: 0.8; }
          70%  { opacity: 0.6; }
          100% { transform: translateY(-140px) scale(0.5); opacity: 0; }
        }

        /* ── Card ── */
        .login-card {
          position: relative;
          z-index: 1;
          width: 100%;
          max-width: 420px;
          border-radius: 32px;
          padding: 2.5rem 2.25rem 2.25rem;
        }

        /* ── Logo ── */
        .login-logo {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.5rem;
          margin-bottom: 1.5rem;
        }
        .login-kicker {
          font-size: 0.65rem;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: rgba(196, 181, 253, 0.88);
          border: 1px solid rgba(224, 64, 251, 0.38);
          border-radius: 999px;
          padding: 0.2rem 0.65rem;
          background: rgba(224, 64, 251, 0.11);
        }

        :global(.logo-img) {
          filter: drop-shadow(0 0 18px rgba(224,64,251,0.55)) drop-shadow(0 0 36px rgba(96,165,250,0.3));
        }

        .login-logo-text {
          font-size: 1.9rem;
          font-weight: 800;
          letter-spacing: -0.03em;
          color: var(--text);
          line-height: 1;
        }

        .logo-live {
          font-style: italic;
          background: linear-gradient(135deg, #ff2d78 0%, #e040fb 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        /* ── Header ── */
        .login-header {
          text-align: center;
          margin-bottom: 1.75rem;
        }

        .login-title {
          font-size: 1.38rem;
          font-weight: 800;
          letter-spacing: -0.03em;
          color: var(--text);
        }

        .login-subtitle {
          color: var(--text-muted);
          font-size: 0.875rem;
          margin-top: 0.3rem;
          line-height: 1.45;
        }

        /* ── Banners ── */
        .banner-error {
          background: var(--error-bg);
          border: 1px solid rgba(248,113,113,0.35);
          color: var(--error);
          border-radius: var(--radius-sm);
          padding: 0.75rem 1rem;
          font-size: 0.875rem;
          font-weight: 500;
          margin-bottom: 1.25rem;
        }

        .banner-info {
          background: rgba(129,140,248,0.1);
          border: 1px solid rgba(129,140,248,0.35);
          color: var(--accent-3);
          border-radius: var(--radius-sm);
          padding: 0.75rem 1rem;
          font-size: 0.875rem;
          font-weight: 500;
          margin-bottom: 1.25rem;
        }

        /* ── Form ── */
        .login-form { display: flex; flex-direction: column; gap: 0.85rem; }
        .password-toggle {
          border-radius: 10px;
          width: 32px;
          height: 32px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: none;
          background: rgba(255, 255, 255, 0.04);
          color: #c4b5fd;
          cursor: pointer;
          transition: color var(--transition), background var(--transition);
        }
        .password-toggle:hover {
          background: rgba(224, 64, 251, 0.16);
          color: #f5d0fe;
        }
        .password-toggle :global(svg) {
          width: 16px;
          height: 16px;
        }

        .forgot-row {
          display: flex;
          justify-content: flex-end;
          margin-top: -0.15rem;
          margin-bottom: 0.1rem;
        }

        .forgot-row :global(a) {
          color: #a78bfa;
          font-size: 0.85rem;
          font-weight: 600;
          text-decoration: none;
          transition: color var(--transition);
        }

        .forgot-row :global(a):hover {
          color: #e040fb;
          text-decoration: underline;
        }

        /* ── Submit button ── */
        .submit-btn {
          margin-top: 0.35rem;
          gap: 0.6rem;
          letter-spacing: 0.01em;
        }

        /* ── Spinner ── */
        .spinner {
          width: 16px;
          height: 16px;
          border: 2px solid rgba(255,255,255,0.3);
          border-top-color: #fff;
          border-radius: 50%;
          animation: spin 0.7s linear infinite;
          flex-shrink: 0;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        /* ── Divider ── */
        .divider-text {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          color: var(--text-dim);
          font-size: 0.72rem;
          font-weight: 700;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          margin: 1.5rem 0 1.25rem;
        }

        .divider-text::before,
        .divider-text::after {
          content: "";
          flex: 1;
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(224,64,251,0.2), transparent);
        }

        /* ── Google button ── */
        .btn-google {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.75rem;
          width: 100%;
          padding: 0.875rem;
          background: rgba(255,255,255,0.06);
          color: var(--text);
          border: 1px solid rgba(255,255,255,0.12);
          border-radius: var(--radius);
          font-size: 0.95rem;
          font-weight: 600;
          cursor: pointer;
          transition: all var(--transition);
          font-family: inherit;
        }
        .btn-google-icon {
          width: 30px;
          height: 30px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.92);
          box-shadow: 0 4px 14px rgba(255, 255, 255, 0.2);
        }

        .btn-google:hover {
          background: rgba(255,255,255,0.1);
          border-color: rgba(66,133,244,0.45);
          box-shadow: 0 4px 20px rgba(66,133,244,0.18);
          transform: translateY(-1px);
        }

        /* ── Urgency & differentiator messages ── */
        .urgency-msg {
          text-align: center;
          font-size: 0.82rem;
          font-weight: 500;
          color: rgba(240, 171, 252, 0.82);
          margin: 0.6rem 0 0;
          letter-spacing: 0.01em;
        }

        .differentiator-msg {
          text-align: center;
          font-size: 0.82rem;
          font-weight: 500;
          color: rgba(148, 163, 184, 0.95);
          margin: 0.75rem 0 0;
          line-height: 1.45;
        }

        /* ── Footer ── */
        .login-footer {
          margin-top: 1.75rem;
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .footer-link {
          text-align: center;
          font-size: 0.875rem;
          color: var(--text-muted);
        }

        .footer-link :global(a) {
          color: #ff2d78;
          font-weight: 600;
          transition: color var(--transition);
        }

        .footer-link :global(a):hover { color: var(--accent-2); }

        @media (max-width: 480px) {
          .login-card { padding: 2rem 1.5rem; }
          .login-title { font-size: 1.25rem; }
          .login-logo-text { font-size: 1.65rem; }
        }
      `}</style>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
