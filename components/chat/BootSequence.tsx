"use client"

import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"

interface BootSequenceProps {
  userName: string
  onComplete: () => void
}

const BOOT_LOGS = [
  "INITIALIZING MISSI CORE...",
  "ESTABLISHING NEURAL LINK...",
  "CONNECTING TO MEMORY GRAPH...",
  "LOADING PERSONALITY MATRIX...",
  "SYSTEM ONLINE.",
]

export function BootSequence({ userName, onComplete }: BootSequenceProps) {
  const [currentLine, setCurrentLine] = useState(0)
  const [showGreeting, setShowGreeting] = useState(false)
  const [fadeAll, setFadeAll] = useState(false)

  useEffect(() => {
    // 1. Play through the boot logs
    const interval = setInterval(() => {
      setCurrentLine((prev) => {
        if (prev < BOOT_LOGS.length - 1) return prev + 1
        clearInterval(interval)
        return prev
      })
    }, 450) // Speed of typing log appearance

    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (currentLine === BOOT_LOGS.length - 1) {
      // 2. Pause, then show Greeting
      const t1 = setTimeout(() => {
        setShowGreeting(true)
      }, 700)

      // 3. Pause, then fade everything out
      const t2 = setTimeout(() => {
        setFadeAll(true)
      }, 2400)

      // 4. Finally, unmount component via callback
      const t3 = setTimeout(() => {
        onComplete()
      }, 3200)

      return () => {
        clearTimeout(t1)
        clearTimeout(t2)
        clearTimeout(t3)
      }
    }
  }, [currentLine, onComplete])

  return (
    <AnimatePresence>
      {!fadeAll && (
        <motion.div
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, filter: "blur(20px)" }}
          transition={{ duration: 0.8, ease: "easeInOut" }}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black overflow-hidden select-none pointer-events-none"
        >
          {/* Subtle noise/grid background */}
          <div 
            className="absolute inset-0 opacity-[0.03]" 
            style={{ backgroundImage: "linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)", backgroundSize: "40px 40px" }} 
          />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-xl px-8 flex flex-col gap-2 z-10 font-mono text-xs sm:text-sm tracking-widest text-[#00ffcc] opacity-70">
            {BOOT_LOGS.map((log, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: i <= currentLine ? 1 : 0, x: i <= currentLine ? 0 : -10 }}
                transition={{ duration: 0.1 }}
                style={{ textShadow: "0 0 8px rgba(0, 255, 204, 0.4)" }}
              >
                {i <= currentLine && `> ${log}`}
              </motion.div>
            ))}
          </div>

          <AnimatePresence>
            {showGreeting && (
              <motion.div
                initial={{ opacity: 0, filter: "blur(10px)", scale: 0.95 }}
                animate={{ opacity: 1, filter: "blur(0px)", scale: 1 }}
                exit={{ opacity: 0, filter: "blur(10px)", scale: 0.95 }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                className="absolute z-20 flex flex-col items-center justify-center"
              >
                <div className="text-3xl sm:text-4xl md:text-5xl tracking-widest text-white font-mono uppercase mb-2 drop-shadow-[0_0_12px_rgba(255,255,255,0.4)]">
                  Hello {userName}
                </div>
                <div className="w-12 h-[1px] bg-white/40 mb-3" />
                <div className="text-xs tracking-[0.3em] text-white/50 uppercase">
                  I am ready.
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
