"use client";

import { useState } from "react";

/**
 * GuestControlsPanel - UI for managing live guest requests and invitations
 * 
 * For hosts:
 * - Shows pending guest requests
 * - Approve/decline buttons
 * - Remove guest button
 * 
 * For viewers:
 * - "Solicitar unirse" button
 * - Shows status (pending/approved/declined)
 * 
 * For guests:
 * - "Salir como invitado" button
 */

export default function GuestControlsPanel({
  isHost = false,
  isGuest = false,
  guestRequests = [],
  currentGuests = [],
  hasRequestedJoin = false,
  requestStatus = null, // null | 'pending' | 'approved' | 'declined'
  onRequestJoin = null,
  onApproveGuest = null,
  onDeclineGuest = null,
  onRemoveGuest = null,
  onLeaveAsGuest = null,
  maxGuests = 3,
}) {
  const [processing, setProcessing] = useState(false);

  const handleRequestJoin = async () => {
    if (!onRequestJoin || processing) return;
    setProcessing(true);
    try {
      await onRequestJoin();
    } finally {
      setProcessing(false);
    }
  };

  const handleApprove = async (guestUserId) => {
    if (!onApproveGuest || processing) return;
    setProcessing(true);
    try {
      await onApproveGuest(guestUserId);
    } finally {
      setProcessing(false);
    }
  };

  const handleDecline = async (guestUserId) => {
    if (!onDeclineGuest || processing) return;
    setProcessing(true);
    try {
      await onDeclineGuest(guestUserId);
    } finally {
      setProcessing(false);
    }
  };

  const handleRemove = async (guestUserId) => {
    if (!onRemoveGuest || processing) return;
    setProcessing(true);
    try {
      await onRemoveGuest(guestUserId);
    } finally {
      setProcessing(false);
    }
  };

  const handleLeave = async () => {
    if (!onLeaveAsGuest || processing) return;
    setProcessing(true);
    try {
      await onLeaveAsGuest();
    } finally {
      setProcessing(false);
    }
  };

  const activeGuestsCount = currentGuests.filter((g) => g.status === "active").length;
  const isFull = activeGuestsCount >= maxGuests;

  // Guest view: show leave button
  if (isGuest && onLeaveAsGuest) {
    return (
      <div className="guest-controls">
        <div className="guest-status-card">
          <div className="status-icon">🎙️</div>
          <div className="status-info">
            <p className="status-title">Estás transmitiendo como invitado</p>
            <p className="status-desc">Los espectadores pueden verte y escucharte</p>
          </div>
        </div>
        <button
          className="btn btn-leave"
          onClick={handleLeave}
          disabled={processing}
        >
          {processing ? "Saliendo..." : "Salir como invitado"}
        </button>
        <style jsx>{`
          .guest-controls {
            display: flex;
            flex-direction: column;
            gap: 0.75rem;
            padding: 1rem;
            background: rgba(26, 11, 46, 0.8);
            border: 1px solid var(--border);
            border-radius: var(--radius);
            backdrop-filter: blur(10px);
          }

          .guest-status-card {
            display: flex;
            align-items: center;
            gap: 0.75rem;
            padding: 0.75rem;
            background: rgba(255, 15, 138, 0.1);
            border: 1px solid rgba(255, 15, 138, 0.3);
            border-radius: var(--radius);
          }

          .status-icon {
            font-size: 2rem;
            flex-shrink: 0;
          }

          .status-info {
            flex: 1;
          }

          .status-title {
            font-size: 0.9rem;
            font-weight: 700;
            color: var(--text);
            margin-bottom: 0.25rem;
          }

          .status-desc {
            font-size: 0.8rem;
            color: var(--text-muted);
          }

          .btn {
            padding: 0.65rem 1.2rem;
            border-radius: var(--radius-pill);
            font-size: 0.9rem;
            font-weight: 700;
            cursor: pointer;
            transition: all var(--transition);
            border: none;
          }

          .btn-leave {
            background: rgba(220, 38, 38, 0.15);
            border: 1px solid rgba(220, 38, 38, 0.45);
            color: #f87171;
          }

          .btn-leave:hover:not(:disabled) {
            background: rgba(220, 38, 38, 0.25);
            border-color: rgba(220, 38, 38, 0.7);
          }

          .btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
          }
        `}</style>
      </div>
    );
  }

  // Viewer view: show request button
  if (!isHost && !isGuest && onRequestJoin) {
    return (
      <div className="guest-controls">
        {!hasRequestedJoin && !isFull && (
          <button
            className="btn btn-request"
            onClick={handleRequestJoin}
            disabled={processing}
          >
            {processing ? "Enviando..." : "🎙️ Solicitar unirse al directo"}
          </button>
        )}

        {hasRequestedJoin && requestStatus === "pending" && (
          <div className="status-message pending">
            <span className="status-icon">⏳</span>
            <div>
              <p className="status-text">Solicitud enviada</p>
              <p className="status-subtext">Esperando aprobación del creador</p>
            </div>
          </div>
        )}

        {requestStatus === "declined" && (
          <div className="status-message declined">
            <span className="status-icon">❌</span>
            <div>
              <p className="status-text">Solicitud rechazada</p>
              <p className="status-subtext">El creador rechazó tu solicitud</p>
            </div>
          </div>
        )}

        {isFull && !hasRequestedJoin && (
          <div className="status-message full">
            <span className="status-icon">👥</span>
            <div>
              <p className="status-text">Directo lleno</p>
              <p className="status-subtext">Ya hay {maxGuests} invitados activos</p>
            </div>
          </div>
        )}

        <style jsx>{`
          .guest-controls {
            padding: 1rem;
            background: rgba(26, 11, 46, 0.8);
            border: 1px solid var(--border);
            border-radius: var(--radius);
            backdrop-filter: blur(10px);
          }

          .btn {
            width: 100%;
            padding: 0.8rem 1.5rem;
            border-radius: var(--radius-pill);
            font-size: 0.95rem;
            font-weight: 700;
            cursor: pointer;
            transition: all var(--transition);
            border: none;
          }

          .btn-request {
            background: var(--grad-accent);
            color: #fff;
          }

          .btn-request:hover:not(:disabled) {
            transform: translateY(-2px);
            box-shadow: 0 6px 20px rgba(255, 15, 138, 0.4);
          }

          .btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
          }

          .status-message {
            display: flex;
            align-items: center;
            gap: 0.75rem;
            padding: 1rem;
            border-radius: var(--radius);
          }

          .status-message.pending {
            background: rgba(251, 191, 36, 0.1);
            border: 1px solid rgba(251, 191, 36, 0.3);
          }

          .status-message.declined {
            background: rgba(220, 38, 38, 0.1);
            border: 1px solid rgba(220, 38, 38, 0.3);
          }

          .status-message.full {
            background: rgba(156, 163, 175, 0.1);
            border: 1px solid rgba(156, 163, 175, 0.3);
          }

          .status-icon {
            font-size: 2rem;
            flex-shrink: 0;
          }

          .status-text {
            font-size: 0.95rem;
            font-weight: 700;
            color: var(--text);
            margin-bottom: 0.2rem;
          }

          .status-subtext {
            font-size: 0.8rem;
            color: var(--text-muted);
          }
        `}</style>
      </div>
    );
  }

  // Host view: show guest requests and current guests
  if (isHost) {
    return (
      <div className="guest-controls">
        <div className="panel-header">
          <h3>Gestión de invitados</h3>
          <span className="guests-count">
            {activeGuestsCount}/{maxGuests}
          </span>
        </div>

        {/* Pending requests */}
        {guestRequests.length > 0 && (
          <div className="requests-section">
            <h4>Solicitudes pendientes ({guestRequests.length})</h4>
            <div className="requests-list">
              {guestRequests.map((request) => (
                <div key={request.userId?._id || request.userId} className="request-item">
                  <div className="request-info">
                    <div className="user-avatar">
                      {request.userId?.avatar ? (
                        <img src={request.userId.avatar} alt="" />
                      ) : (
                        <span>{(request.userId?.username || "U")[0].toUpperCase()}</span>
                      )}
                    </div>
                    <div className="user-details">
                      <p className="username">{request.userId?.username || request.userId?.name || "Usuario"}</p>
                      <p className="timestamp">
                        {new Date(request.requestedAt).toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                  <div className="request-actions">
                    <button
                      className="btn btn-approve"
                      onClick={() => handleApprove(request.userId?._id || request.userId)}
                      disabled={processing || isFull}
                      title={isFull ? "Límite de invitados alcanzado" : "Aprobar"}
                    >
                      ✓
                    </button>
                    <button
                      className="btn btn-decline"
                      onClick={() => handleDecline(request.userId?._id || request.userId)}
                      disabled={processing}
                      title="Rechazar"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Current guests */}
        {currentGuests.length > 0 && (
          <div className="guests-section">
            <h4>Invitados activos ({activeGuestsCount})</h4>
            <div className="guests-list">
              {currentGuests.map((guest) => (
                <div key={guest.userId?._id || guest.userId} className="guest-item">
                  <div className="guest-info">
                    <div className="user-avatar">
                      {guest.userId?.avatar ? (
                        <img src={guest.userId.avatar} alt="" />
                      ) : (
                        <span>{(guest.userId?.username || "U")[0].toUpperCase()}</span>
                      )}
                    </div>
                    <div className="user-details">
                      <p className="username">{guest.userId?.username || guest.userId?.name || "Invitado"}</p>
                      <p className="status-badge">🎙️ En vivo</p>
                    </div>
                  </div>
                  <button
                    className="btn btn-remove"
                    onClick={() => handleRemove(guest.userId?._id || guest.userId)}
                    disabled={processing}
                    title="Remover invitado"
                  >
                    Remover
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {guestRequests.length === 0 && currentGuests.length === 0 && (
          <div className="empty-state">
            <p>👥</p>
            <p>No hay invitados ni solicitudes pendientes</p>
          </div>
        )}

        <style jsx>{`
          .guest-controls {
            display: flex;
            flex-direction: column;
            gap: 1rem;
            padding: 1rem;
            background: rgba(26, 11, 46, 0.9);
            border: 1px solid var(--border);
            border-radius: var(--radius);
            backdrop-filter: blur(10px);
            max-height: 500px;
            overflow-y: auto;
          }

          .panel-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
          }

          .panel-header h3 {
            font-size: 1.1rem;
            font-weight: 700;
            color: var(--text);
          }

          .guests-count {
            background: rgba(255, 15, 138, 0.2);
            border: 1px solid rgba(255, 15, 138, 0.4);
            color: var(--accent);
            padding: 0.25rem 0.7rem;
            border-radius: var(--radius-pill);
            font-size: 0.85rem;
            font-weight: 700;
          }

          .requests-section,
          .guests-section {
            display: flex;
            flex-direction: column;
            gap: 0.75rem;
          }

          h4 {
            font-size: 0.9rem;
            font-weight: 600;
            color: var(--text-muted);
            margin: 0;
          }

          .requests-list,
          .guests-list {
            display: flex;
            flex-direction: column;
            gap: 0.5rem;
          }

          .request-item,
          .guest-item {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 0.75rem;
            background: rgba(0, 0, 0, 0.3);
            border: 1px solid var(--border);
            border-radius: var(--radius);
          }

          .request-info,
          .guest-info {
            display: flex;
            align-items: center;
            gap: 0.75rem;
            flex: 1;
          }

          .user-avatar {
            width: 40px;
            height: 40px;
            border-radius: 50%;
            background: var(--grad-warm);
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 700;
            color: #fff;
            overflow: hidden;
            flex-shrink: 0;
          }

          .user-avatar img {
            width: 100%;
            height: 100%;
            object-fit: cover;
          }

          .user-details {
            flex: 1;
            min-width: 0;
          }

          .username {
            font-size: 0.9rem;
            font-weight: 600;
            color: var(--text);
            margin-bottom: 0.2rem;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }

          .timestamp {
            font-size: 0.75rem;
            color: var(--text-muted);
          }

          .status-badge {
            font-size: 0.75rem;
            color: #10b981;
          }

          .request-actions {
            display: flex;
            gap: 0.5rem;
          }

          .btn {
            padding: 0.5rem 0.85rem;
            border-radius: var(--radius);
            font-size: 0.85rem;
            font-weight: 600;
            cursor: pointer;
            transition: all var(--transition);
            border: none;
          }

          .btn-approve {
            background: rgba(16, 185, 129, 0.15);
            border: 1px solid rgba(16, 185, 129, 0.45);
            color: #10b981;
          }

          .btn-approve:hover:not(:disabled) {
            background: rgba(16, 185, 129, 0.25);
          }

          .btn-decline,
          .btn-remove {
            background: rgba(220, 38, 38, 0.15);
            border: 1px solid rgba(220, 38, 38, 0.45);
            color: #f87171;
          }

          .btn-decline:hover:not(:disabled),
          .btn-remove:hover:not(:disabled) {
            background: rgba(220, 38, 38, 0.25);
          }

          .btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
          }

          .empty-state {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 0.5rem;
            padding: 2rem 1rem;
            color: var(--text-muted);
            text-align: center;
          }

          .empty-state p:first-child {
            font-size: 2.5rem;
            margin: 0;
          }

          .empty-state p:last-child {
            font-size: 0.9rem;
            margin: 0;
          }
        `}</style>
      </div>
    );
  }

  return null;
}
