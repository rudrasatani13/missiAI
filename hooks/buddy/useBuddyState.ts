import { create } from 'zustand';
import type { EmotionState } from '@/types/emotion';

 let dizzyTimeout: ReturnType<typeof setTimeout> | null = null;
 let petTimeout: ReturnType<typeof setTimeout> | null = null;
 let annoyedTimeout: ReturnType<typeof setTimeout> | null = null;

export type BuddyState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'celebrating' | 'sleeping' | 'error';

interface BuddyStore {
  currentState: BuddyState;
  isExpanded: boolean;
  message: string | null;
  position: { x: number; y: number };
  audioLevel: number;
  isDizzy: boolean;
  dizzyLevel: number;
  isPetted: boolean;
  petLevel: number;
  isAnnoyed: boolean;
  annoyedLevel: number;
  emotionState: EmotionState | null;
  emotionLevel: number;
  
  // Actions
  setState: (state: BuddyState, message?: string | null) => void;
  setExpanded: (expanded: boolean) => void;
  setPosition: (x: number, y: number) => void;
  setAudioLevel: (level: number) => void;
  setEmotionReaction: (emotion: EmotionState | null, intensity?: number) => void;
  triggerDizzy: (intensity?: number, durationMs?: number) => void;
  triggerPet: (intensity?: number, durationMs?: number) => void;
  triggerAnnoyed: (intensity?: number, durationMs?: number) => void;
  clearMessage: () => void;
  
  // High-level triggers
  celebrate: (message?: string, durationMs?: number) => void;
  sayError: (message: string, durationMs?: number) => void;
}

export const useBuddyState = create<BuddyStore>((set) => ({
  currentState: 'idle',
  isExpanded: false,
  message: null,
  position: { x: 24, y: 24 }, // Default bottom-right offset
  audioLevel: 0,
  isDizzy: false,
  dizzyLevel: 0,
  isPetted: false,
  petLevel: 0,
  isAnnoyed: false,
  annoyedLevel: 0,
  emotionState: null,
  emotionLevel: 0,

  setState: (state, message = null) => set({ currentState: state, message }),
  setExpanded: (expanded) => set({ isExpanded: expanded }),
  setPosition: (x, y) => set({ position: { x, y } }),
  setAudioLevel: (level) => set({ audioLevel: level }),
  setEmotionReaction: (emotion, intensity = 0.65) => set({
    emotionState: emotion,
    emotionLevel: emotion ? Math.max(0.25, Math.min(1, intensity)) : 0,
  }),
  triggerDizzy: (intensity = 0.65, durationMs = 1500) => {
    const dizzyLevel = Math.max(0.35, Math.min(1, intensity));
    if (dizzyTimeout) clearTimeout(dizzyTimeout);
    set({ isDizzy: true, dizzyLevel });
    dizzyTimeout = setTimeout(() => {
      set((state) => (state.isDizzy ? { isDizzy: false, dizzyLevel: 0 } : state));
    }, durationMs);
  },
  triggerPet: (intensity = 0.75, durationMs = 1200) => {
    const petLevel = Math.max(0.4, Math.min(1, intensity));
    if (petTimeout) clearTimeout(petTimeout);
    set({ isPetted: true, petLevel });
    petTimeout = setTimeout(() => {
      set((state) => (state.isPetted ? { isPetted: false, petLevel: 0 } : state));
    }, durationMs);
  },
  triggerAnnoyed: (intensity = 0.6, durationMs = 1450) => {
    const annoyedLevel = Math.max(0.35, Math.min(1, intensity));
    if (annoyedTimeout) clearTimeout(annoyedTimeout);
    set({ isAnnoyed: true, annoyedLevel });
    annoyedTimeout = setTimeout(() => {
      set((state) => (state.isAnnoyed ? { isAnnoyed: false, annoyedLevel: 0 } : state));
    }, durationMs);
  },
  clearMessage: () => set({ message: null }),

  celebrate: (message, durationMs = 3000) => {
    set({ currentState: 'celebrating', message: message || null });
    setTimeout(() => {
      set((state) => (state.currentState === 'celebrating' ? { currentState: 'idle', message: null } : state));
    }, durationMs);
  },

  sayError: (message, durationMs = 4000) => {
    set({ currentState: 'error', message });
    setTimeout(() => {
      set((state) => (state.currentState === 'error' ? { currentState: 'idle', message: null } : state));
    }, durationMs);
  }
}));
