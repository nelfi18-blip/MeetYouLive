/**
 * useAgoraMultiGuest - Hook for managing Agora multi-publisher live streaming
 * 
 * Handles:
 * - Creating Agora client (once)
 * - Publishing local tracks (host/guest)
 * - Subscribing to multiple remote users
 * - Unsubscribing when users leave
 * - Track cleanup on unmount
 * - Error handling for camera/mic permissions
 */

import { useEffect, useRef, useState } from "react";

const AGORA_APP_ID = process.env.NEXT_PUBLIC_AGORA_APP_ID;
const API_URL = process.env.NEXT_PUBLIC_API_URL;

export default function useAgoraMultiGuest(liveId, token, isPublisher, enabled = true) {
  const [agoraJoined, setAgoraJoined] = useState(false);
  const [agoraError, setAgoraError] = useState("");
  const [remoteUsers, setRemoteUsers] = useState(new Map()); // uid → {user, videoTrack, audioTrack}

  const clientRef = useRef(null);
  const localAudioTrackRef = useRef(null);
  const localVideoTrackRef = useRef(null);
  const cancelledRef = useRef(false);
  const localVideoContainerRef = useRef(null);

  // Cleanup function
  const cleanup = () => {
    if (localAudioTrackRef.current) {
      localAudioTrackRef.current.close();
      localAudioTrackRef.current = null;
    }
    if (localVideoTrackRef.current) {
      localVideoTrackRef.current.close();
      localVideoTrackRef.current = null;
    }
    if (clientRef.current) {
      clientRef.current.leave().catch(() => {});
      clientRef.current = null;
    }
    setAgoraJoined(false);
    setRemoteUsers(new Map());
  };

  useEffect(() => {
    if (!liveId || !token || !enabled) return;

    cancelledRef.current = false;

    const joinAgora = async () => {
      try {
        if (!AGORA_APP_ID) {
          throw new Error("Agora App ID no configurado");
        }

        const AgoraRTC = (await import("agora-rtc-sdk-ng")).default;
        if (cancelledRef.current) return;

        // Get Agora token
        const role = isPublisher ? "publisher" : "subscriber";
        const tokenRes = await fetch(
          `${API_URL}/api/agora/token?channelName=${encodeURIComponent(liveId)}&role=${role}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        if (!tokenRes.ok) {
          throw new Error("No se pudo obtener token de Agora");
        }

        const { token: agoraToken, uid } = await tokenRes.json();
        if (cancelledRef.current) return;

        // Create client (only once)
        if (!clientRef.current) {
          clientRef.current = AgoraRTC.createClient({ mode: "live", codec: "vp8" });
        }

        const client = clientRef.current;

        // Set role and join
        if (isPublisher) {
          await client.setClientRole("host");

          // Create local tracks
          try {
            [localAudioTrackRef.current, localVideoTrackRef.current] =
              await AgoraRTC.createMicrophoneAndCameraTracks();
          } catch (trackErr) {
            if (cancelledRef.current) return;
            throw new Error(
              trackErr.message?.includes("Permission denied")
                ? "Permite el acceso a cámara/micrófono para transmitir"
                : "No se pudo acceder a cámara/micrófono"
            );
          }

          if (cancelledRef.current) {
            localAudioTrackRef.current?.close();
            localVideoTrackRef.current?.close();
            return;
          }

          // Join channel
          await client.join(AGORA_APP_ID, String(liveId), agoraToken, uid);

          // Publish tracks
          await client.publish([localAudioTrackRef.current, localVideoTrackRef.current]);

          // Play local video if container ref is set
          if (localVideoContainerRef.current && localVideoTrackRef.current) {
            localVideoTrackRef.current.play(localVideoContainerRef.current);
          }
        } else {
          // Subscriber (audience)
          await client.setClientRole("audience");
          await client.join(AGORA_APP_ID, String(liveId), agoraToken, uid);

          // Subscribe to existing remote users
          for (const user of client.remoteUsers) {
            try {
              if (user.hasVideo) {
                await client.subscribe(user, "video");
              }
              if (user.hasAudio) {
                await client.subscribe(user, "audio");
                try {
                  user.audioTrack?.play();
                } catch (err) {
                  console.warn("[Agora] audio autoplay blocked:", err);
                }
              }
              // Add to remote users map
              setRemoteUsers((prev) => {
                const newMap = new Map(prev);
                newMap.set(user.uid, {
                  uid: user.uid,
                  videoTrack: user.videoTrack,
                  audioTrack: user.audioTrack,
                  hasVideo: user.hasVideo,
                  hasAudio: user.hasAudio,
                });
                return newMap;
              });
            } catch (err) {
              console.error("[Agora] Error subscribing to existing user:", err);
            }
          }

          // Listen for new remote users
          client.on("user-published", async (user, mediaType) => {
            try {
              await client.subscribe(user, mediaType);

              if (mediaType === "audio") {
                try {
                  user.audioTrack?.play();
                } catch (err) {
                  console.warn("[Agora] audio autoplay blocked:", err);
                }
              }

              // Update remote users map
              setRemoteUsers((prev) => {
                const newMap = new Map(prev);
                const existing = newMap.get(user.uid) || {};
                newMap.set(user.uid, {
                  ...existing,
                  uid: user.uid,
                  videoTrack: mediaType === "video" ? user.videoTrack : existing.videoTrack,
                  audioTrack: mediaType === "audio" ? user.audioTrack : existing.audioTrack,
                  hasVideo: mediaType === "video" ? true : existing.hasVideo,
                  hasAudio: mediaType === "audio" ? true : existing.hasAudio,
                });
                return newMap;
              });
            } catch (err) {
              console.error("[Agora] Error in user-published:", err);
            }
          });

          // Listen for remote users leaving or unpublishing
          client.on("user-unpublished", (user, mediaType) => {
            try {
              if (mediaType === "video") {
                user.videoTrack?.stop();
              }

              // Update remote users map
              setRemoteUsers((prev) => {
                const newMap = new Map(prev);
                const existing = newMap.get(user.uid);
                if (existing) {
                  newMap.set(user.uid, {
                    ...existing,
                    videoTrack: mediaType === "video" ? null : existing.videoTrack,
                    audioTrack: mediaType === "audio" ? null : existing.audioTrack,
                    hasVideo: mediaType === "video" ? false : existing.hasVideo,
                    hasAudio: mediaType === "audio" ? false : existing.hasAudio,
                  });
                }
                return newMap;
              });
            } catch (err) {
              console.warn("[Agora] Error in user-unpublished:", err);
            }
          });

          client.on("user-left", (user) => {
            setRemoteUsers((prev) => {
              const newMap = new Map(prev);
              newMap.delete(user.uid);
              return newMap;
            });
          });
        }

        if (!cancelledRef.current) {
          setAgoraJoined(true);
        }
      } catch (err) {
        if (!cancelledRef.current) {
          console.error("[Agora] Join error:", err);
          setAgoraError(err.message || "No se pudo conectar al canal de video");
        }
      }
    };

    joinAgora();

    // Cleanup on unmount
    return () => {
      cancelledRef.current = true;
      cleanup();
    };
  }, [liveId, token, isPublisher, enabled]);

  return {
    agoraJoined,
    agoraError,
    remoteUsers,
    localVideoContainerRef,
    localAudioTrack: localAudioTrackRef.current,
    localVideoTrack: localVideoTrackRef.current,
    cleanup,
  };
}
