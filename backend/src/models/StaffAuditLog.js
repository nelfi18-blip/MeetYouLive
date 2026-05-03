const mongoose = require("mongoose");

const staffAuditLogSchema = new mongoose.Schema(
  {
    staffId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "User", 
      required: true 
    },
    staffRole: { 
      type: String, 
      required: true 
    },
    action: { 
      type: String, 
      required: true 
    },
    targetType: { 
      type: String, 
      enum: ["User", "Creator", "Payout", "Report", "Live", "Agency", "Setting", "Other"], 
      required: true 
    },
    targetId: { 
      type: mongoose.Schema.Types.ObjectId, 
      default: null 
    },
    targetIdentifier: { 
      type: String, 
      default: "" 
    },
    details: { 
      type: mongoose.Schema.Types.Mixed, 
      default: {} 
    },
    ipAddress: { 
      type: String, 
      default: null 
    },
  },
  { timestamps: true }
);

// Index for efficient queries
staffAuditLogSchema.index({ staffId: 1, createdAt: -1 });
staffAuditLogSchema.index({ targetType: 1, targetId: 1 });
staffAuditLogSchema.index({ createdAt: -1 });

const StaffAuditLog = mongoose.model("StaffAuditLog", staffAuditLogSchema);

module.exports = StaffAuditLog;
