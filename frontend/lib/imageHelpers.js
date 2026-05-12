/**
 * Image and display name helpers for consistent UI fallbacks
 * These ensure we never show broken images or empty placeholders
 */

/**
 * Get the best available user image
 * Priority: profilePhotos[0] > avatar > null (for gradient fallback)
 * 
 * @param {Object} user - User object with profilePhotos, avatar fields
 * @returns {string|null} - Image URL or null for fallback
 */
export function getUserImage(user) {
  if (!user) return null;
  
  // Priority 1: profilePhotos array (first photo)
  if (user.profilePhotos && Array.isArray(user.profilePhotos) && user.profilePhotos.length > 0) {
    const firstPhoto = user.profilePhotos[0];
    if (typeof firstPhoto === 'string' && firstPhoto.trim()) {
      return firstPhoto.trim();
    }
  }
  
  // Priority 2: avatar field
  if (user.avatar && typeof user.avatar === 'string' && user.avatar.trim()) {
    return user.avatar.trim();
  }
  
  // No image available - return null for gradient fallback
  return null;
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
  if (live.thumbnail && typeof live.thumbnail === 'string' && live.thumbnail.trim()) {
    return live.thumbnail.trim();
  }
  
  // Priority 2: creator's avatar as fallback
  if (live.user?.avatar && typeof live.user.avatar === 'string' && live.user.avatar.trim()) {
    return live.user.avatar.trim();
  }
  
  // No image available - return null for gradient fallback
  return null;
}

/**
 * Get safe display name from user object
 * Priority: name > username > "Usuario"
 * 
 * @param {Object} user - User object with name, username fields
 * @returns {string} - Safe display name (never empty)
 */
export function getDisplayName(user) {
  if (!user) return "Usuario";
  
  // Priority 1: name
  if (user.name && typeof user.name === 'string' && user.name.trim()) {
    return user.name.trim();
  }
  
  // Priority 2: username
  if (user.username && typeof user.username === 'string' && user.username.trim()) {
    return user.username.trim();
  }
  
  // Fallback
  return "Usuario";
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
  
  // Define gradient pairs (premium purple theme only - no orange/yellow)
  const gradients = [
    'linear-gradient(135deg, #e040fb, #8b5cf6)', // Pink to purple
    'linear-gradient(135deg, #ff4fa3, #e040fb)', // Pink to magenta
    'linear-gradient(135deg, #8b5cf6, #22d3ee)', // Purple to cyan
    'linear-gradient(135deg, #7c3aed, #a855f7)', // Purple to lighter purple
    'linear-gradient(135deg, #22d3ee, #34d399)', // Cyan to green
    'linear-gradient(135deg, #e040fb, #7c3aed)', // Magenta to deep purple
    'linear-gradient(135deg, #34d399, #22d3ee)', // Green to cyan
    'linear-gradient(135deg, #a855f7, #ec4899)', // Purple to pink
  ];
  
  // Pick a gradient based on hash
  const index = Math.abs(hash) % gradients.length;
  return gradients[index];
}
