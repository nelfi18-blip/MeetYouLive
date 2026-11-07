import assert from "node:assert/strict";
// Uses actual HTMLAudioElement PCM playback behind remote-track API doubles.
// These observations do not represent Agora codec/network or Android hardware.
export async function checkLiveAudioPlayback(browser,address,dictionary) {
  const observations=[];
  const open=async(platform="android")=>{
    const page=await browser.newPage();page.on("pageerror",error=>{throw error;});
    await page.goto(address+"/?platform="+platform);await page.waitForFunction(()=>window.fixture);
    return page;
  };
  const silent=async(page,id)=>{
    await page.waitForFunction(key=>window.fixtureAudioState(key).every(track=>!track.audible),id);
    const tracks=await page.evaluate(key=>window.fixtureAudioState(key),id);
    assert.ok(tracks.length>=2);assert.ok(tracks.every(track=>track.volume===0));return tracks;
  };
  for(const role of ["viewer","host","guest"]) {
    const page=await open(),id="audio-"+role;
    await page.evaluate(({role,id})=>{window.fixtureRole=role;window.fixtureHold=true;window.fixture.navigate('/live/'+id);},{role,id});
    await page.waitForFunction(()=>window.fixtureAcknowledge);
    assert.equal(await page.getByTestId("room").count(),0);
    assert.deepEqual(await page.evaluate(()=>window.fixtureMediaMounts),[]);
    await page.evaluate(()=>{window.fixtureHold=false;window.fixtureAcknowledge();});
    await page.getByTestId("room").waitFor();
    await page.waitForFunction(key=>window.fixtureAudioState(key).length===2&&window.fixtureAudioState(key).every(track=>track.audible),id);
    await page.evaluate(({role,id})=>window.fixture.openSession({liveId:id,isHost:role==='host',creatorName:'Synthetic'}),{role,id});
    const stopsBefore=await page.evaluate(()=>window.fixturePlayback.filter(event=>event.kind==='stop').length);
    const enablesBefore=await page.evaluate(()=>window.fixtureCalls.filter(Boolean).length);
    await page.evaluate(key=>{window.fixture.minimizeSession(key);window.fixture.navigate('/feed');},id);
    await page.getByRole("dialog").waitFor();
    assert.ok((await page.evaluate(key=>window.fixtureAudioState(key),id)).every(track=>track.audible));
    await page.evaluate(()=>window.fixture.restoreSession());await page.getByTestId("room").waitFor();
    assert.ok((await page.evaluate(key=>window.fixtureAudioState(key),id)).every(track=>track.audible));
    assert.equal(await page.evaluate(()=>window.fixturePlayback.filter(event=>event.kind==='stop').length),stopsBefore);
    assert.equal(await page.evaluate(()=>window.fixtureCalls.filter(Boolean).length),enablesBefore);
    assert.equal(await page.evaluate(key=>window.fixtureSessions.get(key).localAudioTrack.microphoneActive,id),true);
    await page.evaluate(key=>{window.fixture.minimizeSession(key);window.fixture.navigate('/feed');},id);await page.getByRole("dialog").waitFor();
    if(role!=="host") {
      await page.getByRole("button",{name:dictionary.miniPlayer.mute,exact:true}).click();await silent(page,id);
      await page.getByRole("button",{name:dictionary.miniPlayer.unmute,exact:true}).click();
      await page.waitForFunction(key=>window.fixtureAudioState(key).every(track=>track.audible),id);
    }
    await page.evaluate(()=>window.fixture.navigate('/login'));const tracks=await silent(page,id);
    observations.push({role,pendingMounts:0,continuousRoomMiniRestore:true,localMicrophoneUntouched:true,hiddenLogin:tracks});
    await page.close();
  }
  for(const failure of ["rejected","old-app","missing-plugin","timeout"]) for(const role of ["viewer","host","guest"]) {
    const page=await open(),id="blocked-"+failure+"-"+role;
    if(failure==="timeout")await page.clock.install();
    await page.evaluate(({failure,id})=>{
      window.fixtureFail=failure==='rejected';window.fixtureLegacy=failure==='old-app';window.fixtureMissing=failure==='missing-plugin';window.fixtureHold=failure==='timeout';
      window.fixture.navigate('/live/'+id);
    },{failure,id});
    if(failure==="timeout") {
      await page.waitForFunction(()=>window.fixtureAcknowledge);
      for(let i=0;i<4;i++){await page.clock.fastForward(8100);await page.evaluate(()=>Promise.resolve());}
    }
    await page.getByRole("alert").waitFor();assert.equal(await page.getByTestId("room").count(),0);
    assert.deepEqual(await page.evaluate(()=>window.fixtureMediaMounts),[]);
    await page.evaluate(async ({key,role})=>{
      const session=window.fixtureMakeSession(key,role);
      await Promise.all(session.client.remoteUsers.map(user=>user.audioTrack.play()));
      window.fixture.openSession({liveId:key,isHost:role==='host'});
    },{key:id,role});
    // Even a suspended session waiting for full-room restoration must be silent.
    await silent(page,id);
    await page.evaluate(key=>{window.fixture.minimizeSession(key);window.fixture.navigate('/feed');},id);
    const tracks=await silent(page,id);
    await page.evaluate(async key=>{
      const session=window.fixtureSessions.get(key),audioTrack=window.fixtureMakeTrack(key+':reconnected');
      session.client.remoteUsers.push({audioTrack});session.client.emit('connection-state-change');await audioTrack.play();
    },id);
    assert.ok((await page.evaluate(key=>window.fixtureAudioState(key),id)).every(track=>!track.audible));
    if(failure==="rejected") {
      await page.evaluate(()=>{window.fixtureFail=false;});
      await page.getByRole("button",{name:dictionary.screenCaptureProtection.retry,exact:true}).click();
      await page.getByRole("dialog").waitFor();
      await page.waitForFunction(key=>window.fixtureAudioState(key).every(track=>track.audible),id);
    }
    observations.push({failure,role,noRoomPlaybackStarted:true,blockedMini:tracks,reconnectedTrackSilent:true});await page.close();
  }
  for(const platform of ["web","ios"]) {
    const page=await open(platform),id="audio-"+platform;
    await page.evaluate(key=>{window.fixtureFail=true;window.fixtureLegacy=true;window.fixture.navigate('/live/'+key);},id);
    await page.getByTestId("room").waitFor();await page.waitForFunction(key=>window.fixtureAudioState(key).every(track=>track.audible),id);
    assert.deepEqual(await page.evaluate(()=>window.fixtureCalls),[]);observations.push({platform,playbackUnchanged:true});await page.close();
  }
  return {scope:"HTML PCM audio + actual React/mini; remote-track API doubles, no Agora or device audio capture",observations};
}
