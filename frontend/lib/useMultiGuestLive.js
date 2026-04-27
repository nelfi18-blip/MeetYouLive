/**
 * useMultiGuestLive - Hook for managing multi-guest live streaming
 * 
 * Handles:
 * - Fetching guest list and requests
 * - Requesting to join as guest
 * - Approving/declining guest requests (host)
 * - Removing guests (host)
 * - Leaving as guest
 * - Socket events for real-time updates
 */

import { useState, useEffect, useCallback, useRef } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

export default function useMultiGuestLive(liveId, token, currentUserId, isHost, socket) {
  const [guests, setGuests] = useState([]);
  const [guestRequests, setGuestRequests] = useState([]);
  const [isGuest, setIsGuest] = useState(false);
  const [hasRequestedJoin, setHasRequestedJoin] = useState(false);
  const [requestStatus, setRequestStatus] = useState(null);
  const [loading, setLoading] = useState(false);

  // Fetch guests and requests
  const fetchGuests = useCallback(async () => {
    if (!liveId || !token) return;

    try {
      const res = await fetch(`${API_URL}/api/lives/${liveId}/guests`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        setGuests(data.guests || []);
        setGuestRequests(data.guestRequests || []);

        // Check if current user is a guest
        if (currentUserId) {
          const isCurrentUserGuest = (data.guests || []).some(
            (g) => String(g.userId?._id || g.userId) === String(currentUserId)
          );
          setIsGuest(isCurrentUserGuest);

          // Check if current user has a pending request
          const hasRequest = (data.guestRequests || []).some(
            (r) => String(r.userId?._id || r.userId) === String(currentUserId)
          );
          setHasRequestedJoin(hasRequest);
          if (hasRequest) {
            setRequestStatus("pending");
          }
        }
      }
    } catch (err) {
      console.error("[useMultiGuestLive] Error fetching guests:", err);
    }
  }, [liveId, token, currentUserId]);

  // Initial fetch
  useEffect(() => {
    fetchGuests();
  }, [fetchGuests]);

  // Request to join as guest
  const requestJoin = useCallback(async () => {
    if (!liveId || !token || loading) return;

    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/lives/${liveId}/request-join`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await res.json();

      if (res.ok) {
        setHasRequestedJoin(true);
        setRequestStatus("pending");
        await fetchGuests();
      } else {
        alert(data.message || "Error al enviar solicitud");
      }
    } catch (err) {
      console.error("[useMultiGuestLive] Error requesting join:", err);
      alert("Error al enviar solicitud");
    } finally {
      setLoading(false);
    }
  }, [liveId, token, loading, fetchGuests]);

  // Approve guest (host only)
  const approveGuest = useCallback(async (guestUserId) => {
    if (!liveId || !token || loading) return;

    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/lives/${liveId}/approve-guest`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ guestUserId }),
      });

      const data = await res.json();

      if (res.ok) {
        await fetchGuests();
      } else {
        alert(data.message || "Error al aprobar invitado");
      }
    } catch (err) {
      console.error("[useMultiGuestLive] Error approving guest:", err);
      alert("Error al aprobar invitado");
    } finally {
      setLoading(false);
    }
  }, [liveId, token, loading, fetchGuests]);

  // Decline guest (host only)
  const declineGuest = useCallback(async (guestUserId) => {
    if (!liveId || !token || loading) return;

    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/lives/${liveId}/decline-guest`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ guestUserId }),
      });

      const data = await res.json();

      if (res.ok) {
        await fetchGuests();
      } else {
        alert(data.message || "Error al rechazar invitado");
      }
    } catch (err) {
      console.error("[useMultiGuestLive] Error declining guest:", err);
      alert("Error al rechazar invitado");
    } finally {
      setLoading(false);
    }
  }, [liveId, token, loading, fetchGuests]);

  // Remove guest (host only)
  const removeGuest = useCallback(async (guestUserId) => {
    if (!liveId || !token || loading) return;

    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/lives/${liveId}/remove-guest/${guestUserId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await res.json();

      if (res.ok) {
        await fetchGuests();
      } else {
        alert(data.message || "Error al remover invitado");
      }
    } catch (err) {
      console.error("[useMultiGuestLive] Error removing guest:", err);
      alert("Error al remover invitado");
    } finally {
      setLoading(false);
    }
  }, [liveId, token, loading, fetchGuests]);

  // Leave as guest
  const leaveAsGuest = useCallback(async () => {
    if (!liveId || !token || loading) return;

    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/lives/${liveId}/leave-guest`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await res.json();

      if (res.ok) {
        setIsGuest(false);
        await fetchGuests();
      } else {
        alert(data.message || "Error al salir como invitado");
      }
    } catch (err) {
      console.error("[useMultiGuestLive] Error leaving as guest:", err);
      alert("Error al salir como invitado");
    } finally {
      setLoading(false);
    }
  }, [liveId, token, loading, fetchGuests]);

  // Socket event listeners for real-time updates
  useEffect(() => {
    if (!socket || !liveId) return;

    const handleGuestJoined = ({ liveId: eventLiveId }) => {
      if (eventLiveId === liveId) {
        fetchGuests();
      }
    };

    const handleGuestLeft = ({ liveId: eventLiveId }) => {
      if (eventLiveId === liveId) {
        fetchGuests();
      }
    };

    const handleGuestRequestReceived = ({ liveId: eventLiveId }) => {
      if (eventLiveId === liveId) {
        fetchGuests();
      }
    };

    const handleGuestApproved = ({ liveId: eventLiveId }) => {
      if (eventLiveId === liveId) {
        setIsGuest(true);
        setRequestStatus("approved");
        fetchGuests();
      }
    };

    const handleGuestDeclined = ({ liveId: eventLiveId }) => {
      if (eventLiveId === liveId) {
        setRequestStatus("declined");
        setHasRequestedJoin(false);
      }
    };

    const handleGuestRemoved = ({ liveId: eventLiveId }) => {
      if (eventLiveId === liveId) {
        setIsGuest(false);
        setRequestStatus(null);
        setHasRequestedJoin(false);
      }
    };

    socket.on("GUEST_JOINED", handleGuestJoined);
    socket.on("GUEST_LEFT", handleGuestLeft);
    socket.on("GUEST_REQUEST_RECEIVED", handleGuestRequestReceived);
    socket.on("GUEST_APPROVED", handleGuestApproved);
    socket.on("GUEST_DECLINED", handleGuestDeclined);
    socket.on("GUEST_REMOVED", handleGuestRemoved);

    return () => {
      socket.off("GUEST_JOINED", handleGuestJoined);
      socket.off("GUEST_LEFT", handleGuestLeft);
      socket.off("GUEST_REQUEST_RECEIVED", handleGuestRequestReceived);
      socket.off("GUEST_APPROVED", handleGuestApproved);
      socket.off("GUEST_DECLINED", handleGuestDeclined);
      socket.off("GUEST_REMOVED", handleGuestRemoved);
    };
  }, [socket, liveId, fetchGuests]);

  return {
    guests,
    guestRequests,
    isGuest,
    hasRequestedJoin,
    requestStatus,
    loading,
    requestJoin,
    approveGuest,
    declineGuest,
    removeGuest,
    leaveAsGuest,
    refreshGuests: fetchGuests,
  };
}
