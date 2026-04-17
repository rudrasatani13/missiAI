## 2026-04-17 - [Added ARIA Labels to Icon-Only Buttons]
**Learning:** Found several icon-only buttons in the Wind-Down (SleepSessions) and Memory (MemorySearch) sections that lacked screen reader support. Small touches like 'aria-label' improve accessibility by providing context to non-visual users, especially for media controls (Play/Pause/Skip) and form controls (Clear Search).
**Action:** Always ensure that buttons without visible text include an appropriate `aria-label` attribute describing their action.
