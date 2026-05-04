const User = require("../models/User.js");

// Define staff roles that should never appear in public discovery
const STAFF_ROLES = ["admin", "moderator", "support", "creator_manager", "finance", "content_reviewer"];

const requireAdmin = async (req, res, next) => {
  try {
    // Defensive guard: req.userId must be set by verifyToken middleware
    if (!req.userId) {
      return res.status(401).json({ message: "No autenticado: token requerido" });
    }
    const user = await User.findById(req.userId).select("role");
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Acceso denegado: se requiere rol admin" });
    }
    req.userRole = user.role;
    next();
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * Middleware that allows both admin and moderator roles.
 * Moderators can handle moderation tasks but not financial operations.
 * Must be used after verifyToken so that req.userId is set.
 */
const requireModeratorOrAdmin = async (req, res, next) => {
  try {
    // Defensive guard: req.userId must be set by verifyToken middleware
    if (!req.userId) {
      return res.status(401).json({ message: "No autenticado: token requerido" });
    }
    const user = await User.findById(req.userId).select("role");
    if (!user || (user.role !== "admin" && user.role !== "moderator")) {
      return res.status(403).json({ message: "Acceso denegado: se requiere rol moderador o admin" });
    }
    // Store role in request for downstream checks if needed
    req.userRole = user.role;
    next();
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * Middleware that requires a specific role
 * @param {string} requiredRole - The role required to access the route
 */
const requireRole = (requiredRole) => {
  return async (req, res, next) => {
    try {
      // Defensive guard: req.userId must be set by verifyToken middleware
      if (!req.userId) {
        return res.status(401).json({ message: "No autenticado: token requerido" });
      }
      const user = await User.findById(req.userId).select("role");
      if (!user || user.role !== requiredRole) {
        return res.status(403).json({ 
          message: `Acceso denegado: se requiere rol ${requiredRole}` 
        });
      }
      req.userRole = user.role;
      next();
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  };
};

/**
 * Middleware that allows any of the specified roles
 * @param {string[]} allowedRoles - Array of roles allowed to access the route
 */
const requireAnyRole = (allowedRoles) => {
  return async (req, res, next) => {
    try {
      // Defensive guard: req.userId must be set by verifyToken middleware
      if (!req.userId) {
        return res.status(401).json({ message: "No autenticado: token requerido" });
      }
      const user = await User.findById(req.userId).select("role");
      if (!user || !allowedRoles.includes(user.role)) {
        return res.status(403).json({ 
          message: "Acceso denegado: no tienes permiso para esta sección" 
        });
      }
      req.userRole = user.role;
      next();
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  };
};

/**
 * Permission definitions for different operations
 */
const PERMISSIONS = {
  // Financial operations
  VIEW_PAYOUTS: ["admin", "finance"],
  UPDATE_PAYOUTS: ["admin", "finance"],
  VIEW_REVENUE: ["admin", "finance"],
  
  // User management
  VIEW_USERS: ["admin", "support", "moderator"],
  SUSPEND_USERS: ["admin", "moderator"],
  BLOCK_USERS: ["admin", "moderator"],
  DELETE_USERS: ["admin"], // Hard delete only
  CHANGE_USER_ROLES: ["admin"], // Only admin can change roles
  
  // Creator management
  VIEW_CREATOR_REQUESTS: ["admin", "creator_manager"],
  APPROVE_CREATORS: ["admin", "creator_manager"],
  MANAGE_CREATORS: ["admin", "creator_manager"],
  
  // Agency management
  MANAGE_AGENCIES: ["admin"], // Full control only
  VIEW_AGENCIES: ["admin"],
  
  // Moderation
  VIEW_REPORTS: ["admin", "moderator", "content_reviewer"],
  UPDATE_REPORTS: ["admin", "moderator", "content_reviewer"],
  VIEW_LIVES: ["admin", "moderator"],
  
  // Settings
  MANAGE_SETTINGS: ["admin"], // Only admin
};

/**
 * Middleware that checks if user has permission for an operation
 * @param {string} permission - Permission key from PERMISSIONS
 */
const requirePermission = (permission) => {
  return async (req, res, next) => {
    try {
      // Defensive guard: req.userId must be set by verifyToken middleware
      if (!req.userId) {
        return res.status(401).json({ message: "No autenticado: token requerido" });
      }
      const allowedRoles = PERMISSIONS[permission];
      if (!allowedRoles) {
        console.error(`❌ Unknown permission: ${permission}`);
        return res.status(500).json({ message: "Error de configuración de permisos" });
      }
      
      const user = await User.findById(req.userId).select("role");
      if (!user || !allowedRoles.includes(user.role)) {
        return res.status(403).json({ 
          message: "Acceso denegado: no tienes permiso para esta sección" 
        });
      }
      req.userRole = user.role;
      next();
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  };
};

module.exports = { 
  requireAdmin, 
  requireModeratorOrAdmin,
  requireRole,
  requireAnyRole,
  requirePermission,
  STAFF_ROLES,
  PERMISSIONS,
};
