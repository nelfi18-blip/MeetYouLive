const API_URL = process.env.NEXT_PUBLIC_API_URL;

export const payVideo = async (videoId) => {
  if (typeof window === "undefined") return;
  const token = localStorage.getItem("token");

  const res = await fetch(`${API_URL}/api/payments/checkout/${videoId}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.message || "Error al iniciar el pago");
  }

  const data = await res.json();
  window.location.href = data.url;
};
