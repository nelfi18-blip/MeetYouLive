/**
 * Extract a valid HTTP protocol value from a request header or Express request.
 *
 * @param {unknown} value Potential protocol value.
 * @returns {"http"|"https"|""} Valid protocol or empty string.
 */
const validateHttpProtocol = (value) => {
  const protocol = typeof value === "string" ? value.replace(/:$/, "").toLowerCase() : "";
  const allowedProtocols = new Set(["http", "https"]);
  return allowedProtocols.has(protocol) ? protocol : "";
};

const REQUESTLESS_PHOTO_REQ = { protocol: "https", get: () => "" };
const MAX_USER_IMAGES = 6;

/**
 * Build a safe request origin for absolute upload URLs.
 *
 * @param {import("express").Request} req Express request.
 * @returns {string} Origin URL or empty string when headers are invalid.
 */
const getRequestOrigin = (req) => {
  const forwardedProto = req.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const protocol = validateHttpProtocol(forwardedProto || req.protocol);
  const host = req.get("x-forwarded-host")?.split(",")[0]?.trim() || req.get("host");
  const hostname = host?.split(":")[0] || "";
  const hostnameLabels = hostname.split(".");
  const hasValidLabels =
    Boolean(hostname) &&
    (hostname === "localhost" || (hostnameLabels.length >= 2 && hostnameLabels.every(Boolean)));
  if (
    !protocol ||
    !host ||
    hostname.includes("..") ||
    !hasValidLabels ||
    !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?(?::\d+)?$/i.test(host)
  ) {
    return "";
  }
  return `${protocol}://${host}`;
};

/**
 * Extract the URL-like value from supported photo field formats.
 *
 * @param {unknown} value String URL/path or provider object.
 * @returns {string} Raw URL/path string or empty string.
 */
const getPhotoUrlValue = (value) => {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";
  return value.secure_url || value.url || value.src || value.path || "";
};

const hasUnsafePathSegment = (value) => {
  if (typeof value !== "string") return true;
  if (value.includes("..") || /%2e/i.test(value)) return true;
  try {
    return decodeURIComponent(value).split(/[\\/]/).includes("..");
  } catch {
    return true;
  }
};

/**
 * Normalize legacy upload path prefixes to uploads/.
 *
 * @param {unknown} value Raw upload path.
 * @returns {string} Normalized upload path or empty string.
 */
const normalizeUploadPath = (value) =>
  typeof value === "string" && !hasUnsafePathSegment(value)
    ? value.replace(/^\/?(?:api\/)?uploads\//i, "uploads/")
    : "";

/**
 * Normalize a photo field into an absolute or renderable URL.
 *
 * @param {import("express").Request} req Express request used for upload origins.
 * @param {unknown} value Photo field value.
 * @returns {string} Normalized URL/path or empty string when unavailable.
 */
const normalizePhotoUrl = (req, value) => {
  const rawValue = getPhotoUrlValue(value);
  if (typeof rawValue !== "string") return "";
  const trimmed = rawValue.trim();
  if (!trimmed) return "";

  const requestOrigin = getRequestOrigin(req);
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      if (hasUnsafePathSegment(url.pathname)) return "";
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
    const uploadPath = `/${normalizedPath}`;
    return requestOrigin ? `${requestOrigin}${uploadPath}` : uploadPath;
  }

  return "";
};

const getPhotoUrl = (photo, req = REQUESTLESS_PHOTO_REQ) => normalizePhotoUrl(req, photo);

const toPlainUser = (userLike) =>
  userLike && typeof userLike.toObject === "function" ? userLike.toObject() : userLike || {};

const makeUserImage = (photo, index) => {
  const source = photo && typeof photo === "object" && !Array.isArray(photo) ? photo : {};
  return {
    url: photo,
    publicId: typeof source.publicId === "string" ? source.publicId : "",
    isPrimary: index === 0,
    source: typeof source.source === "string" ? source.source : "",
    uploadedAt: source.uploadedAt ? new Date(source.uploadedAt) : new Date(),
  };
};

const addNormalizedPhoto = (photos, seenPhotos, req, value) => {
  const normalized = getPhotoUrl(value, req);
  if (!normalized || seenPhotos.has(normalized)) return;
  seenPhotos.add(normalized);
  photos.push(normalized);
};

const getRawCanonicalPhotoCandidates = (userLike = {}) => [
  ...(Array.isArray(userLike.images) ? userLike.images : []),
  userLike.avatar,
  userLike.profileImage,
  userLike.photo,
  ...(Array.isArray(userLike.profilePhotos) ? userLike.profilePhotos : []),
  ...(Array.isArray(userLike.photos) ? userLike.photos : []),
  userLike.photoURL,
  userLike.photoUrl,
  userLike.image,
  userLike.imageUrl,
  userLike.picture,
];

const normalizeUserImages = (userLike = {}, req = REQUESTLESS_PHOTO_REQ) => {
  const user = toPlainUser(userLike);
  const photos = [];
  const seenPhotos = new Set();

  for (const value of getRawCanonicalPhotoCandidates(user)) {
    addNormalizedPhoto(photos, seenPhotos, req, value);
    if (photos.length >= MAX_USER_IMAGES) break;
  }

  return photos.slice(0, MAX_USER_IMAGES).map(makeUserImage);
};

const syncCanonicalPhotoFields = (userLike = {}, req = REQUESTLESS_PHOTO_REQ) => {
  const images = normalizeUserImages(userLike, req);
  const primaryPhoto = images[0]?.url || "";
  const profilePhotos = images.map((image) => image.url);

  if (userLike && typeof userLike.set === "function") {
    userLike.set({ images, avatar: primaryPhoto, profilePhotos });
  } else if (userLike && typeof userLike === "object") {
    userLike.images = images;
    userLike.avatar = primaryPhoto;
    userLike.profilePhotos = profilePhotos;
  }

  return { images, avatar: primaryPhoto, profilePhotos };
};

const getPrimaryPhotoUrl = (userLike = {}, req = REQUESTLESS_PHOTO_REQ) =>
  normalizeUserImages(userLike, req)[0]?.url || "";

/**
 * Collect photo candidates in primary-photo priority order.
 * Canonical persisted fields come first, then legacy/provider aliases.
 *
 * @param {object} userLike User-like object with photo aliases.
 * @returns {unknown[]} Raw photo field values.
 */
const getRawUserPhotoCandidates = (userLike) => [
  ...(Array.isArray(userLike?.images) ? userLike.images.map((value) => ({ field: "images", value })) : []),
  { field: "avatar", value: userLike?.avatar },
  { field: "profileImage", value: userLike?.profileImage },
  ...(Array.isArray(userLike?.profilePhotos)
    ? userLike.profilePhotos.map((value) => ({ field: "profilePhotos", value }))
    : []),
  { field: "photo", value: userLike?.photo },
  ...(Array.isArray(userLike?.photos) ? userLike.photos.map((value) => ({ field: "photos", value })) : []),
  { field: "photoURL", value: userLike?.photoURL },
  { field: "photoUrl", value: userLike?.photoUrl },
  { field: "image", value: userLike?.image },
  { field: "imageUrl", value: userLike?.imageUrl },
  { field: "picture", value: userLike?.picture },
];

/**
 * Select normalized user photos and report which persisted field supplied the primary photo.
 *
 * @param {import("express").Request} req Express request used for upload origins.
 * @param {object} userLike User-like object with photo aliases.
 * @returns {{primaryPhoto: string, photos: string[], fieldUsed: string|null, photoCount: number}}
 */
const getUserPhotoSelection = (req, userLike) => {
  const images = normalizeUserImages(userLike, req);
  const photos = images.map((image) => image.url);
  let fieldUsed = null;

  for (const { field, value } of getRawUserPhotoCandidates(userLike)) {
    const normalized = normalizePhotoUrl(req, value);
    if (normalized && photos.length > 0 && normalized === photos[0]) {
      fieldUsed = field;
      break;
    }
  }

  return {
    primaryPhoto: photos[0] || "",
    photos,
    fieldUsed,
    photoCount: photos.length,
  };
};

const makePrimaryUserPhotoFields = (photoUrl, source = "") => {
  const url = normalizePhotoUrl(REQUESTLESS_PHOTO_REQ, photoUrl);
  if (!url) return {};
  return {
    avatar: url,
    profilePhotos: [url],
    images: [
      {
        url,
        isPrimary: true,
        source,
        uploadedAt: new Date(),
      },
    ],
  };
};

/**
 * Check whether any photo field can be normalized into a renderable URL.
 *
 * @param {import("express").Request} req Express request used for upload origins.
 * @param {object} userLike User-like object with photo aliases.
 * @returns {boolean}
 */
const hasSerializableUserPhoto = (req, userLike) => Boolean(getUserPhotoSelection(req, userLike).primaryPhoto);

/**
 * Aggregate all user photo aliases into a consistent serialized shape.
 *
 * @param {import("express").Request} req Express request used for upload origins.
 * @param {object} userLike User-like object with photo aliases.
 * @returns {{avatar: string, profileImage: string, photo: string, photos: string[], profilePhotos: string[]}}
 */
const serializeUserPhotoFields = (req, userLike) => {
  const images = normalizeUserImages(userLike, req);
  const normalizedPhotos = images.map((image) => image.url);
  const avatar = normalizedPhotos[0] || "";
  return {
    avatar,
    profileImage: avatar,
    photo: avatar,
    photos: normalizedPhotos,
    profilePhotos: normalizedPhotos,
    images,
  };
};

/**
 * Return a plain user object with normalized photo aliases merged in.
 *
 * @param {import("express").Request} req Express request used for upload origins.
 * @param {object} userLike Plain object or Mongoose document.
 * @returns {object} User object with normalized photo fields.
 */
const withSerializedUserPhotoFields = (req, userLike) => {
  if (!userLike) return userLike;
  const user = typeof userLike.toObject === "function" ? userLike.toObject() : { ...userLike };
  return {
    ...user,
    ...serializeUserPhotoFields(req, user),
  };
};

module.exports = {
  getPhotoUrl,
  getPrimaryPhotoUrl,
  getUserPhotoSelection,
  hasSerializableUserPhoto,
  makePrimaryUserPhotoFields,
  normalizeUserImages,
  normalizePhotoUrl,
  serializeUserPhotoFields,
  syncCanonicalPhotoFields,
  withSerializedUserPhotoFields,
};
