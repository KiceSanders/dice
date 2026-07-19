# 006. Device-recorded special-moment audio with ephemeral room sharing

**Status:** accepted  
**Date:** 2026-07-19

## Context

A player's custom celebration must survive later visits and username changes on the same browser,
but every current room participant must hear the triggering player's clip. Audio blobs do not
belong in authoritative snapshots or crash-recovery logs, and browser-specific MediaRecorder
containers are not reliably decodable by every other browser.

## Decision

- `SPECIAL_MOMENT_DEFINITIONS` is the exhaustive shared registry. Home and Room map it directly;
  adding a definition creates both recorder rows automatically. The authoritative engine emits
  `specialMomentHit` after the outcome barrier. Ordinary wins and Classic donations are excluded;
  a winner after any tie-breaker is the `overtime-win` moment.
- Capture is canonical mono 22.05 kHz, 16-bit PCM WAV, capped at three seconds. Clips live in
  `localStorage['dice:special-moment-sounds:v1']`, outside username/rejoin identity.
- On join and edit, clients send individual `special-sound:update` messages. The server validates
  WAV shape/size, rate-limits updates, and holds a bounded memory-only room profile for late
  joiners. It never writes recordings or `special-moment:hit` to the room log.
- `TableAudio` plays the triggering player's clip for every renderer/view. The Web Audio graph has
  separate Effects and Player recordings gain buses beneath one global mute. A custom Straight
  clip replaces the built-in bell; general dice/chip sounds remain.

## Consequences

- Disconnect clears the player's live room copies and reconnect republishes the local pack; a
  server restart loses only the ephemeral shared copies, not device recordings. A different device
  has no pack unless the player records there.
- The WebSocket frame cap rises from 64 KiB to 192 KiB so one bounded base64 WAV plus JSON fits.
  Per-message validation, a per-connection update budget, and a per-room cache ceiling bound the
  extra memory/bandwidth.
- Every listener retains control through global mute and the recordings slider. Browser autoplay
  rules still drop sounds until that tab receives a user gesture.
