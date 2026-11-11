"use client";

import BottomNavEnhanced from "@/components/BottomNavEnhanced";

// A self-contained visual test of the *actual* navigation component.
// It never supplies user/creator data or follows links to protected pages.
export default function FloatingNavPreview() {
  const stopDemoNavigation = (event) => {
    if (event.target.closest?.("a")) event.preventDefault();
  };

  return (
    <div className="floating-nav-preview" onClickCapture={stopDemoNavigation}>
      <header className="floating-nav-preview-header">
        <span>MEETYOULIVE · PRUEBA VISUAL</span>
        <h1>Barra flotante</h1>
        <p>Desliza hacia abajo: la barra se aparta. Desliza hacia arriba: vuelve a aparecer. Pulsa IR para comprobar que el menú sigue visible.</p>
        <small>Solo demostración visual: no hay cuentas, Lives, pagos ni actividad simulada.</small>
      </header>

      <section className="floating-nav-preview-card">
        <span className="floating-nav-preview-number">01</span>
        <h2>Inicio</h2>
        <p>Revisa cómo se despeja la pantalla mientras recorres el contenido.</p>
      </section>
      <section className="floating-nav-preview-card">
        <span className="floating-nav-preview-number">02</span>
        <h2>Descubrir</h2>
        <p>La navegación vuelve al desplazar la página hacia arriba.</p>
      </section>
      <section className="floating-nav-preview-card">
        <span className="floating-nav-preview-number">03</span>
        <h2>Creadores</h2>
        <p>Conservamos la misma cápsula, iconos, colores y botón central IR.</p>
      </section>
      <section className="floating-nav-preview-card">
        <span className="floating-nav-preview-number">04</span>
        <h2>Perfil</h2>
        <p>El espacio inferior protege los últimos elementos al llegar al final.</p>
      </section>

      <BottomNavEnhanced />

      <style jsx>{`
        .floating-nav-preview { max-width: 720px; margin: 0 auto; color: #f5efff; padding: 0.5rem 0.15rem 12rem; }
        .floating-nav-preview-header { padding: 1.4rem 1.2rem 1.6rem; border-radius: 24px;
          border: 1px solid rgba(201, 154, 255, .25);
          background: linear-gradient(135deg, #271045, #141b39); margin-bottom: 1.4rem; }
        .floating-nav-preview-header span { color: #cfa8ff; letter-spacing: .1em; font-size: .72rem; font-weight: 850; }
        .floating-nav-preview-header h1 { margin: .6rem 0; font-size: clamp(2rem, 7vw, 2.65rem); }
        .floating-nav-preview-header p { color: #e2dbec; font-size: 1rem; line-height: 1.55; }
        .floating-nav-preview-header small { color: #bbb0cf; font-size: .8rem; line-height: 1.5; display: block; }
        .floating-nav-preview-card { min-height: 295px; padding: 1.6rem; margin-bottom: 1rem; border-radius: 22px;
          background: radial-gradient(circle at 100% 0, rgba(180, 67, 216, .12), transparent 68%), #18112f;
          border: 1px solid rgba(179, 143, 255, .24); }
        .floating-nav-preview-number { color: #5bd7ec; font-size: 1.2rem; font-weight: 900; }
        .floating-nav-preview-card h2 { font-size: 1.5rem; margin: 1rem 0 .65rem; }
        .floating-nav-preview-card p { color: #c9c2dd; line-height: 1.6; }
      `}</style>
    </div>
  );
}
