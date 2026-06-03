export default function Loading() {
  return (
    <div className="app-loading" aria-busy="true" aria-live="polite">
      <div className="app-loading__content">
        <div className="app-loading__mark" aria-hidden="true" />
        <div className="app-loading__spinner" aria-hidden="true" />
        <p>Cargando...</p>
      </div>
    </div>
  );
}
