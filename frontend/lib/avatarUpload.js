export const AVATAR_UPLOAD_MAX_BYTES = 5 * 1024 * 1024;
export const AVATAR_UPLOAD_MAX_LABEL = "5 MB";
export const AVATAR_MAX_DIMENSION = 1200;
export const AVATAR_COMPRESSION_QUALITY = 0.8;
export const AVATAR_TOO_LARGE_MESSAGE = "La imagen es demasiado grande. Intenta con una foto más pequeña.";

const COMPRESSIBLE_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

const replaceFileExtension = (name = "avatar") => {
  const baseName = name.replace(/\.[^.]+$/, "") || "avatar";
  return `${baseName}.jpg`;
};

const loadImage = (url) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("IMAGE_DECODE_FAILED"));
    img.src = url;
  });

export const compressAvatarImage = async (file) => {
  if (
    !file ||
    !COMPRESSIBLE_IMAGE_TYPES.includes(file.type) ||
    typeof window === "undefined" ||
    typeof document === "undefined"
  ) {
    return file;
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await loadImage(objectUrl);
    const width = img.naturalWidth || img.width;
    const height = img.naturalHeight || img.height;
    if (!width || !height) return file;

    const scale = Math.min(1, AVATAR_MAX_DIMENSION / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));

    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", AVATAR_COMPRESSION_QUALITY);
    });
    if (!blob) {
      console.error("[avatar-upload] image compression produced no output");
      return file;
    }

    if (blob.size >= file.size && file.size <= AVATAR_UPLOAD_MAX_BYTES) {
      return file;
    }

    return new File([blob], replaceFileExtension(file.name), {
      type: "image/jpeg",
      lastModified: file.lastModified || Date.now(),
    });
  } catch (err) {
    console.error("[avatar-upload] image compression failed", err);
    return file;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
};

export const getAvatarUploadMessageFromPayload = (payload) => {
  if (!payload || typeof payload !== "object") return "";
  if (typeof payload.message === "string" && payload.message.trim()) return payload.message;
  if (typeof payload.error === "string" && payload.error.trim()) return payload.error;
  if (payload.error && typeof payload.error.message === "string" && payload.error.message.trim()) {
    return payload.error.message;
  }
  return "";
};

export const getAvatarUploadErrorMessage = (status, payload, fallback = "Error al subir la foto") => {
  const payloadMessage = getAvatarUploadMessageFromPayload(payload);
  if (payloadMessage) return payloadMessage;
  if (status === 401) return "Tu sesión expiró. Inicia sesión de nuevo.";
  if (status === 413) return AVATAR_TOO_LARGE_MESSAGE;
  if (status === 415) return "Formato de imagen no válido. Usa JPG, PNG, WebP o GIF.";
  if (status === 500) return "Error interno al subir la imagen. Inténtalo de nuevo.";
  return fallback;
};

export const getAvatarUploadDiagnostic = (status, payload, fallback = "Error al subir la foto") => {
  const message = getAvatarUploadErrorMessage(status, payload, fallback);
  const code = payload?.code || (status === 0 ? "NETWORK_ERROR" : `HTTP_${status || "UNKNOWN"}`);
  const error = typeof payload?.error === "string" && payload.error.trim()
    ? payload.error
    : (payload?.raw ? "Non-JSON response" : code);
  return { status, error, message, code };
};

export const formatAvatarUploadDiagnostic = ({ status, error, message, code }) => {
  const details = [
    `status: ${status || "sin respuesta"}`,
    `error: ${error || "desconocido"}`,
    `message: ${message || "sin mensaje"}`,
    `code: ${code || "UNKNOWN"}`,
  ].join(" · ");
  return `${message || "No se pudo subir/procesar la foto"} (${details})`;
};
