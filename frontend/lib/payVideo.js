import { redirectToTrustedCheckout } from "./checkoutRedirect";
import { shouldUseNativeStorePayments } from "./mobilePayments";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

export const payVideo = async (videoId) => {
  if (typeof window === "undefined") return;
  if (shouldUseNativeStorePayments()) {
    throw new Error("MOBILE_STORE_PAYMENT_REQUIRED");
  }
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
  if (!redirectToTrustedCheckout(data.url)) {
    throw new Error("URL de pago inválida");
  }
};
