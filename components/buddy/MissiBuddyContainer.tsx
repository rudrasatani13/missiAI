'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence, type PanInfo } from 'framer-motion';
import { MissiLEDFace } from './MissiLEDFace';
import { useBuddyState } from '@/hooks/buddy/useBuddyState';

type AmbientCueState = 'none' | 'curious' | 'invite';

export function MissiBuddyContainer() {
  const pathname = usePathname();
  const containerRef = useRef<HTMLDivElement>(null);
  const faceRef = useRef<HTMLDivElement>(null);
  const releaseResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ambientMoveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ambientResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draggingRef = useRef(false);
  const dragAgitationRef = useRef(0);
  const [mounted, setMounted] = useState(false);
  const [constraints, setConstraints] = useState({ left: 0, right: 0, top: 0, bottom: 0 });
  const [gazeOffset, setGazeOffset] = useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);
  const [tilt, setTilt] = useState(0);
  const [ambientCue, setAmbientCue] = useState<AmbientCueState>('none');
  const [ambientCueLevel, setAmbientCueLevel] = useState(0);
  const [isCompactViewport, setIsCompactViewport] = useState(false);
  const { message, clearMessage, currentState, isAnnoyed, annoyedLevel, isExpanded, setExpanded, triggerAnnoyed, triggerDizzy, triggerPet } = useBuddyState();

  const clearAmbientCue = useCallback(() => {
    setAmbientCue('none');
    setAmbientCueLevel(0);
  }, []);

  // Prevent hydration mismatch on global mount
  useEffect(() => {
    setMounted(true);
    const updateConstraints = () => {
      if (typeof window !== 'undefined') {
        const compact = window.innerWidth < 768;
        const isChatRoute = pathname.startsWith('/chat');
        const horizontalPadding = compact ? 16 : 24;
        const topPadding = compact ? 16 : 24;
        const bottomPadding = compact ? (isChatRoute ? 112 : 24) : 24;
        const width = compact ? 56 : 64;
        const height = compact ? 56 : 64;
        const maxHorizontalTravel = Math.max(0, window.innerWidth - width - horizontalPadding * 2);
        const maxVerticalTravel = Math.max(0, window.innerHeight - height - topPadding - bottomPadding);

        setIsCompactViewport(compact);

        // We set constraints relative to its starting position (x:0, y:0 is bottom-right)
        setConstraints({
          left: -maxHorizontalTravel, // Max drag to the left
          right: 0, // Cannot drag further right than the starting padding
          top: -maxVerticalTravel, // Max drag to the top
          bottom: 0 // Cannot drag further down than starting padding
        });
      }
    };

    updateConstraints();
    window.addEventListener('resize', updateConstraints);
    return () => {
      window.removeEventListener('resize', updateConstraints);
      if (releaseResetRef.current) clearTimeout(releaseResetRef.current);
      if (ambientMoveRef.current) clearTimeout(ambientMoveRef.current);
      if (ambientResetRef.current) clearTimeout(ambientResetRef.current);
    };
  }, [pathname]);

  useEffect(() => {
    if (!mounted || isHovered || draggingRef.current) return;
    if (!['idle', 'thinking', 'listening'].includes(currentState)) return;

    const scheduleAmbientMove = () => {
      const delay = currentState === 'thinking'
        ? 900 + Math.random() * 1100
        : currentState === 'listening'
          ? 800 + Math.random() * 900
          : 1400 + Math.random() * 2000;

      ambientMoveRef.current = setTimeout(() => {
        if (draggingRef.current || isHovered) return;

        const roll = Math.random();
        const isInviteCue = currentState === 'idle' && roll < 0.14;
        const isCuriousCue = !isInviteCue && (
          currentState === 'idle'
            ? roll < 0.34
            : currentState === 'listening'
              ? roll < 0.22
              : roll < 0.18
        );

        if (isInviteCue || isCuriousCue) {
          const cue: AmbientCueState = isInviteCue ? 'invite' : 'curious';
          const level = cue === 'invite'
            ? 0.55 + Math.random() * 0.28
            : 0.44 + Math.random() * 0.36;
          const direction = Math.random() > 0.5 ? 1 : -1;
          const x = cue === 'invite'
            ? direction * (2.8 + level * 2.2)
            : direction * (5.4 + level * 3.4);
          const y = cue === 'invite'
            ? -2.8 - level * 1.6
            : -0.8 - Math.random() * 3.2;

          setAmbientCue(cue);
          setAmbientCueLevel(level);
          setGazeOffset({ x, y });
          setTilt(Math.max(-4.8, Math.min(4.8, x * (cue === 'invite' ? 0.28 : 0.42))));

          if (ambientResetRef.current) clearTimeout(ambientResetRef.current);
          ambientResetRef.current = setTimeout(() => {
            if (!draggingRef.current && !isHovered) {
              clearAmbientCue();
              setGazeOffset({ x: 0, y: 0 });
              setTilt(0);
            }
          }, cue === 'invite' ? 760 + level * 240 : 620 + level * 240);

          scheduleAmbientMove();
          return;
        }

        clearAmbientCue();

        const amplitude = currentState === 'thinking' ? 7.5 : currentState === 'listening' ? 5.5 : 4.5;
        const verticalAmplitude = currentState === 'thinking' ? 4.5 : 3.2;
        const x = (Math.random() * 2 - 1) * amplitude;
        const y = (Math.random() * 2 - 1) * verticalAmplitude;

        setGazeOffset({ x, y });
        setTilt(Math.max(-4.5, Math.min(4.5, x * 0.45)));

        if (ambientResetRef.current) clearTimeout(ambientResetRef.current);
        ambientResetRef.current = setTimeout(() => {
          if (!draggingRef.current && !isHovered) {
            clearAmbientCue();
            setGazeOffset({ x: 0, y: 0 });
            setTilt(0);
          }
        }, 180 + Math.random() * 220);

        scheduleAmbientMove();
      }, delay);
    };

    scheduleAmbientMove();

    return () => {
      if (ambientMoveRef.current) clearTimeout(ambientMoveRef.current);
      if (ambientResetRef.current) clearTimeout(ambientResetRef.current);
      clearAmbientCue();
    };
  }, [clearAmbientCue, currentState, isHovered, mounted, pathname]);

  if (!mounted) return null;

  const scheduleResetPose = (delayMs: number) => {
    clearAmbientCue();
    if (releaseResetRef.current) clearTimeout(releaseResetRef.current);
    releaseResetRef.current = setTimeout(() => {
      setGazeOffset({ x: 0, y: 0 });
      setTilt(0);
    }, delayMs);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = faceRef.current?.getBoundingClientRect();
    if (!rect) return;

    clearAmbientCue();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const x = Math.max(-8, Math.min(8, ((event.clientX - centerX) / (rect.width / 2)) * 6.5));
    const y = Math.max(-6, Math.min(6, ((event.clientY - centerY) / (rect.height / 2)) * 5.5));
    setGazeOffset({ x, y });
    setTilt(Math.max(-5, Math.min(5, x * 0.6)));
  };

  const handleDragStart = () => {
    draggingRef.current = true;
    dragAgitationRef.current = 0;
    clearAmbientCue();
  };

  const handleDrag = (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    draggingRef.current = true;
    clearAmbientCue();
    dragAgitationRef.current = Math.min(
      1.2,
      dragAgitationRef.current
        + Math.hypot(info.delta.x, info.delta.y) / 160
        + Math.hypot(info.velocity.x, info.velocity.y) / 13000,
    );
    const x = Math.max(-10, Math.min(10, info.velocity.x / 220));
    const y = Math.max(-8, Math.min(8, info.velocity.y / 220));
    setGazeOffset({ x, y });
    setTilt(Math.max(-7, Math.min(7, info.velocity.x / 170)));
  };

  const handleDragEnd = (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    draggingRef.current = false;
    const speed = Math.hypot(info.velocity.x, info.velocity.y);
    const agitation = Math.max(
      dragAgitationRef.current,
      Math.min(1.1, Math.hypot(info.offset.x, info.offset.y) / 180 + speed / 4200),
    );
    dragAgitationRef.current = 0;
    if (speed < 1400) {
      if (agitation > 0.62) {
        const intensity = Math.min(1, 0.34 + agitation * 0.58);
        const durationMs = Math.round(850 + intensity * 800);
        triggerAnnoyed(intensity, durationMs);
        scheduleResetPose(durationMs);
        return;
      }
      scheduleResetPose(180);
      return;
    }

    const intensity = Math.min(1, 0.35 + (speed - 1400) / 2200);
    const durationMs = Math.round(1200 + intensity * 900);
    triggerDizzy(intensity, durationMs);
    scheduleResetPose(durationMs);
  };

  const faceAnimate = isAnnoyed
    ? { x: [0, -1.6 - annoyedLevel, 1.5 + annoyedLevel, -0.9, 0], y: [0, -0.6, 0.4, 0], rotate: [0, -2.4, 2.2, -1.2, 0], scale: [1, 1.012, 0.998, 1] }
    : ambientCue === 'invite'
    ? { y: [0, -1.8 - ambientCueLevel, 0], rotate: [0, tilt * 0.1, 0], scale: [1, 1.026 + ambientCueLevel * 0.015, 1] }
    : ambientCue === 'curious'
      ? { y: [0, -0.8, 0], rotate: [tilt * 0.12, tilt * 0.2 + Math.sign(tilt || 1) * 0.8, tilt * 0.12], scale: [1, 1.012, 1] }
    : currentState === 'celebrating'
    ? { y: [0, -4.5, 0, -3, 0], rotate: [0, -4, 4, -2, 0], scale: [1, 1.06, 1, 1.03, 1] }
    : currentState === 'speaking'
      ? { y: [0, -1.5, 0.75, 0], rotate: [0, 1.6, -1.3, 0], scale: [1, 1.018, 1] }
      : isHovered
        ? { y: -1.2, rotate: tilt * 0.08, scale: 1.025 }
        : { y: 0, rotate: 0, scale: 1 };

  const faceTransition = isAnnoyed
    ? { duration: Math.max(0.18, 0.34 - annoyedLevel * 0.08), repeat: Infinity, ease: 'easeInOut' as const }
    : ambientCue === 'invite'
    ? { duration: 1.05, repeat: Infinity, ease: 'easeInOut' as const }
    : ambientCue === 'curious'
      ? { duration: 0.82, repeat: Infinity, ease: 'easeInOut' as const }
    : currentState === 'celebrating'
    ? { duration: 0.65, repeat: Infinity, ease: 'easeInOut' as const }
    : currentState === 'speaking'
      ? { duration: 0.34, repeat: Infinity, ease: 'easeInOut' as const }
      : { type: 'spring' as const, bounce: 0.35, damping: 12 };

  const isChatRoute = pathname.startsWith('/chat');
  const containerStyle = isCompactViewport
    ? {
        bottom: isChatRoute
          ? 'calc(env(safe-area-inset-bottom) + 5.75rem)'
          : 'calc(env(safe-area-inset-bottom) + 1rem)',
        right: 'calc(env(safe-area-inset-right) + 0.75rem)',
      }
    : undefined;

  return (
    <motion.div
      ref={containerRef}
      className="fixed bottom-6 right-6 z-[260] flex flex-col items-end gap-3 cursor-grab active:cursor-grabbing pointer-events-auto"
      style={containerStyle}
      drag
      dragConstraints={constraints}
      dragElastic={0.1}
      dragMomentum={false}
      onDragStart={handleDragStart}
      onDrag={handleDrag}
      onDragEnd={handleDragEnd}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
    >
      {/* Speech Bubble / Notification Bubble */}
      <AnimatePresence>
        {message && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.9 }}
            className="max-w-[200px] bg-white/10 backdrop-blur-xl border border-white/20 text-sm text-white px-4 py-2 rounded-2xl rounded-br-none shadow-2xl relative"
          >
            {message}
            <button 
              onClick={() => clearMessage()}
              className="absolute -top-2 -right-2 bg-black/50 border border-white/20 rounded-full w-5 h-5 flex items-center justify-center text-[10px] hover:bg-white/20"
            >
              ✕
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* The Buddy Face */}
      <motion.div 
        ref={faceRef}
        onClick={() => {
          triggerPet(0.82, 1250);
          setExpanded(!isExpanded);
        }}
        onPointerEnter={() => {
          clearAmbientCue();
          setIsHovered(true);
        }}
        onPointerLeave={() => {
          setIsHovered(false);
          scheduleResetPose(60);
        }}
        onPointerMove={handlePointerMove}
        className="relative cursor-pointer"
        animate={faceAnimate}
        transition={faceTransition}
      >
        <MissiLEDFace className={isCompactViewport ? "w-14 h-14" : "w-16 h-16"} gazeOffset={gazeOffset} isHovered={isHovered} tilt={tilt} ambientCue={ambientCue} ambientCueLevel={ambientCueLevel} />
      </motion.div>
    </motion.div>
  );
}
