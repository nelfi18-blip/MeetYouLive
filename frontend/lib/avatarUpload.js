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
    if (!blob) return file;

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
