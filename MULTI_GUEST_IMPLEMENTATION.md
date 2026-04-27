# Multi-Guest Live Streaming Feature - Implementation Guide

## Overview

This feature implements Tango/Bigo-style simultaneous multi-guest video streaming in MeetYouLive live rooms. Multiple users can stream video together in a single live room with smooth transitions and mobile-responsive layouts.

## Architecture

### Backend Components

#### 1. Database Model (`backend/src/models/Live.js`)
```javascript
// New fields added to Live schema:
{
  guests: [{
    userId: ObjectId,
    joinedAt: Date,
    status: 'active' | 'disconnected'
  }],
  guestRequests: [{
    userId: ObjectId,
    requestedAt: Date,
    status: 'pending' | 'approved' | 'declined'
  }],
  maxGuests: Number  // default: 3, max: 10
}
```

#### 2. API Endpoints (`backend/src/routes/live.routes.js`)
- `POST /api/lives/:id/request-join` - Viewer requests to join as guest
- `POST /api/lives/:id/approve-guest` - Host approves a guest request
- `POST /api/lives/:id/decline-guest` - Host declines a guest request
- `DELETE /api/lives/:id/leave-guest` - Guest leaves the stream
- `DELETE /api/lives/:id/remove-guest/:userId` - Host removes a guest
- `GET /api/lives/:id/guests` - Get current guests and requests

#### 3. Socket Events (`backend/src/lib/socket.js`)
**Emitted by backend:**
- `GUEST_JOINED` - Broadcast when a guest joins (shows to all viewers)
- `GUEST_LEFT` - Broadcast when a guest leaves (shows to all viewers)
- `GUEST_REQUEST_RECEIVED` - Sent to host when someone requests to join
- `GUEST_APPROVED` - Sent to guest when request is approved
- `GUEST_DECLINED` - Sent to guest when request is declined
- `GUEST_REMOVED` - Sent to guest when host removes them

#### 4. Agora Integration (`backend/src/controllers/agora.controller.js`)
- Updated token generation to recognize approved guests
- Guests receive `PUBLISHER` role (same as host)
- Viewers receive `SUBSCRIBER` role (audience)

### Frontend Components

#### 1. MultiVideoGrid Component (`frontend/components/MultiVideoGrid.jsx`)
Responsive video grid that adapts to participant count:
- **1 participant** - Full screen (host only)
- **2 participants** - Split view (host + 1 guest)
- **3 participants** - 2x2 grid with one empty slot
- **4 participants** - Full 2x2 grid (host + 3 guests)

Features:
- Smooth CSS transitions when guests join/leave
- Fade in/out animations (300ms)
- Host tile highlighted with accent border
- Participant badges showing names and host icon
- Loading states for camera initialization
- Mobile-responsive (stacks vertically on small screens)

#### 2. GuestControlsPanel Component (`frontend/components/GuestControlsPanel.jsx`)
Different views for different roles:

**Host view:**
- Shows pending guest requests with approve/decline buttons
- Shows current guests with remove buttons
- Guest counter (X/3 active guests)
- Empty state when no guests/requests

**Viewer view:**
- "Solicitar unirse" button to request joining
- Status indicators (pending/declined/full)
- Request status messages

**Guest view:**
- "Salir como invitado" button
- Status card showing they're streaming

#### 3. Custom Hooks

**useMultiGuestLive** (`frontend/lib/useMultiGuestLive.js`)
- Fetches guests and requests from API
- Provides functions for all guest management actions
- Listens to socket events for real-time updates
- Manages local state (isGuest, hasRequestedJoin, etc.)

**useAgoraMultiGuest** (`frontend/lib/useAgoraMultiGuest.js`)
- Creates Agora client (once)
- Handles multiple remote users (Map-based tracking)
- Subscribes to new publishers automatically
- Unsubscribes safely when users leave
- Publishes local tracks (host/guest)
- Cleans up on unmount
- Error handling for camera/mic permissions

## Usage Example

```jsx
import { useState } from "react";
import MultiVideoGrid from "@/components/MultiVideoGrid";
import GuestControlsPanel from "@/components/GuestControlsPanel";
import useMultiGuestLive from "@/lib/useMultiGuestLive";
import useAgoraMultiGuest from "@/lib/useAgoraMultiGuest";

export default function LiveRoomPage() {
  const liveId = "...";
  const token = "...";
  const currentUserId = "...";
  const isHost = true; // or false for viewers

  // Guest management
  const {
    guests,
    guestRequests,
    isGuest,
    hasRequestedJoin,
    requestStatus,
    requestJoin,
    approveGuest,
    declineGuest,
    removeGuest,
    leaveAsGuest,
  } = useMultiGuestLive(liveId, token, currentUserId, isHost, socket);

  // Agora multi-publisher streaming
  const {
    agoraJoined,
    agoraError,
    remoteUsers,
    localVideoContainerRef,
  } = useAgoraMultiGuest(liveId, token, isHost || isGuest);

  // Build participants array for MultiVideoGrid
  const participants = [];
  
  // Add local participant (host or guest)
  if (isHost || isGuest) {
    participants.push({
      uid: "local",
      isLocal: true,
      isHost: isHost,
      username: currentUsername,
      userId: currentUserId,
    });
  }

  // Add remote participants
  remoteUsers.forEach((remoteUser) => {
    participants.push({
      uid: remoteUser.uid,
      isRemote: true,
      videoTrack: remoteUser.videoTrack,
      audioTrack: remoteUser.audioTrack,
      hasVideo: remoteUser.hasVideo,
      hasAudio: remoteUser.hasAudio,
      // Map uid to user info from guests array
      ...findUserInfoByUid(remoteUser.uid, guests),
    });
  });

  return (
    <div className="live-room">
      {/* Video grid */}
      <MultiVideoGrid
        participants={participants}
        isHost={isHost}
        localVideoRef={localVideoContainerRef}
        hostUserId={live?.user?._id}
      />

      {/* Guest controls */}
      <GuestControlsPanel
        isHost={isHost}
        isGuest={isGuest}
        guestRequests={guestRequests}
        currentGuests={guests}
        hasRequestedJoin={hasRequestedJoin}
        requestStatus={requestStatus}
        onRequestJoin={requestJoin}
        onApproveGuest={approveGuest}
        onDeclineGuest={declineGuest}
        onRemoveGuest={removeGuest}
        onLeaveAsGuest={leaveAsGuest}
        maxGuests={live?.maxGuests || 3}
      />
    </div>
  );
}
```

## Integration Checklist

To integrate this feature into the existing live room page:

1. **Import components and hooks**
   ```jsx
   import MultiVideoGrid from "@/components/MultiVideoGrid";
   import GuestControlsPanel from "@/components/GuestControlsPanel";
   import useMultiGuestLive from "@/lib/useMultiGuestLive";
   import useAgoraMultiGuest from "@/lib/useAgoraMultiGuest";
   ```

2. **Replace Agora useEffect**
   - Remove existing Agora client creation logic
   - Replace with `useAgoraMultiGuest` hook
   - Update isPublisher logic: `isHost || isGuest`

3. **Add guest management hook**
   ```jsx
   const guestState = useMultiGuestLive(id, token, currentUserId, isCreator, socket);
   ```

4. **Build participants array**
   - Combine local participant (if host/guest)
   - Add all remote users from Agora
   - Map Agora UIDs to user info from guests array

5. **Replace video container**
   - Remove single video div
   - Add `<MultiVideoGrid participants={participants} ... />`

6. **Add guest controls UI**
   - Add `<GuestControlsPanel {...guestState} ... />`
   - Position in sidebar or below video

7. **Test features**
   - Test host can approve/decline requests
   - Test guest can join and leave
   - Test viewer can request to join
   - Verify gifts, chat, ranking still work
   - Test mobile responsive layouts

## Security Considerations

- Guest approval is server-side (host must approve)
- Agora tokens verify guest status in database
- Only approved guests can publish (enforced by Agora role)
- Rate limiting on all endpoints (100 requests per 15 min)
- Socket events verified against database state

## Performance

- Agora client created once per session
- Remote user Map for O(1) lookups
- Socket events debounced on backend
- Smooth 300ms transitions (GPU-accelerated)
- Lazy loading of Agora SDK (dynamic import)

## Backward Compatibility

- Old single-host streams still work (0 guests = single video)
- Existing features unchanged (gifts, chat, ranking, payouts)
- Gradual rollout: can enable/disable per live room
- Fallback: if multi-guest fails, single-host mode works

## Testing

Manual testing required:
1. Start live as host → should see single video
2. Request join as viewer → host sees request
3. Host approves → guest video appears in grid
4. Send gift → gift animation shows for all
5. Guest leaves → video grid transitions smoothly
6. Host removes guest → guest gets notification
7. Test on mobile → grid stacks vertically

## Future Enhancements

- Invite specific users (not just accept requests)
- Screen sharing for guests
- Picture-in-picture mode
- Guest audio levels indicator
- Network quality indicators per participant
- Guest spotlight/focus mode
- Recording with multiple participants

## Troubleshooting

**Guest video not showing:**
- Check guest is approved in database
- Verify Agora token has PUBLISHER role
- Check browser camera/mic permissions
- Look for errors in Agora console

**Socket events not working:**
- Verify socket connected (`socket.connected`)
- Check event names match exactly
- Ensure socket joined live room first
- Check backend logs for emissions

**Grid layout broken:**
- Check CSS variables defined
- Verify participant count correct
- Test grid classes (grid-1, grid-2, etc.)
- Check for CSS conflicts

**Memory leaks:**
- Ensure cleanup functions run on unmount
- Check Agora tracks closed properly
- Verify socket listeners removed
- Monitor remoteUsers Map size
