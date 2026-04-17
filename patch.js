const fs = require('fs');
let code = fs.readFileSync('hooks/useVoiceStateMachine.ts', 'utf8');

const searchStr = `  // BUG-M1 fix: debounce rapid taps. Two fast taps both see state="idle" (React
  // state, read synchronously) before the first startRecording() updates it.
  // isTransitioningRef blocks the second startRecording body, but continuousRef
  // was still being set twice. A 150ms guard prevents duplicate dispatch.
  const lastTapTimeRef = useRef(0)

  const handleTap = useCallback(() => {
    const now = Date.now()
    if (now - lastTapTimeRef.current < 150) return
    lastTapTimeRef.current = now

    if (state === "idle") {
      continuousRef.current = true
      fnRef.current.startRecording()
    } else if (state === "speaking" || state === "thinking") {
      // Interrupt current operation and start recording
      cancelAbort()
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause()
        audioPlayerRef.current = null
      }
      stopTTSMonitor()
      continuousRef.current = true
      isTransitioningRef.current = false
      fnRef.current.startRecording()
    } else {
      // recording or transcribing → full stop
      cancelAll()
    }
  }, [state, cancelAbort, stopTTSMonitor, cancelAll])`;

const replaceStr = `  // BUG-M1 fix: debounce rapid taps. Two fast taps both see state="idle" (React
  // state, read synchronously) before the first startRecording() updates it.
  // isTransitioningRef blocks the second startRecording body, but continuousRef
  // was still being set twice. A 150ms guard prevents duplicate dispatch.
  const lastTapTimeRef = useRef(0)

  const handleTap = useCallback(() => {
    // Check transition immediately to prevent duplicated continuousRef settings
    if (isTransitioningRef.current) return

    const now = Date.now()
    if (now - lastTapTimeRef.current < 150) return
    lastTapTimeRef.current = now

    // Use stateRef.current for immediate synchronous state checking,
    // bypassing React's batched state updates to prevent stale closures.
    const currentState = stateRef.current

    if (currentState === "idle") {
      continuousRef.current = true
      fnRef.current.startRecording()
    } else if (currentState === "speaking" || currentState === "thinking") {
      // Interrupt current operation and start recording
      cancelAbort()
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause()
        audioPlayerRef.current = null
      }
      stopTTSMonitor()
      continuousRef.current = true
      isTransitioningRef.current = false
      fnRef.current.startRecording()
    } else {
      // recording or transcribing → full stop
      cancelAll()
    }
  }, [cancelAbort, stopTTSMonitor, cancelAll])`;

if (code.includes(searchStr)) {
  code = code.replace(searchStr, replaceStr);
  fs.writeFileSync('hooks/useVoiceStateMachine.ts', code);
  console.log("Successfully replaced");
} else {
  console.log("Could not find the string exactly as formatted.");
}
