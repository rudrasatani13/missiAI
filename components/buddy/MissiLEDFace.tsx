import { useEffect, useRef, useState } from 'react';
import { motion, Variants } from 'framer-motion';
import { BuddyState, useBuddyState } from '@/hooks/buddy/useBuddyState';
import type { EmotionState } from '@/types/emotion';
import { cn } from '@/lib/ui/utils';

type MissiLEDFaceProps = {
  className?: string;
  gazeOffset?: { x: number; y: number };
  isHovered?: boolean;
  tilt?: number;
  ambientCue?: AmbientCueState;
  ambientCueLevel?: number;
};

const STATE_COLORS: Record<BuddyState, string> = {
  idle: "#06b6d4", // Cyan
  listening: "#3b82f6", // Blue
  thinking: "#a855f7", // Purple
  speaking: "#ec4899", // Pink
  celebrating: "#10b981", // Emerald
  sleeping: "#64748b", // Slate
  error: "#ef4444" // Red
};

type EmotionFaceState = 'cheery' | 'amped' | 'tense' | 'worn' | 'bashful';
type AmbientCueState = 'none' | 'curious' | 'invite';
type AmbientFaceState = Exclude<AmbientCueState, 'none'>;
type WinkSide = 'left' | 'right';
type BlinkPattern = 'none' | 'soft' | 'double';
type BlinkLead = 'left' | 'right';
type FaceState = BuddyState | 'dizzy' | 'petting' | 'blushing' | 'surprised' | 'bored' | 'annoyed' | 'sleepy' | 'mischief' | 'waking' | EmotionFaceState | AmbientFaceState;

const EMOTION_COLORS: Record<EmotionFaceState, string> = {
  cheery: '#34d399',
  amped: '#f59e0b',
  tense: '#fb7185',
  worn: '#93c5fd',
  bashful: '#c084fc',
};

const AMBIENT_COLORS: Record<AmbientFaceState, string> = {
  curious: '#67e8f9',
  invite: '#a78bfa',
};

function getEmotionFaceState(emotionState: EmotionState | null): EmotionFaceState | null {
  switch (emotionState) {
    case 'happy':
    case 'confident':
      return 'cheery';
    case 'excited':
      return 'amped';
    case 'stressed':
    case 'frustrated':
      return 'tense';
    case 'fatigued':
      return 'worn';
    case 'hesitant':
      return 'bashful';
    default:
      return null;
  }
}

function getMessageFaceState(message: string | null, state: BuddyState): EmotionFaceState | null {
  if (!message) return null;

  const normalized = message.toLowerCase();

  if (
    state === 'error' ||
    normalized.includes('failed') ||
    normalized.includes("couldn't") ||
    normalized.includes('unavailable') ||
    normalized.includes('denied') ||
    normalized.includes('error')
  ) {
    return 'tense';
  }

  if (
    normalized.includes('boss') ||
    normalized.includes('epic') ||
    normalized.includes('achievement') ||
    normalized.includes('streak') ||
    normalized.includes('defeated') ||
    normalized.includes('level up')
  ) {
    return 'amped';
  }

  if (
    normalized.includes('ready') ||
    normalized.includes('complete') ||
    normalized.includes('logged') ||
    normalized.includes('begins now') ||
    normalized.includes('back on') ||
    normalized.includes('secured') ||
    normalized.includes('gained')
  ) {
    return 'cheery';
  }

  if (
    normalized.includes('already') ||
    normalized.includes('today') ||
    normalized.includes('take it easy')
  ) {
    return 'bashful';
  }

  return null;
}

function getMessageIntensity(message: string | null, state: BuddyState, faceState: EmotionFaceState | null): number {
  if (!message) {
    return state === 'celebrating' ? 0.62 : 0;
  }

  const normalized = message.toLowerCase();
  let intensity = state === 'celebrating' ? 0.62 : state === 'error' ? 0.52 : 0.42;
  const exclamationCount = message.match(/!/g)?.length ?? 0;

  intensity += Math.min(0.18, exclamationCount * 0.05);

  if (
    normalized.includes('boss') ||
    normalized.includes('epic') ||
    normalized.includes('legendary') ||
    normalized.includes('achievement') ||
    normalized.includes('defeated') ||
    normalized.includes('streak') ||
    normalized.includes('level up')
  ) {
    intensity += 0.18;
  }

  if (
    normalized.includes('great') ||
    normalized.includes('ready') ||
    normalized.includes('complete') ||
    normalized.includes('gained') ||
    normalized.includes('secured')
  ) {
    intensity += 0.09;
  }

  if (
    normalized.includes('failed') ||
    normalized.includes("couldn't") ||
    normalized.includes('error') ||
    normalized.includes('denied')
  ) {
    intensity += 0.06;
  }

  if (faceState === 'amped') intensity += 0.12;
  if (faceState === 'cheery') intensity += 0.06;
  if (faceState === 'tense') intensity += 0.04;

  return Math.min(1, Math.max(0.38, intensity));
}

function LEDFace({
  state,
  color,
  audioLevel,
  isDizzy,
  dizzyLevel,
  isPetted,
  petLevel,
  isAnnoyed,
  annoyedLevel,
  emotionFaceState,
  emotionLevel,
  ambientCue,
  ambientCueLevel,
  messageIntensity,
  blinkPattern,
  blinkLead,
  isMischief,
  winkSide,
  isWaking,
  isSurprised,
  isBored,
  isSleepy,
  gazeOffset,
  isHovered,
  tilt,
}: {
  state: BuddyState;
  color: string;
  audioLevel: number;
  isDizzy: boolean;
  dizzyLevel: number;
  isPetted: boolean;
  petLevel: number;
  isAnnoyed: boolean;
  annoyedLevel: number;
  emotionFaceState: EmotionFaceState | null;
  emotionLevel: number;
  ambientCue: AmbientCueState;
  ambientCueLevel: number;
  messageIntensity: number;
  blinkPattern: BlinkPattern;
  blinkLead: BlinkLead;
  isMischief: boolean;
  winkSide: WinkSide;
  isWaking: boolean;
  isSurprised: boolean;
  isBored: boolean;
  isSleepy: boolean;
  gazeOffset: { x: number; y: number };
  isHovered: boolean;
  tilt: number;
}) {
  const isBlushing = isPetted && petLevel >= 0.78;
  const blushLevel = isBlushing ? Math.max(0.1, (petLevel - 0.72) / 0.28) : 0;
  const expressionState: FaceState = isDizzy
    ? 'dizzy'
    : isAnnoyed
      ? 'annoyed'
      : isWaking
        ? 'waking'
      : isBlushing
        ? 'blushing'
        : isPetted
          ? 'petting'
          : isSurprised
            ? 'surprised'
            : emotionFaceState
              ? emotionFaceState
              : ambientCue !== 'none'
                ? ambientCue
              : isMischief
                ? 'mischief'
                : isSleepy
                  ? 'sleepy'
                  : isBored
                    ? 'bored'
                    : state;
  const mouthScaleY = expressionState === 'speaking'
    ? Math.max(0.4, audioLevel * 3.0)
    : expressionState === 'petting'
      ? 1 + petLevel * 0.2
      : 0;
  const mouthScaleX = expressionState === 'speaking'
    ? Math.max(1.0, 1.0 + audioLevel * 1.5)
    : expressionState === 'petting'
      ? 2 + petLevel * 0.35
      : 0;
  const dizzyOrbit = 4 + dizzyLevel * 6;
  const dizzyDuration = Math.max(0.45, 0.9 - dizzyLevel * 0.25);
  const celebrationBurstLevel = state === 'celebrating'
    ? Math.max(0.58, messageIntensity)
    : expressionState === 'amped'
      ? Math.max(0.46, emotionLevel, messageIntensity)
      : 0;
  const showCelebrationBurst = celebrationBurstLevel > 0;
  const burstDuration = Math.max(0.62, 1.06 - celebrationBurstLevel * 0.26);
  const voiceSparkLevel = expressionState === 'speaking'
    ? Math.max(0, Math.min(1, (audioLevel - 0.14) / 0.86))
    : 0;
  const showVoiceSparkle = voiceSparkLevel > 0.08 && !showCelebrationBurst;
  const blinkAnimate = blinkPattern === 'double'
    ? { scaleY: [1, 0.06, 1, 1, 0.18, 1], scaleX: [1, 1.06, 1, 1, 1.03, 1] }
    : blinkPattern === 'soft'
      ? { scaleY: [1, 0.05, 1], scaleX: [1, 1.04, 1] }
      : { scaleY: 1, scaleX: 1 };
  const blinkTimes = blinkPattern === 'double'
    ? [0, 0.16, 0.34, 0.55, 0.72, 1]
    : [0, 0.42, 1];
  const lookX = expressionState === 'dizzy'
    ? 0
    : expressionState === 'sleepy'
      ? gazeOffset.x * 0.18
      : expressionState === 'invite'
        ? gazeOffset.x * 0.3
        : expressionState === 'curious'
          ? gazeOffset.x * 0.42
      : expressionState === 'worn'
        ? gazeOffset.x * 0.2
      : expressionState === 'annoyed'
        ? gazeOffset.x * 0.08
        : gazeOffset.x;
  const lookY = expressionState === 'dizzy'
    ? 0
    : expressionState === 'sleepy'
      ? gazeOffset.y * 0.12
      : expressionState === 'invite'
        ? gazeOffset.y * 0.22
        : expressionState === 'curious'
          ? gazeOffset.y * 0.28
      : expressionState === 'worn'
        ? gazeOffset.y * 0.14
      : expressionState === 'annoyed'
        ? gazeOffset.y * 0.08
        : gazeOffset.y;

  // EMO style snappy idle movement timeline
  const idleX = [0, -8, -8, 8, 8, 0, 0, -4, -4, 0];
  const idleY = [0, 0, 0, 0, 0, -6, -6, 4, 4, 0];
  const blinkScale = [1, 1, 0.1, 1, 1, 1, 0.1, 1, 1, 1];
  const idleTimes = [0, 0.1, 0.15, 0.3, 0.4, 0.5, 0.55, 0.7, 0.8, 1];

  const leftEyeVariants: Variants = {
    idle: {
      height: 20, width: 14, borderRadius: 6,
      x: idleX, y: idleY, rotate: 0, scaleY: blinkScale,
      transition: { duration: 7, repeat: Infinity, times: idleTimes, ease: "anticipate" }
    },
    listening: {
      // Big attentive circles
      height: 22 + audioLevel * 4, width: 22 + audioLevel * 4, borderRadius: 12 + audioLevel * 2,
      x: -3, y: -2, rotate: 0, scaleY: 1,
      transition: { type: "spring", bounce: 0.4, damping: 12 }
    },
    thinking: {
      // Curious asymmetrical look (Left eye Big, Right eye Small, then swaps)
      height: [24, 10], width: [18, 14], borderRadius: [9, 5],
      x: [-2, 2], y: [-4, 4], rotate: 0, scaleY: 1,
      transition: { duration: 1.5, repeat: Infinity, repeatType: "reverse", ease: "easeInOut" }
    },
    speaking: {
      // Happy arches when speaking
      height: 12, width: 18, borderRadius: "16px 16px 4px 4px",
      x: 0, y: -4 - audioLevel * 3, rotate: 0, scaleY: 1,
      transition: { type: "spring", bounce: 0.6, damping: 10 }
    },
    celebrating: {
      height: [10, 11 + celebrationBurstLevel * 2, 10], width: [20, 18 + celebrationBurstLevel * 1.6, 20], borderRadius: "20px 20px 4px 4px",
      x: [-1, 1.2 + celebrationBurstLevel, -0.5], y: [-4, -8.5 - celebrationBurstLevel * 2.5, -4], rotate: [-7, -11, -7], scaleY: [1, 1.05, 1],
      transition: { duration: Math.max(0.3, 0.46 - celebrationBurstLevel * 0.08), repeat: Infinity, ease: "easeInOut" }
    },
    petting: {
      height: 10, width: 22, borderRadius: "20px 20px 4px 4px",
      x: 0, y: [-3, -6, -3], rotate: [-6, -10, -6], scaleY: 1,
      transition: { duration: 0.55, repeat: Infinity, ease: "easeInOut" }
    },
    blushing: {
      height: 10, width: 20, borderRadius: "20px 20px 4px 4px",
      x: 0, y: [-3, -5 - blushLevel * 1.8, -3], rotate: [-9, -13, -9], scaleY: [1, 0.95, 1],
      transition: { duration: 0.72, repeat: Infinity, ease: "easeInOut" }
    },
    cheery: {
      height: 10, width: 20, borderRadius: "20px 20px 4px 4px",
      x: 0, y: [-3, -5 - emotionLevel * 1.6, -3], rotate: [-4, -6, -4], scaleY: 1,
      transition: { duration: 0.65, repeat: Infinity, ease: "easeInOut" }
    },
    amped: {
      height: 24 + emotionLevel * 3.5, width: 20 + emotionLevel * 2.6, borderRadius: 12,
      x: [-1, -2.2, -1], y: [-4, -6.5 - emotionLevel * 0.8, -4], rotate: [0, -3.2 - emotionLevel * 1.4, -0.4], scaleY: [1, 1.08, 0.98],
      transition: { duration: Math.max(0.32, 0.44 - emotionLevel * 0.06), repeat: Infinity, ease: "easeInOut" }
    },
    surprised: {
      height: 26, width: 20, borderRadius: 11,
      x: 0, y: -6, rotate: 0, scaleY: 1,
      transition: { duration: 0.18, ease: "easeOut" }
    },
    tense: {
      height: 6, width: 20, borderRadius: 3,
      x: 2, y: -1, rotate: 16 + emotionLevel * 10, scaleY: 1,
      transition: { type: "spring", bounce: 0.2, damping: 12 }
    },
    worn: {
      height: 6, width: 18, borderRadius: 999,
      x: -1, y: 4, rotate: 6, scaleY: [1, 0.78, 1],
      transition: { duration: 2.4, repeat: Infinity, ease: "easeInOut" }
    },
    bashful: {
      height: 10, width: 18, borderRadius: "20px 20px 4px 4px",
      x: -1, y: -2, rotate: [-7, -9, -7], scaleY: [1, 0.94, 1],
      transition: { duration: 0.82, repeat: Infinity, ease: "easeInOut" }
    },
    curious: {
      height: [24, 12, 24], width: [18, 11, 18], borderRadius: [10, 999, 10],
      x: [-2, 2, -1], y: [-3, -1, -3], rotate: [-4, -8, -4], scaleY: 1,
      transition: { duration: 0.86, repeat: Infinity, ease: "easeInOut" }
    },
    invite: {
      height: 10, width: 20, borderRadius: "18px 18px 5px 5px",
      x: 0, y: [-2, -4 - ambientCueLevel * 1.4, -2], rotate: [-3, -4.5, -3], scaleY: [1, 0.96, 1],
      transition: { duration: 1.05, repeat: Infinity, ease: "easeInOut" }
    },
    mischief: {
      height: winkSide === 'left' ? 5 : 18,
      width: winkSide === 'left' ? 18 : 16,
      borderRadius: winkSide === 'left' ? 999 : 8,
      x: winkSide === 'left' ? -2 : 2,
      y: winkSide === 'left' ? -1 : -3,
      rotate: winkSide === 'left' ? -10 : 4,
      scaleY: winkSide === 'left' ? [1, 0.78, 1] : 1,
      transition: { duration: 0.62, ease: "easeInOut" }
    },
    waking: {
      height: [6, 26, 18], width: [16, 22, 16], borderRadius: [999, 12, 8],
      x: [0, -1, 0], y: [4, -5, -2], rotate: [0, -2, 0], scaleY: [0.7, 1.08, 1],
      transition: { duration: 0.42, ease: "easeOut" }
    },
    annoyed: {
      height: 6, width: 22, borderRadius: 3,
      x: 2, y: -2, rotate: 20 + annoyedLevel * 10, scaleY: 1,
      transition: { type: "spring", bounce: 0.28, damping: 11 }
    },
    bored: {
      height: [8, 8, 7, 8, 8, 7, 8], width: [20, 20, 19, 20, 20, 19, 20], borderRadius: 999,
      x: [0, 3, 3, 0, -2, -2, 0], y: [2, 2, 3, 2, 1, 1, 2], rotate: [-2, -2, -1, -2, -4, -4, -2], scaleY: [1, 1, 0.92, 1, 1, 0.95, 1],
      transition: { duration: 4.8, repeat: Infinity, ease: "easeInOut" }
    },
    sleepy: {
      height: 5, width: 18, borderRadius: 999,
      x: -1, y: 4, rotate: 4, scaleY: [1, 0.82, 1],
      transition: { duration: 2.8, repeat: Infinity, ease: "easeInOut" }
    },
    sleeping: {
      // Breathing flat lines
      height: 4, width: 16, borderRadius: 2,
      x: 0, y: 6, rotate: 0, scaleY: 1, opacity: [0.2, 1, 0.2],
      transition: { duration: 3, repeat: Infinity, ease: "easeInOut" }
    },
    error: {
      // Angry slanted eyes \
      height: 6, width: 20, borderRadius: 2,
      x: 2, y: 0, rotate: 25, scaleY: 1,
      transition: { type: "spring", bounce: 0.6 }
    },
    dizzy: {
      height: 18, width: 18, borderRadius: 999,
      x: [0, -dizzyOrbit, 0, dizzyOrbit, 0], y: [-dizzyOrbit, 0, dizzyOrbit, 0, -dizzyOrbit], rotate: [0, 90, 180, 270, 360], scaleY: 1,
      transition: { duration: dizzyDuration, repeat: Infinity, ease: "linear" }
    }
  };

  const rightEyeVariants: Variants = {
    idle: {
      height: 20, width: 14, borderRadius: 6,
      x: idleX, y: idleY, rotate: 0, scaleY: blinkScale,
      transition: { duration: 7, repeat: Infinity, times: idleTimes, ease: "anticipate" }
    },
    listening: {
      height: 22 + audioLevel * 4, width: 22 + audioLevel * 4, borderRadius: 12 + audioLevel * 2,
      x: 3, y: -2, rotate: 0, scaleY: 1,
      transition: { type: "spring", bounce: 0.4, damping: 12 }
    },
    thinking: {
      // Opposite of left eye
      height: [10, 24], width: [14, 18], borderRadius: [5, 9],
      x: [2, -2], y: [4, -4], rotate: 0, scaleY: 1,
      transition: { duration: 1.5, repeat: Infinity, repeatType: "reverse", ease: "easeInOut" }
    },
    speaking: {
      height: 12, width: 18, borderRadius: "16px 16px 4px 4px",
      x: 0, y: -4 - audioLevel * 3, rotate: 0, scaleY: 1,
      transition: { type: "spring", bounce: 0.6, damping: 10 }
    },
    celebrating: {
      height: [10, 10 + celebrationBurstLevel * 1.6, 10], width: [20, 21 + celebrationBurstLevel, 20], borderRadius: "20px 20px 4px 4px",
      x: [1, -1.3 - celebrationBurstLevel, 0.4], y: [-4, -7.4 - celebrationBurstLevel * 2.1, -4], rotate: [7, 9.5, 7], scaleY: [1, 0.99, 1],
      transition: { duration: Math.max(0.3, 0.46 - celebrationBurstLevel * 0.08), repeat: Infinity, ease: "easeInOut" }
    },
    petting: {
      height: 10, width: 22, borderRadius: "20px 20px 4px 4px",
      x: 0, y: [-3, -6, -3], rotate: [6, 10, 6], scaleY: 1,
      transition: { duration: 0.55, repeat: Infinity, ease: "easeInOut" }
    },
    blushing: {
      height: 10, width: 20, borderRadius: "20px 20px 4px 4px",
      x: 0, y: [-3, -5 - blushLevel * 1.8, -3], rotate: [9, 13, 9], scaleY: [1, 0.95, 1],
      transition: { duration: 0.72, repeat: Infinity, ease: "easeInOut" }
    },
    cheery: {
      height: 10, width: 20, borderRadius: "20px 20px 4px 4px",
      x: 0, y: [-3, -5 - emotionLevel * 1.6, -3], rotate: [4, 6, 4], scaleY: 1,
      transition: { duration: 0.65, repeat: Infinity, ease: "easeInOut" }
    },
    amped: {
      height: 22 + emotionLevel * 2.8, width: 21 + emotionLevel * 3.2, borderRadius: 12,
      x: [1, 2.4, 1], y: [-4, -5.6 - emotionLevel * 0.6, -4], rotate: [0, 3.4 + emotionLevel * 1.6, 0.6], scaleY: [1, 1.02, 1],
      transition: { duration: Math.max(0.32, 0.44 - emotionLevel * 0.06), repeat: Infinity, ease: "easeInOut" }
    },
    surprised: {
      height: 26, width: 20, borderRadius: 11,
      x: 0, y: -6, rotate: 0, scaleY: 1,
      transition: { duration: 0.18, ease: "easeOut" }
    },
    tense: {
      height: 6, width: 20, borderRadius: 3,
      x: -2, y: -1, rotate: -(16 + emotionLevel * 10), scaleY: 1,
      transition: { type: "spring", bounce: 0.2, damping: 12 }
    },
    worn: {
      height: 6, width: 18, borderRadius: 999,
      x: 1, y: 4, rotate: -6, scaleY: [1, 0.78, 1],
      transition: { duration: 2.4, repeat: Infinity, ease: "easeInOut" }
    },
    bashful: {
      height: 10, width: 18, borderRadius: "20px 20px 4px 4px",
      x: 1, y: -2, rotate: [7, 9, 7], scaleY: [1, 0.94, 1],
      transition: { duration: 0.82, repeat: Infinity, ease: "easeInOut" }
    },
    curious: {
      height: [12, 24, 12], width: [11, 18, 11], borderRadius: [999, 10, 999],
      x: [2, -2, 1], y: [-1, -3, -1], rotate: [8, 4, 8], scaleY: 1,
      transition: { duration: 0.86, repeat: Infinity, ease: "easeInOut" }
    },
    invite: {
      height: 10, width: 20, borderRadius: "18px 18px 5px 5px",
      x: 0, y: [-2, -4 - ambientCueLevel * 1.4, -2], rotate: [3, 4.5, 3], scaleY: [1, 0.96, 1],
      transition: { duration: 1.05, repeat: Infinity, ease: "easeInOut" }
    },
    mischief: {
      height: winkSide === 'right' ? 5 : 18,
      width: winkSide === 'right' ? 18 : 16,
      borderRadius: winkSide === 'right' ? 999 : 8,
      x: winkSide === 'right' ? 2 : -2,
      y: winkSide === 'right' ? -1 : -3,
      rotate: winkSide === 'right' ? 10 : -4,
      scaleY: winkSide === 'right' ? [1, 0.78, 1] : 1,
      transition: { duration: 0.62, ease: "easeInOut" }
    },
    waking: {
      height: [6, 26, 18], width: [16, 22, 16], borderRadius: [999, 12, 8],
      x: [0, 1, 0], y: [4, -5, -2], rotate: [0, 2, 0], scaleY: [0.7, 1.08, 1],
      transition: { duration: 0.42, ease: "easeOut" }
    },
    annoyed: {
      height: 6, width: 22, borderRadius: 3,
      x: -2, y: -2, rotate: -(20 + annoyedLevel * 10), scaleY: 1,
      transition: { type: "spring", bounce: 0.28, damping: 11 }
    },
    bored: {
      height: [6, 6, 8, 6, 6, 8, 6], width: [18, 18, 18, 18, 17, 18, 18], borderRadius: 999,
      x: [0, 2, 2, 0, -1, -1, 0], y: [3, 3, 2, 3, 2, 2, 3], rotate: [2, 2, 1, 2, 3, 3, 2], scaleY: [0.84, 0.84, 1, 0.84, 0.86, 1, 0.84],
      transition: { duration: 4.8, repeat: Infinity, ease: "easeInOut" }
    },
    sleepy: {
      height: 5, width: 18, borderRadius: 999,
      x: 1, y: 4, rotate: -4, scaleY: [1, 0.82, 1],
      transition: { duration: 2.8, repeat: Infinity, ease: "easeInOut" }
    },
    sleeping: {
      height: 4, width: 16, borderRadius: 2,
      x: 0, y: 6, rotate: 0, scaleY: 1, opacity: [0.2, 1, 0.2],
      transition: { duration: 3, repeat: Infinity, ease: "easeInOut" }
    },
    error: {
      // Angry slanted eyes /
      height: 6, width: 20, borderRadius: 2,
      x: -2, y: 0, rotate: -25, scaleY: 1,
      transition: { type: "spring", bounce: 0.6 }
    },
    dizzy: {
      height: 18, width: 18, borderRadius: 999,
      x: [0, dizzyOrbit, 0, -dizzyOrbit, 0], y: [dizzyOrbit, 0, -dizzyOrbit, 0, dizzyOrbit], rotate: [0, -90, -180, -270, -360], scaleY: 1,
      transition: { duration: dizzyDuration, repeat: Infinity, ease: "linear" }
    }
  };

  const mouthVariants: Variants = {
    idle: { opacity: 0, height: 6, width: 6, scaleY: 0, scaleX: 0, y: 0 },
    listening: { opacity: 0, height: 6, width: 6, scaleY: 0, scaleX: 0, y: 0 },
    thinking: { opacity: 0, height: 6, width: 6, scaleY: 0, scaleX: 0, y: 0 },
    speaking: { 
      opacity: 1, 
      height: 8, 
      width: 8, 
      scaleY: mouthScaleY,
      scaleX: mouthScaleX,
      borderRadius: 4, 
      y: 8,
      transition: { duration: 0.05 }
    },
    celebrating: { opacity: 0, height: 6, width: 6, scaleY: 0, scaleX: 0, y: 0 },
    petting: { opacity: 1, height: 4, width: 10, scaleY: mouthScaleY, scaleX: mouthScaleX, y: 10, borderRadius: 999, transition: { duration: 0.18, ease: "easeInOut" } },
    blushing: { opacity: 1, height: 4, width: 11, scaleY: 1, scaleX: 1.2 + blushLevel * 0.25, y: 10, borderRadius: 999, transition: { duration: 0.18, ease: "easeInOut" } },
    cheery: { opacity: 1, height: 4, width: 12, scaleY: 1, scaleX: 1.2 + emotionLevel * 0.2, y: 10, borderRadius: 999, transition: { duration: 0.22, ease: "easeInOut" } },
    amped: { opacity: 1, height: 6, width: 9, scaleY: [1, 1.2, 0.95], scaleX: [1, 1.08, 1], y: 9, borderRadius: 999, transition: { duration: 0.42, repeat: Infinity, ease: "easeInOut" } },
    surprised: { opacity: 1, height: 6, width: 6, scaleY: 1.25, scaleX: 1.25, y: 10, borderRadius: 999, transition: { duration: 0.18, ease: "easeOut" } },
    tense: { opacity: 0.82, height: 4, width: 12, scaleY: 1, scaleX: 1, y: 11, rotate: 180, borderRadius: 999, transition: { duration: 0.18, ease: "easeInOut" } },
    worn: { opacity: 0.28, height: 3, width: 9, scaleY: 1, scaleX: 1, y: 10, rotate: 0, borderRadius: 999, transition: { duration: 0.4 } },
    bashful: { opacity: 1, height: 4, width: 10, scaleY: 1, scaleX: 1.08, y: 10, borderRadius: 999, transition: { duration: 0.22, ease: "easeInOut" } },
    curious: { opacity: 0.82, height: 4, width: 9, scaleY: [1, 0.88, 1], scaleX: [1, 1.06, 1], y: 10, rotate: [8, -4, 6], borderRadius: 999, transition: { duration: 0.86, repeat: Infinity, ease: "easeInOut" } },
    invite: { opacity: 1, height: 4, width: 11, scaleY: 1, scaleX: [1, 1.14, 1], y: 10, borderRadius: 999, transition: { duration: 1.05, repeat: Infinity, ease: "easeInOut" } },
    mischief: { opacity: 1, height: 4, width: 11, scaleY: 1, scaleX: 1.08, y: 10, rotate: winkSide === 'left' ? 8 : -8, borderRadius: 999, transition: { duration: 0.22, ease: "easeInOut" } },
    waking: { opacity: 1, height: [3, 6, 4], width: [7, 7, 8], scaleY: [0.8, 1.1, 1], scaleX: [0.9, 1, 1], y: [11, 9, 10], borderRadius: 999, transition: { duration: 0.42, ease: "easeOut" } },
    annoyed: { opacity: 0.85, height: 4, width: 12, scaleY: 1, scaleX: 1, y: 11, rotate: 180, borderRadius: 999, transition: { duration: 0.16, ease: "easeInOut" } },
    bored: { opacity: 0.45, height: 4, width: 14, scaleY: 1, scaleX: 1, y: 10, rotate: -4, borderRadius: 999, transition: { duration: 0.5 } },
    sleepy: { opacity: 0.35, height: 4, width: 10, scaleY: 1, scaleX: 1, y: 10, rotate: 0, borderRadius: 999, transition: { duration: 0.5 } },
    sleeping: { opacity: 0, height: 6, width: 6, scaleY: 0, scaleX: 0, y: 0 },
    error: { opacity: 0, height: 6, width: 6, scaleY: 0, scaleX: 0, y: 0 },
    dizzy: { opacity: 0.65, height: 4, width: 18, scaleY: 1, scaleX: 1, y: 10, rotate: [0, -10, 10, -5, 0], borderRadius: 999, transition: { duration: dizzyDuration, repeat: Infinity, ease: "easeInOut" } }
  };

  const cheekOpacity = expressionState === 'blushing'
    ? 0.48 + blushLevel * 0.24
    : expressionState === 'bashful'
      ? 0.18 + emotionLevel * 0.18
    : expressionState === 'petting'
      ? 0.22 + petLevel * 0.14
      : 0;

  const glowStyle = {
    backgroundColor: color,
    boxShadow: showCelebrationBurst
      ? `0 0 14px ${color}, 0 0 ${28 + celebrationBurstLevel * 12}px ${color}99`
      : `0 0 12px ${color}, 0 0 24px ${color}80`
  };

  return (
    <div className="relative w-full h-full flex items-center justify-center">
      {/* Eyes Container - bobs up and down when speaking */}
      <motion.div 
        className="absolute flex items-center justify-center gap-2.5"
        animate={expressionState === 'dizzy'
          ? { y: [0, -1.5, 1.5, -0.75, 0], rotate: [-2 * dizzyLevel, 2 * dizzyLevel, -1.5 * dizzyLevel, 1.5 * dizzyLevel, 0] }
          : expressionState === 'annoyed'
            ? { x: [lookX * 0.08, lookX * 0.08 - 1.2 - annoyedLevel, lookX * 0.08 + 1.1 + annoyedLevel, lookX * 0.08], y: [-0.5, -1, 0.5, -0.5], rotate: [tilt * 0.18, tilt * 0.22 + 1.4, tilt * 0.12 - 1.2, tilt * 0.18], scale: [1, 1.01, 1] }
          : expressionState === 'celebrating'
            ? { x: [lookX * 0.18, lookX * 0.24 + 0.8, lookX * 0.18 - 0.8, lookX * 0.18], y: [-1.2, -3.2 - celebrationBurstLevel * 1.8, -1.2, -2.1], rotate: [tilt * 0.12, tilt * 0.2 + 1.2, tilt * 0.12 - 1, tilt * 0.12], scale: [1, 1.02 + celebrationBurstLevel * 0.03, 1] }
          : expressionState === 'invite'
            ? { x: lookX * 0.26, y: [-0.8, -1.9 - ambientCueLevel * 0.9, -0.8], rotate: tilt * 0.1, scale: [1, 1.014, 1] }
          : expressionState === 'curious'
            ? { x: [lookX * 0.55, lookX * 0.62 + Math.sign(lookX || 1) * 0.5, lookX * 0.55], y: [-0.2, -1.3 - ambientCueLevel * 0.7, -0.2], rotate: [tilt * 0.12, tilt * 0.18 + Math.sign(lookX || 1) * 0.8, tilt * 0.12], scale: [1, 1.014, 1] }
          : expressionState === 'waking'
            ? { y: [2, -4, 0], rotate: [-2, 1.5, 0], scale: [0.96, 1.05, 1] }
          : expressionState === 'mischief'
            ? { x: lookX * 0.24 + (winkSide === 'left' ? 0.8 : -0.8), y: [-0.8, -1.8, -0.8], rotate: tilt * 0.14 + (winkSide === 'left' ? -2.8 : 2.8), scale: [1, 1.016, 1] }
          : expressionState === 'cheery'
            ? { x: lookX * 0.28, y: [-1.2, -2.8 - emotionLevel * 1.4, -1.2], rotate: tilt * 0.16, scale: [1, 1.02, 1] }
          : expressionState === 'amped'
            ? { x: [lookX * 0.3, lookX * 0.3 + 1.1 + emotionLevel, lookX * 0.3 - 0.9 - emotionLevel * 0.8, lookX * 0.3], y: [-2.2, -3.6 - emotionLevel * 1.6, -1.2, -2.2], rotate: [tilt * 0.16, tilt * 0.24 + 1.2, tilt * 0.12 - 0.9, tilt * 0.16], scale: [1, 1.03, 0.998, 1] }
          : expressionState === 'tense'
            ? { x: lookX * 0.1 - 0.5, y: [-0.3, -0.9, 0, -0.3], rotate: tilt * 0.1 - 1.4, scale: [1, 1.008, 1] }
          : expressionState === 'worn'
            ? { x: lookX * 0.2, y: [1.8, 2.6, 1.8], rotate: tilt * 0.06 - 2.4, scale: [0.992, 0.984, 0.992] }
          : expressionState === 'bashful'
            ? { x: lookX * 0.22 - 1.2, y: [-0.8, -1.8, -0.8], rotate: tilt * 0.14 - 3, scale: [1, 1.014, 1] }
          : expressionState === 'blushing'
            ? { x: lookX * 0.15, y: [-1, -2.5 - blushLevel * 1.4, -1], rotate: tilt * 0.18, scale: [1, 1.025, 1] }
          : expressionState === 'petting'
            ? { x: lookX * 0.2, y: [-1, -3 - petLevel * 2, -1], rotate: tilt * 0.2, scale: 1 + petLevel * 0.04 }
          : expressionState === 'surprised'
            ? { x: lookX * 0.2, y: -5 + lookY * 0.15, rotate: tilt * 0.12, scale: 1.05 }
          : expressionState === 'sleepy'
            ? { x: lookX, y: 1.5 + lookY * 0.15, rotate: tilt * 0.08 - 2, scale: 0.985 }
          : expressionState === 'bored'
            ? { x: lookX * 0.35 - 2, y: 1 + lookY * 0.25, rotate: tilt * 0.12 - 2, scale: 0.985 }
          : expressionState === 'speaking'
            ? { x: [lookX, lookX + audioLevel * 1.4, lookX - audioLevel * 1.1, lookX], y: [-2 - audioLevel * 4, -3.5 - audioLevel * 5.5, -1 - audioLevel * 3.2, -2 - audioLevel * 4], rotate: [tilt * 0.25, tilt * 0.45 + audioLevel * 2, tilt * 0.15 - audioLevel * 1.8, tilt * 0.25], scale: [1, 1.01 + audioLevel * 0.04, 0.995, 1] }
            : { x: lookX, y: lookY * 0.45 + (isHovered ? -0.8 : 0), rotate: tilt }}
        transition={expressionState === 'dizzy'
          ? { duration: dizzyDuration, repeat: Infinity, ease: "easeInOut" }
          : expressionState === 'annoyed'
            ? { duration: Math.max(0.18, 0.32 - annoyedLevel * 0.08), repeat: Infinity, ease: "easeInOut" }
          : expressionState === 'celebrating'
            ? { duration: Math.max(0.32, 0.48 - celebrationBurstLevel * 0.08), repeat: Infinity, ease: "easeInOut" }
          : expressionState === 'invite'
            ? { duration: 1.05, repeat: Infinity, ease: "easeInOut" }
          : expressionState === 'curious'
            ? { duration: 0.86, repeat: Infinity, ease: "easeInOut" }
          : expressionState === 'waking'
            ? { duration: 0.42, ease: "easeOut" }
          : expressionState === 'mischief'
            ? { duration: 0.62, ease: "easeInOut" }
          : expressionState === 'cheery'
            ? { duration: 0.65, repeat: Infinity, ease: "easeInOut" }
          : expressionState === 'amped'
            ? { duration: 0.42, repeat: Infinity, ease: "easeInOut" }
          : expressionState === 'tense'
            ? { duration: 0.34, repeat: Infinity, ease: "easeInOut" }
          : expressionState === 'worn'
            ? { duration: 2.4, repeat: Infinity, ease: "easeInOut" }
          : expressionState === 'bashful'
            ? { duration: 0.82, repeat: Infinity, ease: "easeInOut" }
          : expressionState === 'blushing'
            ? { duration: 0.72, repeat: Infinity, ease: "easeInOut" }
          : expressionState === 'petting'
            ? { duration: 0.55, repeat: Infinity, ease: "easeInOut" }
          : expressionState === 'surprised'
            ? { duration: 0.22, ease: "easeOut" }
          : expressionState === 'sleepy'
            ? { duration: 2.8, repeat: Infinity, ease: "easeInOut" }
          : expressionState === 'bored'
            ? { duration: 4.8, repeat: Infinity, ease: "easeInOut" }
          : expressionState === 'speaking'
            ? { duration: 0.32, repeat: Infinity, ease: "easeInOut" }
          : { type: "spring", bounce: 0.5, damping: 10 }}
      >
        <motion.div
          style={{ originX: 0.5, originY: 0.5 }}
          animate={blinkAnimate}
          transition={blinkPattern === 'none'
            ? { duration: 0.12 }
            : { duration: blinkPattern === 'double' ? 0.42 : 0.18, times: blinkTimes, ease: "easeInOut", delay: blinkLead === 'left' ? 0 : 0.018 }}
        >
          <motion.div
            style={glowStyle}
            variants={leftEyeVariants}
            animate={expressionState}
            initial="idle"
          />
        </motion.div>
        <motion.div
          style={{ originX: 0.5, originY: 0.5 }}
          animate={blinkAnimate}
          transition={blinkPattern === 'none'
            ? { duration: 0.12 }
            : { duration: blinkPattern === 'double' ? 0.42 : 0.18, times: blinkTimes, ease: "easeInOut", delay: blinkLead === 'right' ? 0 : 0.018 }}
        >
          <motion.div
            style={glowStyle}
            variants={rightEyeVariants}
            animate={expressionState}
            initial="idle"
          />
        </motion.div>
      </motion.div>
      
      {/* Mouth (only visible when speaking) */}
      <motion.div
        className="absolute"
        style={glowStyle}
        variants={mouthVariants}
        animate={expressionState}
        initial="idle"
      />
      <motion.div
        className="absolute left-[18%] top-[60%] h-2.5 w-3 rounded-full bg-rose-400/70 blur-[1px]"
        animate={expressionState === 'blushing' || expressionState === 'bashful' ? { opacity: cheekOpacity, scale: [1, 1.14, 1] } : { opacity: cheekOpacity, scale: 1 }}
        transition={expressionState === 'blushing' || expressionState === 'bashful' ? { duration: 0.8, repeat: Infinity, ease: "easeInOut" } : { duration: 0.18 }}
      />
      <motion.div
        className="absolute right-[18%] top-[60%] h-2.5 w-3 rounded-full bg-rose-400/70 blur-[1px]"
        animate={expressionState === 'blushing' || expressionState === 'bashful' ? { opacity: cheekOpacity, scale: [1, 1.14, 1] } : { opacity: cheekOpacity, scale: 1 }}
        transition={expressionState === 'blushing' || expressionState === 'bashful' ? { duration: 0.8, repeat: Infinity, ease: "easeInOut" } : { duration: 0.18 }}
      />
      {showVoiceSparkle && (
        <>
          <motion.div
            className="absolute left-[14%] top-[20%] h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}` }}
            animate={{ x: [0, -2 - voiceSparkLevel * 3], y: [0, -3.5 - voiceSparkLevel * 4], opacity: [0, 0.52 + voiceSparkLevel * 0.28, 0], scale: [0.72, 1.08 + voiceSparkLevel * 0.16, 0.82] }}
            transition={{ duration: Math.max(0.42, 0.74 - voiceSparkLevel * 0.16), repeat: Infinity, ease: "easeOut" }}
          />
          <motion.div
            className="absolute right-[14%] top-[18%] h-1 w-1 rounded-full"
            style={{ backgroundColor: color, boxShadow: `0 0 7px ${color}` }}
            animate={{ x: [0, 2 + voiceSparkLevel * 2.5], y: [0, -2.8 - voiceSparkLevel * 3.4], opacity: [0, 0.44 + voiceSparkLevel * 0.24, 0], scale: [0.68, 1.02 + voiceSparkLevel * 0.14, 0.8] }}
            transition={{ duration: Math.max(0.4, 0.68 - voiceSparkLevel * 0.14), repeat: Infinity, ease: "easeOut", delay: 0.12 }}
          />
        </>
      )}
      {showCelebrationBurst && (
        <>
          <motion.div
            className="absolute left-[8%] top-[16%] text-[9px] leading-none"
            style={{ color }}
            animate={{ x: [0, -4 - celebrationBurstLevel * 4], y: [0, -7 - celebrationBurstLevel * 5], opacity: [0, 0.95, 0], scale: [0.74, 1.14, 0.86], rotate: [0, -22, -34] }}
            transition={{ duration: burstDuration, repeat: Infinity, ease: "easeOut" }}
          >
            ✦
          </motion.div>
          <motion.div
            className="absolute right-[8%] top-[12%] text-[8px] leading-none"
            style={{ color }}
            animate={{ x: [0, 4 + celebrationBurstLevel * 3], y: [0, -6 - celebrationBurstLevel * 4], opacity: [0, 0.85, 0], scale: [0.72, 1.08, 0.84], rotate: [0, 20, 32] }}
            transition={{ duration: Math.max(0.58, burstDuration - 0.08), repeat: Infinity, ease: "easeOut", delay: 0.18 }}
          >
            ✦
          </motion.div>
          <motion.div
            className="absolute right-[18%] top-[26%] text-[7px] leading-none"
            style={{ color }}
            animate={{ x: [0, 5 + celebrationBurstLevel * 3], y: [0, 3 + celebrationBurstLevel * 2], opacity: [0, 0.76, 0], scale: [0.68, 1.02, 0.82], rotate: [0, 12, 24] }}
            transition={{ duration: Math.max(0.6, burstDuration - 0.12), repeat: Infinity, ease: "easeOut", delay: 0.32 }}
          >
            ✦
          </motion.div>
        </>
      )}
      {expressionState === 'curious' && (
        <motion.div
          className="absolute right-[14%] top-[10%] text-[8px] leading-none"
          style={{ color }}
          animate={{ y: [0, -3, -0.8], opacity: [0, 0.82, 0], scale: [0.78, 1.04, 0.9] }}
          transition={{ duration: 0.9, repeat: Infinity, ease: "easeOut" }}
        >
          ?
        </motion.div>
      )}
      {expressionState === 'mischief' && (
        <motion.div
          className="absolute top-[14%] text-[8px] leading-none"
          style={{ color, left: winkSide === 'left' ? '18%' : undefined, right: winkSide === 'right' ? '18%' : undefined }}
          animate={{ y: [0, -3, -1], opacity: [0, 0.85, 0], scale: [0.82, 1.06, 0.92] }}
          transition={{ duration: 0.72, ease: "easeOut" }}
        >
          ✦
        </motion.div>
      )}
      {expressionState === 'amped' && (
        <>
          <motion.div
            className="absolute left-[16%] top-[18%] text-[8px] leading-none"
            style={{ color }}
            animate={{ y: [0, -3, -1], opacity: [0, 0.8, 0], scale: [0.8, 1.08, 0.92] }}
            transition={{ duration: 0.9, repeat: Infinity, ease: "easeOut" }}
          >
            ✦
          </motion.div>
          <motion.div
            className="absolute right-[14%] top-[12%] text-[7px] leading-none"
            style={{ color }}
            animate={{ y: [0, -2.5, -0.8], opacity: [0, 0.72, 0], scale: [0.82, 1.04, 0.9] }}
            transition={{ duration: 0.86, repeat: Infinity, ease: "easeOut", delay: 0.22 }}
          >
            ✦
          </motion.div>
        </>
      )}
      {expressionState === 'blushing' && (
        <>
          <motion.div
            className="absolute left-[20%] top-[16%] text-[10px] leading-none"
            style={{ color }}
            animate={{ y: [0, -4, -1], opacity: [0.1, 0.95, 0], scale: [0.85, 1.08, 0.92] }}
            transition={{ duration: 1.1, repeat: Infinity, ease: "easeOut" }}
          >
            ❤
          </motion.div>
          <motion.div
            className="absolute right-[20%] top-[12%] text-[9px] leading-none"
            style={{ color }}
            animate={{ y: [0, -3.5, -1], opacity: [0, 0.85, 0], scale: [0.82, 1.04, 0.9] }}
            transition={{ duration: 1.05, repeat: Infinity, ease: "easeOut", delay: 0.28 }}
          >
            ❤
          </motion.div>
        </>
      )}
      {expressionState === 'sleepy' && (
        <>
          <motion.div
            className="absolute right-[18%] top-[15%] text-[8px] font-semibold leading-none"
            style={{ color }}
            animate={{ y: [0, -4], opacity: [0, 0.9, 0], scale: [0.82, 1, 0.9] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
          >
            Z
          </motion.div>
          <motion.div
            className="absolute right-[10%] top-[8%] text-[7px] font-semibold leading-none"
            style={{ color }}
            animate={{ y: [0, -3], opacity: [0, 0.72, 0], scale: [0.78, 0.96, 0.88] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut", delay: 0.42 }}
          >
            Z
          </motion.div>
        </>
      )}
    </div>
  );
}

export function MissiLEDFace({
  className,
  gazeOffset = { x: 0, y: 0 },
  isHovered = false,
  tilt = 0,
  ambientCue = 'none',
  ambientCueLevel = 0,
}: MissiLEDFaceProps) {
  const currentState = useBuddyState((state) => state.currentState);
  const audioLevel = useBuddyState((state) => state.audioLevel);
  const isDizzy = useBuddyState((state) => state.isDizzy);
  const dizzyLevel = useBuddyState((state) => state.dizzyLevel);
  const isPetted = useBuddyState((state) => state.isPetted);
  const petLevel = useBuddyState((state) => state.petLevel);
  const isAnnoyed = useBuddyState((state) => state.isAnnoyed);
  const annoyedLevel = useBuddyState((state) => state.annoyedLevel);
  const message = useBuddyState((state) => state.message);
  const emotionState = useBuddyState((state) => state.emotionState);
  const emotionLevel = useBuddyState((state) => state.emotionLevel);
  const [isSurprised, setIsSurprised] = useState(false);
  const [isBored, setIsBored] = useState(false);
  const [isSleepy, setIsSleepy] = useState(false);
  const [isMischief, setIsMischief] = useState(false);
  const [winkSide, setWinkSide] = useState<WinkSide>('left');
  const [isWaking, setIsWaking] = useState(false);
  const [blinkPattern, setBlinkPattern] = useState<BlinkPattern>('none');
  const [blinkLead, setBlinkLead] = useState<BlinkLead>('left');
  const prevStateRef = useRef<BuddyState>(currentState);
  const prevSleepyRef = useRef(false);
  const isBlushing = isPetted && petLevel >= 0.78;
  const emotionFaceState = getEmotionFaceState(emotionState);
  const messageFaceState = getMessageFaceState(message, currentState);
  const messageIntensity = getMessageIntensity(message, currentState, messageFaceState);
  const activeMoodFaceState = messageFaceState ?? emotionFaceState;
  const activeAmbientCue = ambientCue === 'none' ? null : ambientCue;
  const moodLevel = messageFaceState ? messageIntensity : emotionLevel;
  const calmBreathingLevel = (
    isDizzy ||
    isAnnoyed ||
    isPetted ||
    isSurprised ||
    isSleepy ||
    isWaking ||
    isBored ||
    !!activeMoodFaceState ||
    currentState === 'speaking' ||
    currentState === 'celebrating' ||
    currentState === 'error' ||
    currentState === 'sleeping'
  )
    ? 0
    : activeAmbientCue === 'invite'
      ? 0.72
      : activeAmbientCue === 'curious'
        ? 0.58
        : isHovered
          ? 0.46
          : currentState === 'thinking'
            ? 0.52
            : currentState === 'listening'
              ? 0.44
              : 0.34;

  useEffect(() => {
    const previousState = prevStateRef.current;
    const shouldSurprise = !isDizzy && !isPetted && !isAnnoyed && (
      (currentState === 'listening' && previousState !== 'listening') ||
      (currentState === 'speaking' && previousState !== 'speaking') ||
      (currentState === 'celebrating' && previousState !== 'celebrating')
    );
    prevStateRef.current = currentState;

    if (!shouldSurprise) return;

    setIsSurprised(true);
    const timeout = setTimeout(() => setIsSurprised(false), 480);
    return () => clearTimeout(timeout);
  }, [currentState, isAnnoyed, isDizzy, isPetted]);

  useEffect(() => {
    const wasSleepy = prevSleepyRef.current;
    prevSleepyRef.current = isSleepy;

    if (
      !wasSleepy ||
      isSleepy ||
      isDizzy ||
      isAnnoyed ||
      (!isHovered && !isPetted && currentState === 'idle' && audioLevel <= 0.03)
    ) {
      return;
    }

    setIsWaking(true);
    const timeout = setTimeout(() => setIsWaking(false), 460);
    return () => clearTimeout(timeout);
  }, [audioLevel, currentState, isAnnoyed, isDizzy, isHovered, isPetted, isSleepy]);

  useEffect(() => {
    if (
      isDizzy ||
      isAnnoyed ||
      isPetted ||
      isSurprised ||
      isSleepy ||
      isWaking ||
      isBored ||
      isMischief ||
      !!activeMoodFaceState ||
      !['idle', 'listening', 'thinking'].includes(currentState)
    ) {
      if (blinkPattern !== 'none') setBlinkPattern('none');
      return;
    }

    if (blinkPattern !== 'none') return;

    let resetTimeout: ReturnType<typeof setTimeout> | null = null;
    const delay = activeAmbientCue === 'invite'
      ? 1400 + Math.random() * 1200
      : activeAmbientCue === 'curious'
        ? 1200 + Math.random() * 900
        : isHovered
          ? 1800 + Math.random() * 1400
          : currentState === 'listening'
            ? 2400 + Math.random() * 1800
            : currentState === 'thinking'
              ? 2600 + Math.random() * 2200
              : 3200 + Math.random() * 2600;

    const startTimeout = setTimeout(() => {
      const nextPattern: BlinkPattern = (
        activeAmbientCue === 'invite' ||
        isHovered ||
        currentState === 'listening'
      ) && Math.random() < 0.34
        ? 'double'
        : 'soft';
      setBlinkLead(Math.random() > 0.5 ? 'left' : 'right');
      setBlinkPattern(nextPattern);
      resetTimeout = setTimeout(() => setBlinkPattern('none'), nextPattern === 'double' ? 440 : 220);
    }, delay);

    return () => {
      clearTimeout(startTimeout);
      if (resetTimeout) clearTimeout(resetTimeout);
    };
  }, [activeAmbientCue, activeMoodFaceState, blinkPattern, currentState, isAnnoyed, isBored, isDizzy, isHovered, isMischief, isPetted, isSleepy, isSurprised, isWaking]);

  useEffect(() => {
    if (
      isDizzy ||
      isAnnoyed ||
      isPetted ||
      isSurprised ||
      isSleepy ||
      isWaking ||
      isBored ||
      !!activeMoodFaceState ||
      !!activeAmbientCue ||
      !['idle', 'listening', 'thinking'].includes(currentState)
    ) {
      setIsMischief(false);
      return;
    }

    let endTimeout: ReturnType<typeof setTimeout> | null = null;
    const delay = isHovered
      ? 1400 + Math.random() * 2200
      : currentState === 'idle'
        ? 3600 + Math.random() * 4200
        : 2400 + Math.random() * 3000;

    const startTimeout = setTimeout(() => {
      setWinkSide(Math.random() > 0.5 ? 'left' : 'right');
      setIsMischief(true);
      endTimeout = setTimeout(() => setIsMischief(false), 760);
    }, delay);

    return () => {
      clearTimeout(startTimeout);
      if (endTimeout) clearTimeout(endTimeout);
    };
  }, [activeAmbientCue, activeMoodFaceState, currentState, isAnnoyed, isBored, isDizzy, isHovered, isPetted, isSleepy, isSurprised, isWaking]);

  useEffect(() => {
    if (
      isDizzy ||
      isAnnoyed ||
      isPetted ||
      isSurprised ||
      !!activeMoodFaceState ||
      !!activeAmbientCue ||
      isMischief ||
      isWaking ||
      isSleepy ||
      isHovered ||
      currentState !== 'idle' ||
      audioLevel > 0.03 ||
      Math.abs(gazeOffset.x) > 0.4 ||
      Math.abs(gazeOffset.y) > 0.4
    ) {
      setIsBored(false);
      return;
    }

    const timeout = setTimeout(() => setIsBored(true), 7200);
    return () => clearTimeout(timeout);
  }, [activeAmbientCue, activeMoodFaceState, audioLevel, currentState, gazeOffset.x, gazeOffset.y, isAnnoyed, isBored, isDizzy, isHovered, isMischief, isPetted, isSleepy, isSurprised, isWaking]);

  useEffect(() => {
    if (
      isDizzy ||
      isAnnoyed ||
      isPetted ||
      isSurprised ||
      !!activeMoodFaceState ||
      !!activeAmbientCue ||
      isMischief ||
      isWaking ||
      isHovered ||
      currentState !== 'idle' ||
      audioLevel > 0.02 ||
      Math.abs(gazeOffset.x) > 0.2 ||
      Math.abs(gazeOffset.y) > 0.2
    ) {
      setIsSleepy(false);
      return;
    }

    const timeout = setTimeout(() => setIsSleepy(true), 18000);
    return () => clearTimeout(timeout);
  }, [activeAmbientCue, activeMoodFaceState, audioLevel, currentState, gazeOffset.x, gazeOffset.y, isAnnoyed, isDizzy, isHovered, isMischief, isPetted, isSurprised, isWaking]);

  const color = isDizzy
    ? "#facc15"
    : isAnnoyed
      ? "#f97316"
      : isBlushing
        ? "#fb7185"
        : isPetted
      ? "#fb7185"
      : isSurprised
        ? "#f8fafc"
        : activeMoodFaceState
          ? EMOTION_COLORS[activeMoodFaceState]
        : activeAmbientCue
          ? AMBIENT_COLORS[activeAmbientCue]
        : isSleepy
          ? "#60a5fa"
        : isBored
          ? "#94a3b8"
          : STATE_COLORS[currentState];

  const shellAnimate = isDizzy
    ? { borderColor: `${color}55`, rotate: [0, -2.5 * dizzyLevel, 2.5 * dizzyLevel, -1.5 * dizzyLevel, 1.5 * dizzyLevel, 0], scale: [1, 0.98, 1.01, 0.99, 1] }
    : isAnnoyed
      ? { borderColor: `${color}60`, rotate: [0, -1.8, 1.8, -1.1, 1.1, 0], scale: [1, 1.014, 0.996, 1] }
      : currentState === 'celebrating'
        ? { borderColor: `${color}58`, rotate: [0, -0.9, 0.9, -0.4, 0], scale: [1, 1.022 + messageIntensity * 0.02, 1] }
      : activeAmbientCue === 'invite'
        ? { borderColor: `${color}48`, rotate: [0, -0.5, 0.5, 0], scale: [1, 1.02, 1] }
        : activeAmbientCue === 'curious'
          ? { borderColor: `${color}42`, rotate: [0, -0.9, 0.9, 0], scale: [1, 1.014, 1] }
      : isWaking
        ? { borderColor: `${color}68`, rotate: [0, -1.4, 1.2, 0], scale: [0.97, 1.05, 1] }
      : isBlushing
        ? { borderColor: `${color}58`, rotate: [0, -0.6, 0.6, 0], scale: [1, 1.024, 1] }
    : activeMoodFaceState === 'amped'
      ? { borderColor: `${color}60`, rotate: [0, -1, 1, 0], scale: [1, 1.024, 1] }
      : activeMoodFaceState === 'cheery'
        ? { borderColor: `${color}50`, rotate: [0, -0.5, 0.5, 0], scale: [1, 1.018, 1] }
        : activeMoodFaceState === 'tense'
          ? { borderColor: `${color}55`, rotate: [0, -1.1, 1.1, -0.5, 0], scale: [1, 1.008, 0.998, 1] }
          : activeMoodFaceState === 'worn'
            ? { borderColor: `${color}32`, rotate: -1.4, scale: [1, 0.992, 1] }
            : activeMoodFaceState === 'bashful'
              ? { borderColor: `${color}42`, rotate: [0, -0.7, 0.7, 0], scale: [1, 1.014, 1] }
    : isSurprised
      ? { borderColor: `${color}60`, rotate: [0, -1.4, 1.4, 0], scale: [1, 1.035, 1] }
      : isPetted
        ? { borderColor: `${color}55`, rotate: [0, -0.8, 0.8, 0], scale: [1, 1.02, 1] }
        : isSleepy
          ? { borderColor: `${color}32`, rotate: -1.2, scale: [1, 0.992, 1] }
        : isBored
          ? { borderColor: `${color}28`, rotate: -1.5, scale: 0.992 }
          : { borderColor: `${color}40`, rotate: 0, scale: 1 };

  const shellTransition = isDizzy
    ? { duration: Math.max(0.45, 0.9 - dizzyLevel * 0.25), repeat: Infinity, ease: "easeInOut" as const }
    : isAnnoyed
      ? { duration: Math.max(0.18, 0.34 - annoyedLevel * 0.08), repeat: Infinity, ease: "easeInOut" as const }
      : currentState === 'celebrating'
        ? { duration: Math.max(0.36, 0.54 - messageIntensity * 0.1), repeat: Infinity, ease: "easeInOut" as const }
      : activeAmbientCue === 'invite'
        ? { duration: 1.05, repeat: Infinity, ease: "easeInOut" as const }
        : activeAmbientCue === 'curious'
          ? { duration: 0.86, repeat: Infinity, ease: "easeInOut" as const }
      : isWaking
        ? { duration: 0.42, ease: "easeOut" as const }
      : isBlushing
        ? { duration: 0.7, repeat: Infinity, ease: "easeInOut" as const }
    : activeMoodFaceState === 'amped'
      ? { duration: 0.42, repeat: Infinity, ease: "easeInOut" as const }
      : activeMoodFaceState === 'cheery'
        ? { duration: 0.65, repeat: Infinity, ease: "easeInOut" as const }
        : activeMoodFaceState === 'tense'
          ? { duration: 0.36, repeat: Infinity, ease: "easeInOut" as const }
          : activeMoodFaceState === 'worn'
            ? { duration: 2.4, repeat: Infinity, ease: "easeInOut" as const }
            : activeMoodFaceState === 'bashful'
              ? { duration: 0.82, repeat: Infinity, ease: "easeInOut" as const }
    : isSurprised
      ? { duration: 0.34, ease: "easeOut" as const }
      : isPetted
        ? { duration: 0.4, ease: "easeInOut" as const }
        : isSleepy
          ? { duration: 2.4, repeat: Infinity, ease: "easeInOut" as const }
        : { duration: 0.5 };

  return (
    <div className={cn("relative flex items-center justify-center", className)}>
      <motion.div
        className="relative z-10 w-full h-full rounded-2xl bg-[var(--missi-surface-secondary)] border overflow-hidden"
        animate={shellAnimate}
        transition={shellTransition}
      >
        {/* Screen Glass Reflection */}
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-tr from-white/10 to-transparent pointer-events-none z-20" />
        <div className="absolute top-[5%] left-[10%] w-[80%] h-[30%] bg-gradient-to-b from-white/10 to-transparent rounded-full blur-[1px] pointer-events-none z-20" />
        
        {/* LED Grid / Dots Overlay */}

        {/* Ambient Screen Glow */}
        <motion.div 
          className="absolute inset-0 blur-2xl z-0"
          animate={calmBreathingLevel > 0
            ? {
                backgroundColor: color,
                scale: [0.97, 1.01 + calmBreathingLevel * 0.025, 0.98],
                opacity: [0.08, 0.11 + calmBreathingLevel * 0.05, 0.08],
              }
            : { backgroundColor: color, scale: 1, opacity: 0.1 }}
          transition={calmBreathingLevel > 0
            ? { duration: Math.max(2.1, 3.2 - calmBreathingLevel * 0.9), repeat: Infinity, ease: "easeInOut" as const }
            : { duration: 0.5 }}
        />

        {/* The Face */}
        <LEDFace
          state={currentState}
          color={color}
          audioLevel={audioLevel}
          isDizzy={isDizzy}
          dizzyLevel={dizzyLevel}
          isPetted={isPetted}
          petLevel={petLevel}
          isAnnoyed={isAnnoyed}
          annoyedLevel={annoyedLevel}
          emotionFaceState={activeMoodFaceState}
          emotionLevel={moodLevel}
          ambientCue={ambientCue}
          ambientCueLevel={ambientCueLevel}
          messageIntensity={messageIntensity}
          blinkPattern={blinkPattern}
          blinkLead={blinkLead}
          isMischief={isMischief}
          winkSide={winkSide}
          isWaking={isWaking}
          isSurprised={isSurprised}
          isBored={isBored}
          isSleepy={isSleepy}
          gazeOffset={gazeOffset}
          isHovered={isHovered}
          tilt={tilt}
        />
        
      </motion.div>
    </div>
  );
}
