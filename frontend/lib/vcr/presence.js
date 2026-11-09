import rules from "../../../backend/src/lib/vcrWorldRules.cjs";

// Only the VCR namespace is owned here. Leaving never disconnects Live/Chat.
export function createVcrPresence({ socket, world, onState, onPeers, onInstance, aiScene = null }) {
  // The preview must supply the exact descriptor returned by the isolated
  // authenticated backend. No data here enables AI mode by default.
  if (aiScene && (
    !rules.DESTINATIONS[aiScene.country] ||
    !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(aiScene.providerWorldId || "") ||
    !/^[a-f0-9]{64}$/i.test(aiScene.splatSha256 || "") ||
    !/^[a-f0-9]{64}$/i.test(aiScene.colliderSha256 || "") ||
    aiScene.generatedByAi !== true || aiScene.aiContentLabelRequired !== true ||
    aiScene.interactionReady !== false
  )) throw new Error("World AI: approved server descriptor required");
  const aiJoin = aiScene ? {
    scene: "ai", providerWorldId: aiScene.providerWorldId,
    splatSha256: aiScene.splatSha256, colliderSha256: aiScene.colliderSha256,
  } : {};
  let wanted = false, country = "us", outfit = "violet", sharePhoto = false, membership = null, revision = 0, disposed = false;
  const clear = () => { membership = null; world.setPeers([]); world.stopMoving(); onPeers([]); onInstance?.(null); };
  const state = (value) => { if (!disposed) onState(value); };
  function enter() {
    if (disposed || !wanted || !socket.connected) return;
    const attempt = ++revision;
    clear(); state("connecting");
    socket.timeout(5000).emit("vcr:join", { version: rules.VERSION, country, outfit, sharePhoto, ...aiJoin }, (error, reply) => {
      if (disposed || !wanted || revision !== attempt) return;
      const incorrectScene = aiScene
        ? reply?.scene !== "ai" || reply.providerWorldId !== aiScene.providerWorldId ||
          reply.splatSha256 !== aiScene.splatSha256 || reply.colliderSha256 !== aiScene.colliderSha256
        : reply?.scene === "ai";
      if (error || !reply?.ok || reply.country !== country || incorrectScene) {
        wanted = false;
        if (socket.connected) socket.emit("vcr:leave");
        socket.disconnect(); clear(); state("error"); return;
      }
      // In a generated scene the server-approved ground and boundaries are
      // part of the entry contract. Never claim "online" if the local
      // navigation map cannot accept the server's initial position.
      // Legacy/prototype adapters are unchanged (some return void).
      if (aiScene && world.setPosition(reply.position) !== true) {
        wanted = false;
        if (socket.connected) socket.emit("vcr:leave");
        socket.disconnect(); clear(); state("error"); return;
      }
      membership = reply.membership; onInstance?.(reply.instanceId);
      if (!aiScene) world.setPosition(reply.position);
      state("online");
    });
  }
  function snapshot(payload) {
    if (payload?.membership !== membership || !membership || payload.country !== country || !Array.isArray(payload.peers)) return;
    world.setPeers(payload.peers); onPeers(payload.peers);
  }
  function correction(payload) { if (membership && payload?.membership === membership) world.setPosition(payload.position); }
  function disconnect() { revision += 1; clear(); state(wanted ? "reconnecting" : "solo"); }
  function denied() { wanted = false; revision += 1; if (socket.connected) socket.emit("vcr:leave"); socket.disconnect(); clear(); state("error"); }
  socket.on("connect", enter); socket.on("disconnect", disconnect);
  socket.on("connect_error", denied); socket.on("vcr:closed", denied);
  socket.on("vcr:snapshot", snapshot); socket.on("vcr:correct", correction);
  const timer = setInterval(() => {
    if (!disposed && membership && socket.connected) socket.volatile.emit("vcr:move", {
      membership, position: world.getPosition(), outfit,
    });
  }, 100);
  return {
    join(nextCountry, nextOutfit, consentToSharePublicPhoto = false) {
      if (!Object.hasOwn(rules.DESTINATIONS, nextCountry) || (aiScene && nextCountry !== aiScene.country)) return;
      country = nextCountry; outfit = nextOutfit; sharePhoto = consentToSharePublicPhoto === true; wanted = true; clear(); state("connecting");
      if (socket.connected) enter(); else socket.connect();
    },
    changeCountry(id) {
      if (!Object.hasOwn(rules.DESTINATIONS, id) || (aiScene && id !== aiScene.country)) return;
      revision += 1; clear(); country = id; world.travelCountry(id);
      if (wanted) { if (socket.connected) enter(); else socket.connect(); }
    },
    travel(zone, onArrival) {
      if (aiScene) return;
      if (!membership) { if (world.teleport(zone)) onArrival?.(); return; }
      const active = membership;
      world.stopMoving();
      socket.timeout(5000).emit("vcr:travel", { membership, zone }, (error, reply) => {
        if (!disposed && active === membership && !error && reply?.ok) { world.setPosition(reply.position); onArrival?.(); }
      });
    },
    setOutfit(id) { if (rules.OUTFITS.includes(id)) { outfit = id; world.setOutfit(id); } },
    leave() { wanted = false; revision += 1; socket.emit("vcr:leave"); clear(); state("solo"); },
    close() {
      if (disposed) return;
      disposed = true; wanted = false; revision += 1; clearInterval(timer); socket.emit("vcr:leave");
      socket.off("connect", enter); socket.off("disconnect", disconnect); socket.off("connect_error", denied);
      socket.off("vcr:closed", denied); socket.off("vcr:snapshot", snapshot); socket.off("vcr:correct", correction);
      clear(); socket.disconnect();
    },
  };
}
