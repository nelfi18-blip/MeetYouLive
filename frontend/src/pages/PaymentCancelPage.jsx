export default function PaymentCancelPage() {
  return (
    <div className="status-page">
      <div className="status-icon">❌</div>
      <h1>Pago cancelado</h1>
      <p>No se ha realizado ningún cargo. Puedes intentarlo de nuevo cuando quieras.</p>
      <a className="btn btn-primary" href="/dashboard" style={{ maxWidth: 220 }}>
        Volver al inicio
      </a>
    </div>
  );
}
