/**
 * Image and display name helpers for consistent UI fallbacks
 * These ensure we never show broken images or empty placeholders
 */

/**
 * Normalize user-provided image values into renderable client URLs.
 *
 * @param {unknown} value - Raw image field value
 * @returns {string|null} - Safe image URL or null
 */
export function normalizeImageUrl(value) {
  if (!value) return null;

  const raw = typeof value === 'string'
    ? value
    : value?.url || value?.src || value?.secure_url || value?.path || "";
  const trimmed = typeof raw === 'string' ? raw.trim() : "";

  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      if (url.pathname.startsWith("/api/uploads/")) {
        url.pathname = url.pathname.replace(/^\/api\/uploads\//, "/uploads/");
      }
      return url.toString();
    } catch {
      return null;
    }
  }
  if (trimmed.startsWith("//")) return `https:${trimmed}`;

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "";
  const apiOrigin = apiUrl.replace(/\/api\/?$/, "").replace(/\/$/, "");

  if (trimmed.startsWith("/")) {
    const withoutApiPrefix = trimmed.replace(/^\/?api\/uploads\//i, "uploads/");
    const relativePath = withoutApiPrefix.startsWith("/") ? withoutApiPrefix.slice(1) : withoutApiPrefix;
    return apiOrigin ? `${apiOrigin}/${relativePath}` : `/${relativePath}`;
  }

  const normalizedPath = trimmed.replace(/^\/?api\/uploads\//i, "uploads/");
  if (/^(uploads|images|media|avatars|profile-photos)\//i.test(normalizedPath)) {
    return apiOrigin ? `${apiOrigin}/${normalizedPath}` : `/${normalizedPath}`;
  }

  return null;
}

function getPrimaryProfileImageCandidate(user) {
  if (!user) return null;

  const candidates = [
    { field: "images", value: Array.isArray(user.images) ? user.images[0] : undefined },
    { field: "avatar", value: user.avatar },
    { field: "profileImage", value: user.profileImage },
    { field: "profilePhotos", value: Array.isArray(user.profilePhotos) ? user.profilePhotos[0] : undefined },
    { field: "photo", value: user.photo },
  ];

  for (const candidate of candidates) {
    const normalized = normalizeImageUrl(candidate.value);
    if (normalized) return { ...candidate, normalized };
  }

  const fallbackCandidates = [
    ...(Array.isArray(user.images) ? user.images.map((value) => ({ field: "images", value })) : []),
    ...(Array.isArray(user.profilePhotos)
      ? user.profilePhotos.map((value) => ({ field: "profilePhotos", value }))
      : []),
    ...(Array.isArray(user.photos) ? user.photos.map((value) => ({ field: "photos", value })) : []),
    { field: "photoURL", value: user.photoURL },
    { field: "photoUrl", value: user.photoUrl },
    { field: "image", value: user.image },
    { field: "imageUrl", value: user.imageUrl },
    { field: "picture", value: user.picture },
  ];

  for (const candidate of fallbackCandidates) {
    const normalized = normalizeImageUrl(candidate.value);
    if (normalized) return { ...candidate, normalized };
  }

  return null;
}

function getPhotoCandidates(user, primaryCandidate = null) {
  if (!user) return [];
  return [
    ...(primaryCandidate ? [primaryCandidate] : []),
    ...(Array.isArray(user.images) ? user.images.map((value) => ({ field: "images", value })) : []),
    { field: "avatar", value: user.avatar },
    { field: "profileImage", value: user.profileImage },
    ...(Array.isArray(user.profilePhotos)
      ? user.profilePhotos.map((value) => ({ field: "profilePhotos", value }))
      : []),
    { field: "photo", value: user.photo },
    ...(Array.isArray(user.photos) ? user.photos.map((value) => ({ field: "photos", value })) : []),
    { field: "photoURL", value: user.photoURL },
    { field: "photoUrl", value: user.photoUrl },
    { field: "image", value: user.image },
    { field: "imageUrl", value: user.imageUrl },
    { field: "picture", value: user.picture },
  ];
}

export function getUserPhotoSelection(user) {
  const photos = [];
  const seenPhotos = new Set();
  let fieldUsed = null;
  const primaryCandidate = getPrimaryProfileImageCandidate(user);

  for (const { field, value, normalized: alreadyNormalized } of getPhotoCandidates(user, primaryCandidate)) {
    const normalized = alreadyNormalized || normalizeImageUrl(value);
    if (normalized && !seenPhotos.has(normalized)) {
      seenPhotos.add(normalized);
      photos.push(normalized);
      if (!fieldUsed) fieldUsed = field;
    }
  }

  return {
    primaryPhoto: photos[0] || null,
    photos,
    fieldUsed,
    photoCount: photos.length,
  };
}

/**
 * Get the primary profile image using the canonical priority expected by
 * profile/feed surfaces.
 *
 * Priority: images[0].url (or images[0] string) > avatar > profileImage >
 * profilePhotos[0] > photo.
 *
 * @param {Object} user - User object with image fields
 * @returns {string|null} - Image URL or null for fallback
 */
export function getPrimaryProfileImage(user) {
  return getPrimaryProfileImageCandidate(user)?.normalized || null;
}

/**
 * Get the best available user image
 * Priority: images[0] > avatar > profileImage > profilePhotos[0] > photo > null
 * 
 * @param {Object} user - User object with image fields
 * @returns {string|null} - Image URL or null for fallback
 */
export function getUserImage(user) {
  return getPrimaryProfileImage(user);
}

/**
 * Get the best available live stream thumbnail
 * Priority: live.thumbnail > live.user.avatar > null (for gradient fallback)
 * 
 * @param {Object} live - Live object with thumbnail, user.avatar fields
 * @returns {string|null} - Image URL or null for fallback
 */
export function getLiveThumbnail(live) {
  if (!live) return null;
  
  // Priority 1: live stream thumbnail
  const thumbnail = normalizeImageUrl(live.thumbnail);
  if (thumbnail) return thumbnail;
  
  // Priority 2: creator's avatar as fallback
  const avatar = normalizeImageUrl(live.user?.avatar);
  if (avatar) return avatar;
  
  // No image available - return null for gradient fallback
  return null;
}

/**
 * Get safe display name from user object
 * Priority: displayName > name > firstName + lastName > username > "Usuario"
 * 
 * @param {Object} user - User object with name, username fields
 * @returns {string} - Safe display name (never empty)
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMAIL_LIKE_PATTERN = /^[^\s@]+@[^\s@]+$/;

function isEmailLikeName(value) {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  // Hide exact emails and email-like internal handles such as "user@domain".
  return EMAIL_PATTERN.test(trimmed) || EMAIL_LIKE_PATTERN.test(trimmed);
}

function getSafeNamePart(value) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return trimmed && !isEmailLikeName(trimmed) ? trimmed : "";
}

export function getDisplayName(user) {
  if (!user) return "Usuario";

  const fullName = [getSafeNamePart(user.firstName), getSafeNamePart(user.lastName)].filter(Boolean).join(" ");
  const candidates = [
    user.displayName,
    user.name,
    fullName,
    user.username,
  ];

  return candidates.map(getSafeNamePart).find(Boolean) || "Usuario";
}

/**
 * Get the first available profile biography/description text.
 *
 * @param {Object} user - User/profile object with bio fields
 * @returns {string} - Trimmed bio text or empty string
 */
export function getBioText(user) {
  if (!user) return "";

  const rawBio = [
    user.bio,
    user.description,
    user.about,
    user.creatorProfile?.bio,
  ].find((value) => typeof value === "string" && value.trim());

  return rawBio ? rawBio.trim() : "";
}

/**
 * Get the first letter of a name for avatar fallbacks
 * Returns uppercase letter or "?" if no valid name
 * 
 * @param {string} name - Name string
 * @returns {string} - Single uppercase letter or "?"
 */
export function getInitial(name) {
  if (!name || typeof name !== 'string') return "?";
  
  const trimmed = name.trim();
  if (trimmed.length === 0) return "?";
  
  return trimmed[0].toUpperCase();
}

/**
 * Generate a consistent gradient background based on a string (e.g., user ID or name)
 * Returns a beautiful gradient color pair for fallback avatars
 * 
 * @param {string} seed - String to generate gradient from (e.g., user._id or name)
 * @returns {string} - CSS gradient string
 */
export function getGradientForUser(seed) {
  if (!seed || typeof seed !== 'string') {
    // Default gradient
    return 'linear-gradient(135deg, #e040fb, #8b5cf6)';
  }
  
  // Generate a hash from the seed
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  // Define gradient pairs (premium neon theme)
  const gradients = [
    'linear-gradient(135deg, #e040fb, #8b5cf6)', // Pink to purple
    'linear-gradient(135deg, #ff4fa3, #e040fb)', // Pink to magenta
    'linear-gradient(135deg, #8b5cf6, #22d3ee)', // Purple to cyan
    'linear-gradient(135deg, #7c3aed, #fb923c)', // Purple to orange
    'linear-gradient(135deg, #22d3ee, #34d399)', // Cyan to green
    'linear-gradient(135deg, #fb923c, #fbbf24)', // Orange to yellow
    'linear-gradient(135deg, #e040fb, #7c3aed)', // Magenta to deep purple
    'linear-gradient(135deg, #34d399, #22d3ee)', // Green to cyan
  ];
  
  // Pick a gradient based on hash
  const index = Math.abs(hash) % gradients.length;
  return gradients[index];
}
