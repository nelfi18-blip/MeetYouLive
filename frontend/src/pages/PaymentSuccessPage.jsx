export default function PaymentSuccessPage() {
  return (
    <div className="status-page">
      <div className="status-icon">✅</div>
      <h1>Pago completado</h1>
      <p>Tu compra ha sido procesada correctamente. Ya puedes ver el vídeo.</p>
      <a className="btn btn-primary" href="/dashboard" style={{ maxWidth: 220 }}>
        Volver al inicio
      </a>
    </div>
  );
}
