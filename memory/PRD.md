# MissiAI - PRD & Architecture

## Original Problem Statement
Decompose monolithic `app/chat/page.tsx` (670 lines) into clean, focused components with proper state colocation and memoization.

## Architecture
- **Framework**: Next.js 16 with App Router
- **Auth**: Clerk
- **3D**: Three.js (WebGL particle visualizer)
- **Styling**: Tailwind CSS + inline styles
- **Voice**: Custom voice state machine hook (STT/TTS/chat streaming)

## What's Been Implemented (2026-03-30)

### Component Decomposition
| File | Lines | Purpose |
|------|-------|---------|
| `types/chat.ts` | 24 | Shared types: VoiceState, ConversationEntry, PersonalityKey, PERSONALITY_OPTIONS |
| `components/chat/VoiceButton.tsx` | 76 | Memo-wrapped state indicator button (idle/recording/thinking/transcribing/speaking) |
| `components/chat/StatusDisplay.tsx` | 140 | Memo-wrapped status text, streaming text, error display |
| `components/chat/SettingsPanel.tsx` | 154 | Memo-wrapped settings panel with personality selector, voice toggle, logout |
| `components/chat/ConversationLog.tsx` | 103 | Memo-wrapped (custom comparator) conversation history, virtualizes at 20+ msgs |
| `components/chat/ParticleVisualizer.tsx` | 280 | Memo-wrapped Three.js visualizer with quality scaling + visibility API |
| `app/chat/page.tsx` | 111 | Orchestrator only (down from 670 lines) |

### Key Improvements
- Page reduced from 670 to 111 lines (83% reduction)
- All components wrapped in React.memo() for re-render prevention
- ConversationLog uses custom comparator (only re-renders on length/visibility change)
- ParticleVisualizer has dynamic quality scaling (LOW: 300 particles, HIGH: 1000)
- ParticleVisualizer pauses render loop when tab is hidden (Visibility API)
- Types centralized in `types/chat.ts`, imported everywhere
- Hook updated to import from types/chat.ts (no inline type defs)
- CSS animations moved from inline styled-jsx to globals.css

## Prioritized Backlog
- **P0**: None
- **P1**: Wire ConversationLog to live conversation data (currently isVisible=false)
- **P2**: Add hold-to-talk mode via VoiceButton onPointerDown/onPointerUp
- **P2**: Add unit tests for individual components
