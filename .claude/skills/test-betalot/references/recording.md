# Record a real Chrome game window

The included macOS 15+ recorder uses ScreenCaptureKit and H.264 MP4, at up to 30 fps.
It captures one selected Chrome game window, with cursor and without audio/microphone.
It never captures the full desktop. This is continuous native video, independent of
how often the model requests screenshots. Source: `scripts/record-game-window.swift`.

## Use the wrapper (rebuilds stale binaries)

From the repository root:

```bash
bash scripts/record-game-window.sh --list
```

The wrapper recompiles only when necessary. Requires installed Xcode Command
Line Tools. Do not silently install tools or substitute another recording method if
this fails; explain the actual missing prerequisite. In Codex's restricted shell, run
the recorder with `sandbox_permissions: "require_escalated"`: WindowServer access is
not available inside the filesystem/process sandbox. The existing user request to
record is authorization; use the tool's approval handling without asking again. An
in-sandbox failed preflight does not mean the user needs to change macOS permissions.

## Select and capture

1. Open the actor fixture link through `mcp__cua_repl` in Chrome. Use a named test session
   and its test window. Chrome may create the test tab in an existing window without
   selecting it. Use Chrome's native UI to right-click the **test tab group**, then
   **Move Group to New Window**. This preserves the game connection and isolates the
   recording from the user's other tabs. Do not move the group's last individual tab;
   Chrome can prompt to delete the saved group. Cancel that prompt and move the group.
   Do not put private pages beside the game. The native recorder
   needs an on-screen Chrome window; a hidden in-app tab is not a recording target.
2. After the room appears, list recordable windows:

   ```bash
   bash scripts/record-game-window.sh --list
   ```

   Select the `windowId` whose title contains the **exact current fixture room code**.
   Never choose a production room or guess an ID. If no matching window appears,
   select the test tab through computer use and list once more. Save this actor window
   ID before opening the opponent so identical room titles cannot cause confusion.
   Moving/full-screening a window can change its ID: list again after moving it. Do not
   close/reload players to disambiguate windows; Blackjack disconnects forfeit the hand.
3. Before performing the game action, run a **three-second probe** against that window:

   ```bash
   bash scripts/record-game-window.sh WINDOW_ID 3 artifacts/betalot/RUN_NAME/probe.mp4
   ```

   Require exit zero, positive video duration and one inspected review frame showing
   the correct game **without native dialogs covering it**. A browser-tab screenshot
   does not show Chrome's native sheets; inspect the recorded probe frame itself.
   Permission preflight, `--list`, and compilation alone do not test
   recording. A failed probe must be resolved before spending tokens on gameplay.
   Then open the opponent link and keep both test players connected.
4. Start a bounded capture, keeping its execution session handle:

   ```bash
   bash scripts/record-game-window.sh WINDOW_ID 35 artifacts/betalot/RUN_NAME/review.mp4
   ```

   Request an early tool yield (about 1000 ms). Wait for `RECORDING` before the UI
   action. The command remains running while you click **Test roll** through
   `mcp__cua_repl` (or drag the cup when that gesture is the subject of the test). It
   stops automatically and finalizes the MP4 after the duration. Use 20–40 seconds
   normally, or up to 120 seconds for an explicitly longer case. Do not interrupt it
   with Ctrl-C: let it finalize. Do not switch this window to another site while
   recording. If another viewpoint must be in the video, select that fixture's tab
   in the same window; otherwise its screenshot/result can be checked after recording.
5. Await completion in short polls. It must exit successfully and report a positive
   duration, video dimensions, frame rate and five saved PNG review frames. Open two
   or more frames (including the action/result when available) with `view_image`.
   A playable file does not establish that the action was captured. If all frames
   missed a brief feature, play the MP4 in the app and inspect it or record one retry.

To inspect an existing clip again:

```bash
bash scripts/record-game-window.sh --inspect artifacts/betalot/RUN_NAME/review.mp4
```

Output paths in the final answer must be absolute. The recorder refuses to overwrite
an existing MP4; use a fresh run directory for another attempt.

## Permission / capability limits

The original helper crashed with `CGS_REQUIRE_INIT / did_initialize` while constructing
`SCContentFilter`, despite successful permissions and window enumeration. The corrected
helper initializes `NSApplication.shared` before any async suspension and keeps capture
setup on the main actor. This creates the WindowServer connection required by the filter
([Apple documentation](https://developer.apple.com/documentation/appkit/nsapplication/shared)).
Its delegate state is also dispatched onto the main actor. Do not interpret that assertion
as a privacy denial or send the user to Settings; rebuild through the wrapper and probe.

The recorder checks existing Screen Recording permission without opening a permission
prompt. If macOS denies access, ask the user to enable Screen Recording for the launching
app/process in **System Settings → Privacy & Security → Screen & System Audio Recording**.
Do not change privacy settings automatically. After permission is granted, retry once;
the launching app may need to restart. Without permission, deliver the completed skill
and truthful status; no video has been recorded.

Clips are silent. They cannot validate game audio. If the user requests an audio test,
explain this limitation before choosing an explicitly authorized audio-capable recorder.
