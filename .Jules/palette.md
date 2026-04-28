## 2024-04-17 - Add ARIA labels to audio player controls
**Learning:** The audio player controls in the `SleepSessions` component use icon-only buttons (Play, Pause, Skip, X) that lack accessible names, making them invisible to screen readers. Adding `aria-label` attributes ensures keyboard and screen reader users can navigate and understand the audio playback controls.
**Action:** Next time I encounter icon-only action buttons or playback controls, I will ensure they have descriptive `aria-label`s.

## 2026-04-28 - Add ARIA labels to dismiss buttons
**Learning:** Dismiss buttons with just an <X> icon in ChatPageShell and StatusDisplay lacked aria-labels, making them inaccessible to screen readers.
**Action:** When I encounter generic icon buttons for actions like closing, dismissing or clearing, always add appropriate aria-labels to provide context.
