const normalizeHttpProtocol = (value) => {
  const protocol = typeof value === "string" ? value.replace(/:$/, "").toLowerCase() : "";
  return protocol === "http" || protocol === "https" ? protocol : "https";
};

const getRequestOrigin = (req) => {
  const forwardedProto = req.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const protocol = normalizeHttpProtocol(forwardedProto || req.protocol);
  const host = req.get("x-forwarded-host")?.split(",")[0]?.trim() || req.get("host");
  const hostname = host?.split(":")[0] || "";
  if (
    !host ||
    hostname.includes("..") ||
    !hostname.split(".").every(Boolean) ||
    !/^[a-z0-9.-]+(?::\d+)?$/i.test(host)
  ) {
    return "";
  }
  return `${protocol}://${host}`;
};

const getPhotoUrlValue = (value) => {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";
  return value.secure_url || value.url || value.src || value.path || "";
};

const normalizeUploadPath = (value) =>
  value
    .replace(/^\/?api\/uploads\//i, "uploads/")
    .replace(/^\/?uploads\//i, "uploads/");

const normalizePhotoUrl = (req, value) => {
  const rawValue = getPhotoUrlValue(value);
  if (typeof rawValue !== "string") return "";
  const trimmed = rawValue.trim();
  if (!trimmed) return "";

  const requestOrigin = getRequestOrigin(req);
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      if (url.pathname.startsWith("/api/uploads/")) {
        url.pathname = `/${normalizeUploadPath(url.pathname)}`;
      }
      if (requestOrigin) {
        const requestUrl = new URL(requestOrigin);
        if (
          url.protocol === "http:" &&
          requestUrl.protocol === "https:" &&
          url.hostname === requestUrl.hostname &&
          url.pathname.startsWith("/uploads/")
        ) {
          url.protocol = "https:";
        }
      }
      return url.toString();
    } catch {
      return "";
    }
  }

  if (trimmed.startsWith("//")) return `https:${trimmed}`;

  const normalizedPath = normalizeUploadPath(trimmed);
  if (/^uploads\//.test(normalizedPath)) {
    const uploadPath = `/${normalizedPath.replace(/^\/+/, "")}`;
    return requestOrigin ? `${requestOrigin}${uploadPath}` : uploadPath;
  }

  return "";
};

const serializeUserPhotoFields = (req, userLike) => {
  const rawPhotos = [
    ...(Array.isArray(userLike?.profilePhotos) ? userLike.profilePhotos : []),
    ...(Array.isArray(userLike?.photos) ? userLike.photos : []),
    userLike?.avatar,
    userLike?.profileImage,
    userLike?.photo,
  ];
  const normalizedPhotos = [];
  const seenPhotos = new Set();

  for (const value of rawPhotos) {
    const normalized = normalizePhotoUrl(req, value);
    if (normalized && !seenPhotos.has(normalized)) {
      seenPhotos.add(normalized);
      normalizedPhotos.push(normalized);
    }
  }

  const avatar = normalizedPhotos[0] || "";
  return {
    avatar,
    profileImage: avatar,
    photo: avatar,
    photos: normalizedPhotos,
    profilePhotos: normalizedPhotos,
  };
};

const withSerializedUserPhotoFields = (req, userLike) => {
  if (!userLike) return userLike;
  const user = typeof userLike.toObject === "function" ? userLike.toObject() : { ...userLike };
  return {
    ...user,
    ...serializeUserPhotoFields(req, user),
  };
};

module.exports = {
  normalizePhotoUrl,
  serializeUserPhotoFields,
  withSerializedUserPhotoFields,
};
