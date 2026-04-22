## 2024-04-17 - Add ARIA labels to audio player controls
**Learning:** The audio player controls in the `SleepSessions` component use icon-only buttons (Play, Pause, Skip, X) that lack accessible names, making them invisible to screen readers. Adding `aria-label` attributes ensures keyboard and screen reader users can navigate and understand the audio playback controls.
**Action:** Next time I encounter icon-only action buttons or playback controls, I will ensure they have descriptive `aria-label`s.
## 2024-04-22 - Missing ARIA Labels on Navigation/Filter Controls
**Learning:** Found an icon-only `<X />` button in `TimelineView` that functioned as an active filter clearing mechanism but lacked an `aria-label`, representing an invisible but critical interaction control for screen reader users.
**Action:** When auditing custom filter or dynamic navigation components, explicitly verify all interactive 'close', 'clear', or 'dismiss' buttons possess proper semantic context for assistive technologies.
