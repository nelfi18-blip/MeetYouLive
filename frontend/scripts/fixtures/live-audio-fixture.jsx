// Test-only synthetic PCM playback. No RTC connection, device microphone or API.
import { useEffect } from "react";
export function initializeAudioFixture() {
  const bytes=new Uint8Array(44+1600),view=new DataView(bytes.buffer);
  const text=(offset,value)=>[...value].forEach((c,i)=>{bytes[offset+i]=c.charCodeAt(0);});
  text(0,"RIFF");view.setUint32(4,bytes.length-8,true);text(8,"WAVEfmt ");view.setUint32(16,16,true);
  view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,8000,true);view.setUint32(28,16000,true);
  view.setUint16(32,2,true);view.setUint16(34,16,true);text(36,"data");view.setUint32(40,1600,true);
  for(let i=0;i<800;i++)view.setInt16(44+i*2,Math.sin(i*2*Math.PI*440/8000)*100,true);
  const uri="data:audio/wav;base64,"+btoa(String.fromCharCode(...bytes));
  window.fixtureSessions=new Map();window.fixtureMediaMounts=[];window.fixturePlayback=[];
  window.fixtureMakeTrack=label=>{
    const audio=new Audio(uri);audio.loop=true;
    return {audio,setVolume(volume){audio.volume=volume/100;window.fixturePlayback.push({kind:"volume",label,volume});},
      play(){window.fixturePlayback.push({kind:"play",label});return audio.play();},
      stop(){window.fixturePlayback.push({kind:"stop",label});audio.pause();}};
  };
  window.fixtureMakeSession=(id,role=window.fixtureRole||"viewer")=>{
    if(window.fixtureSessions.has(id))return window.fixtureSessions.get(id);
    const listeners=new Map(),remoteUsers=[{audioTrack:window.fixtureMakeTrack(id+":one")},{audioTrack:window.fixtureMakeTrack(id+":two")}];
    const client={remoteUsers,on(event,listener){if(!listeners.has(event))listeners.set(event,new Set());listeners.get(event).add(listener);},
      off(event,listener){listeners.get(event)?.delete(listener);},emit(event){for(const listener of listeners.get(event)||[])listener();}};
    const session={client,isHost:role==="host",isPublisher:role!=="viewer",localAudioTrack:{microphoneActive:true},localVideoTrack:null};
    window.fixtureSessions.set(id,session);return session;
  };
  window.fixtureDropSession=id=>{
    for(const user of window.fixtureSessions.get(id)?.client.remoteUsers||[])user.audioTrack.stop();
    window.fixtureSessions.delete(id);
  };
  window.fixtureAudioState=id=>(window.fixtureSessions.get(id)?.client.remoteUsers||[]).map(user=>({
    paused:user.audioTrack.audio.paused,volume:user.audioTrack.audio.volume,
    audible:!user.audioTrack.audio.paused&&!user.audioTrack.audio.muted&&user.audioTrack.audio.volume>0,
  }));
}
export function FixtureRoomMedia({ id }) {
  const liveId=id.split("/").at(-1);
  useEffect(()=>{
    window.fixtureMediaMounts.push(liveId);
    const session=window.fixtureMakeSession(liveId);
    for(const user of session.client.remoteUsers)if(user.audioTrack.audio.paused)user.audioTrack.play().catch(()=>{});
    return ()=>{
      // Model existing continuity: route unmount does not end an active session.
      if(window.fixtureActiveLiveId!==liveId)window.fixtureDropSession(liveId);
    };
  },[liveId]);
  return <div data-testid="room">Synthetic Live frame and PCM audio</div>;
}
