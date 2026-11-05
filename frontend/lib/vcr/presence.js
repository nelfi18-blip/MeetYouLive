import rules from "../../../backend/src/lib/vcrWorldRules.cjs";

// Only the VCR namespace is owned here. Leaving never disconnects Live/Chat.
export function createVcrPresence({ socket, world, onState, onPeers, onInstance }) {
  let wanted = false, country = "us", outfit = "violet", membership = null, revision = 0, disposed = false;
  const clear = () => { membership = null; world.setPeers([]); world.stopMoving(); onPeers([]); onInstance?.(null); };
  const state = (value) => { if (!disposed) onState(value); };
  function enter() {
    if (disposed || !wanted || !socket.connected) return;
    const attempt = ++revision;
    clear(); state("connecting");
    socket.timeout(5000).emit("vcr:join", { version: rules.VERSION, country, outfit }, (error, reply) => {
      if (disposed || !wanted || revision !== attempt) return;
      if (error || !reply?.ok || reply.country !== country) { wanted = false; if (socket.connected) socket.emit("vcr:leave"); socket.disconnect(); clear(); state("error"); return; }
      membership = reply.membership; onInstance?.(reply.instanceId); world.setPosition(reply.position); state("online");
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
    join(nextCountry, nextOutfit) {
      if (!Object.hasOwn(rules.DESTINATIONS, nextCountry)) return;
      country = nextCountry; outfit = nextOutfit; wanted = true; clear(); state("connecting");
      if (socket.connected) enter(); else socket.connect();
    },
    changeCountry(id) {
      if (!Object.hasOwn(rules.DESTINATIONS, id)) return;
      revision += 1; clear(); country = id; world.travelCountry(id);
      if (wanted) { if (socket.connected) enter(); else socket.connect(); }
    },
    travel(zone, onArrival) {
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
