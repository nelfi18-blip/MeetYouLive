export default function Loading() {
  return (
    <main className="app-loading" aria-busy="true" aria-live="polite">
      <div className="app-loading__content">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.svg" alt="" className="app-loading__logo" />
        <div className="app-loading__spinner" aria-hidden="true" />
        <p>Cargando...</p>
      </div>
    </main>
  );
}
