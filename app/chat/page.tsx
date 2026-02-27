"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import Link from "next/link"
import Image from "next/image"
import { ArrowLeft, Plus, Square } from "lucide-react"

/* ─────────────────────────────────────────────────
   Starfield Canvas — MINIMAL & SLOW
   ───────────────────────────────────────────────── */
function StarfieldCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    let animId: number

    interface Star {
      x: number; y: number
      size: number; brightness: number; twinkleSpeed: number; twinkleOffset: number
    }
    interface ShootingStar {
      x: number; y: number; vx: number; vy: number
      brightness: number; life: number; maxLife: number
    }

    let stars: Star[] = []
    let shootingStars: ShootingStar[] = []

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
      initStars()
    }

    const initStars = () => {
      stars = []
      const count = window.innerWidth < 768 ? 80 : 160
      for (let i = 0; i < count; i++) {
        stars.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          size: Math.random() * 1.4 + 0.3,
          brightness: Math.random() * 0.5 + 0.15,
          twinkleSpeed: Math.random() * 0.003 + 0.001,
          twinkleOffset: Math.random() * Math.PI * 2,
        })
      }
    }

    const spawnShootingStar = () => {
      if (Math.random() > 0.001) return
      const sx = Math.random() * canvas.width
      const angle = Math.PI / 4 + Math.random() * 0.6
      const speed = 4 + Math.random() * 4
      const ml = 60 + Math.random() * 60
      shootingStars.push({
        x: sx, y: -20,
        vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        brightness: 1, life: ml, maxLife: ml,
      })
    }

    const draw = (t: number) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      for (const s of stars) {
        const b = s.brightness * (0.7 + 0.3 * Math.sin(t * s.twinkleSpeed + s.twinkleOffset))
        ctx.fillStyle = `rgba(255,255,255,${b})`
        ctx.beginPath()
        ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2)
        ctx.fill()
      }

      spawnShootingStar()
      for (let i = shootingStars.length - 1; i >= 0; i--) {
        const ss = shootingStars[i]
        ss.x += ss.vx; ss.y += ss.vy; ss.life--
        const alpha = (ss.life / ss.maxLife) * ss.brightness
        const tl = 18
        const grad = ctx.createLinearGradient(ss.x, ss.y, ss.x - ss.vx * tl, ss.y - ss.vy * tl)
        grad.addColorStop(0, `rgba(255,255,255,${alpha})`)
        grad.addColorStop(0.4, `rgba(200,215,255,${alpha * 0.6})`)
        grad.addColorStop(1, "transparent")
        ctx.strokeStyle = grad
        ctx.lineWidth = 1.5
        ctx.lineCap = "round"
        ctx.beginPath()
        ctx.moveTo(ss.x, ss.y)
        ctx.lineTo(ss.x - ss.vx * tl, ss.y - ss.vy * tl)
        ctx.stroke()
        if (ss.life <= 0) shootingStars.splice(i, 1)
      }

      animId = requestAnimationFrame(draw)
    }

    resize()
    animId = requestAnimationFrame(draw)
    window.addEventListener("resize", resize)
    return () => {
      cancelAnimationFrame(animId)
      window.removeEventListener("resize", resize)
    }
  }, [])

  return <canvas ref={canvasRef} className="fixed inset-0 w-full h-full pointer-events-none" style={{ zIndex: 0 }} />
}

/* ─────────────────────────────────────────────────
   Typing Indicator
   ───────────────────────────────────────────────── */
function TypingIndicator() {
  return (
    <div className="flex gap-1 items-center py-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-1.5 h-1.5 rounded-full"
          style={{
            background: "rgba(255,255,255,0.4)",
            animation: `typingBounce 1.2s ease-in-out ${i * 0.15}s infinite`,
          }}
        />
      ))}
    </div>
  )
}

/* ─────────────────────────────────────────────────
   Icons
   ───────────────────────────────────────────────── */
function SparkleIcon({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 3L13.5 8.5L19 10L13.5 11.5L12 17L10.5 11.5L5 10L10.5 8.5L12 3Z" />
      <path d="M19 15L19.88 17.12L22 18L19.88 18.88L19 21L18.12 18.88L16 18L18.12 17.12L19 15Z" opacity="0.5" />
      <path d="M5 17L5.63 18.37L7 19L5.63 19.63L5 21L4.37 19.63L3 19L4.37 18.37L5 17Z" opacity="0.35" />
    </svg>
  )
}

function MicIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0" />
      <line x1="12" y1="19" x2="12" y2="22" />
      <line x1="8" y1="22" x2="16" y2="22" />
    </svg>
  )
}

function SendArrowIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 19V5" />
      <path d="M5 12L12 5L19 12" />
    </svg>
  )
}

/* ─────────────────────────────────────────────────
   Simulated AI responses
   ───────────────────────────────────────────────── */
const AI_RESPONSES = [
  "That's a fascinating question. Let me think through this carefully for you — missiAI is designed to bring deep, thoughtful reasoning to every conversation.",
  "I appreciate you bringing that up. Here's my perspective: the intersection of memory and intelligence is what makes truly personalized assistance possible.",
  "Great point. From my analysis, there are several dimensions worth exploring here. Let me walk you through the key considerations.",
  "Interesting. I've processed your request and here's what I'd recommend — balancing innovation with practical implementation is always the sweet spot.",
  "I understand completely. Let me provide a thorough breakdown that addresses each aspect of your question with the depth it deserves.",
  "That's exactly the kind of challenge missiAI was built for. Here's how I'd approach it, drawing on contextual understanding and adaptive reasoning.",
]

const SUGGESTIONS = [
  "What can missiAI do?",
  "Tell me about AI with Memory",
  "Help me brainstorm ideas",
  "Write something creative",
]

/* ─────────────────────────────────────────────────
   Input Bar Component (reused in both states)
   ───────────────────────────────────────────────── */
interface InputBarProps {
  input: string
  setInput: (v: string) => void
  onSend: () => void
  onMic: () => void
  onStop?: () => void
  isTyping: boolean
  isListening: boolean
  hasText: boolean
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>
  elevated?: boolean
}

function InputBar({ input, setInput, onSend, onMic, onStop, isTyping, isListening, hasText, textareaRef, elevated }: InputBarProps) {
  return (
    <div
      className="flex items-center gap-0 rounded-full transition-all duration-300 focus-within:border-white/20"
      style={{
        background: "rgba(255,255,255,0.05)",
        border: "1px solid rgba(255,255,255,0.1)",
        boxShadow: elevated ? "0 8px 32px rgba(0,0,0,0.3)" : "none",
        padding: "6px 6px 6px 4px",
        height: 52,
      }}
    >
      {/* + Button (left side) */}
      <button
        className="w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center transition-all duration-200"
        style={{
          color: "rgba(255,255,255,0.4)",
          background: "transparent",
          border: "none",
          cursor: "pointer",
        }}
      >
        <Plus className="w-5 h-5" />
      </button>

      {/* Textarea — left aligned next to + */}
      <textarea
        ref={textareaRef}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault()
            onSend()
          }
        }}
        placeholder="Ask anything"
        rows={1}
        className="flex-1 bg-transparent border-none text-sm font-light leading-6 placeholder:text-white/30 focus:outline-none resize-none"
        style={{
          color: "rgba(255,255,255,0.9)",
          minHeight: 24,
          maxHeight: 40,
          paddingTop: 7,
          paddingBottom: 7,
          textAlign: "left",
          paddingLeft: 0,
          marginLeft: 0,
        }}
      />

      {/* Mic Button */}
      <button
        onClick={onMic}
        className="w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center transition-all duration-200"
        style={{
          background: isListening ? "rgba(255,255,255,0.12)" : "transparent",
          border: "none",
          color: isListening ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.35)",
          animation: isListening ? "micPulse 1.5s ease-in-out infinite" : "none",
          cursor: "pointer",
        }}
      >
        <MicIcon />
      </button>

      {/* Send / Stop Button */}
      <button
        onClick={isTyping ? onStop : onSend}
        disabled={!hasText && !isTyping}
        className="w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center transition-all duration-200"
        style={{
          background: isTyping
            ? "rgba(255,255,255,0.15)"
            : hasText
              ? "rgba(255,255,255,0.9)"
              : "rgba(255,255,255,0.06)",
          border: "none",
          color: isTyping ? "#fff" : hasText ? "#000" : "rgba(255,255,255,0.15)",
          cursor: (!hasText && !isTyping) ? "default" : "pointer",
          boxShadow: hasText && !isTyping ? "0 2px 16px rgba(255,255,255,0.12)" : "none",
        }}
      >
        {isTyping ? <Square className="w-3.5 h-3.5" fill="currentColor" /> : <SendArrowIcon />}
      </button>
    </div>
  )
}

/* ─────────────────────────────────────────────────
   Main Chat Page
   ───────────────────────────────────────────────── */
interface Message {
  role: "user" | "assistant"
  content: string
  id: number
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [isTyping, setIsTyping] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [])

  useEffect(() => { scrollToBottom() }, [messages, isTyping, scrollToBottom])

  const simulateResponse = useCallback((userMsg: string) => {
    setIsTyping(true)
    const delay = 1200 + Math.random() * 1800
    setTimeout(() => {
      const resp = AI_RESPONSES[Math.floor(Math.random() * AI_RESPONSES.length)]
      setMessages((prev) => [...prev, { role: "assistant", content: resp, id: Date.now() }])
      setIsTyping(false)
    }, delay)
  }, [])

  const handleSend = useCallback(() => {
    const trimmed = input.trim()
    if (!trimmed || isTyping) return
    setMessages((prev) => [...prev, { role: "user", content: trimmed, id: Date.now() }])
    setInput("")
    simulateResponse(trimmed)
  }, [input, isTyping, simulateResponse])

  const handleSuggestion = useCallback((text: string) => {
    if (isTyping) return
    setMessages((prev) => [...prev, { role: "user", content: text, id: Date.now() }])
    simulateResponse(text)
  }, [isTyping, simulateResponse])

  const handleNewChat = useCallback(() => {
    setMessages([])
    setInput("")
    setIsTyping(false)
  }, [])

  const handleMic = useCallback(() => {
    setIsListening((prev) => !prev)
  }, [])

  const isEmpty = messages.length === 0
  const hasText = input.trim().length > 0

  return (
    <>
      <style jsx global>{`
        @keyframes typingBounce {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
          30% { transform: translateY(-6px); opacity: 0.9; }
        }
        @keyframes fadeSlideUp {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes subtlePulse {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 1; }
        }
        @keyframes micPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(255,255,255,0.15); }
          50% { box-shadow: 0 0 0 8px rgba(255,255,255,0); }
        }
        .msg-appear { animation: fadeSlideUp 0.35s ease-out both; }
        .chat-scroll::-webkit-scrollbar { width: 4px; }
        .chat-scroll::-webkit-scrollbar-track { background: transparent; }
        .chat-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 4px; }
        .chat-scroll::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }
      `}</style>

      <div className="fixed inset-0 bg-black flex flex-col font-inter">
        <StarfieldCanvas />

        {/* ── Header ─────────────────────────────────── */}
        <header
          className="relative z-10 flex items-center justify-between px-4 py-3 md:px-6 md:py-4"
          style={{
            borderBottom: "1px solid rgba(255,255,255,0.06)",
            background: "rgba(0,0,0,0.5)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
          }}
        >
          {/* Back button */}
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs md:text-sm transition-all duration-200 hover:bg-white/10"
            style={{
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.1)",
              color: "rgba(255,255,255,0.5)",
            }}
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Back</span>
          </Link>

          {/* ── LOGO — bigger with actual logo image ── */}
          <div className="flex items-center gap-3">
            <div className="relative w-8 h-8 md:w-9 md:h-9 select-none">
              <div
                className="absolute inset-0 z-10"
                onContextMenu={(e) => e.preventDefault()}
                onDragStart={(e) => e.preventDefault()}
              />
              <Image
                src="/images/logo-symbol.png"
                alt="missiAI Logo"
                width={36}
                height={36}
                className="w-8 h-8 md:w-9 md:h-9 opacity-90 select-none pointer-events-none"
                priority
                draggable={false}
                onContextMenu={(e) => e.preventDefault()}
                onDragStart={(e) => e.preventDefault()}
              />
            </div>
            <span className="text-base md:text-lg font-medium tracking-tight text-white">
              missi<span className="opacity-50">AI</span>
            </span>
          </div>

          {/* New chat button */}
          <button
            onClick={handleNewChat}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs md:text-sm transition-all duration-200 hover:bg-white/10"
            style={{
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.1)",
              color: "rgba(255,255,255,0.5)",
            }}
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">New</span>
          </button>
        </header>

        {/* ── Messages / Empty State ─────────────────── */}
        <div className="chat-scroll flex-1 overflow-y-auto relative z-[5] flex flex-col">
          {isEmpty ? (
            /* ── CENTERED EMPTY STATE ──────────── */
            <div className="flex-1 flex flex-col items-center justify-center px-5 gap-8">
              {/* Sparkle icon */}
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  animation: "subtlePulse 4s ease-in-out infinite",
                }}
              >
                <SparkleIcon size={28} className="text-white/50" />
              </div>

              <div className="text-center max-w-sm">
                <h1 className="text-xl md:text-2xl font-medium tracking-tight mb-2">
                  How can I help you today?
                </h1>
                <p className="text-xs md:text-sm font-light leading-relaxed" style={{ color: "rgba(255,255,255,0.35)" }}>
                  Start a conversation with missiAI — your intelligent assistant with memory.
                </p>
              </div>

              {/* ── CENTERED INPUT BAR ────────────── */}
              <div className="w-full max-w-xl">
                <InputBar
                  input={input}
                  setInput={setInput}
                  onSend={handleSend}
                  onMic={handleMic}
                  isTyping={isTyping}
                  isListening={isListening}
                  hasText={hasText}
                  textareaRef={textareaRef}
                  elevated
                />

                {/* Suggestions */}
                <div className="flex flex-wrap gap-2 justify-center mt-5">
                  {SUGGESTIONS.map((s, i) => (
                    <button
                      key={i}
                      onClick={() => handleSuggestion(s)}
                      className="px-4 py-2 rounded-full text-xs font-normal transition-all duration-200 hover:bg-white/[0.08] hover:border-white/[0.15]"
                      style={{
                        background: "rgba(255,255,255,0.04)",
                        border: "1px solid rgba(255,255,255,0.08)",
                        color: "rgba(255,255,255,0.45)",
                      }}
                    >
                      {s}
                    </button>
                  ))}
                </div>

                <p className="text-center text-[11px] font-light mt-4" style={{ color: "rgba(255,255,255,0.18)" }}>
                  missiAI may make mistakes. Verify important information.
                </p>
              </div>
            </div>
          ) : (
            /* ── Chat messages ────────────────────── */
            <div className="max-w-2xl w-full mx-auto px-4 md:px-5 py-6 flex flex-col gap-1.5 flex-1">
              {messages.map((msg, idx) => (
                <div
                  key={msg.id}
                  className="msg-appear flex"
                  style={{
                    justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
                    animationDelay: `${idx * 0.04}s`,
                  }}
                >
                  {msg.role === "assistant" && (
                    <div
                      className="w-6 h-6 rounded-lg flex-shrink-0 flex items-center justify-center mr-2.5 mt-0.5"
                      style={{
                        background: "rgba(255,255,255,0.06)",
                        border: "1px solid rgba(255,255,255,0.1)",
                      }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 3L13.5 8.5L19 10L13.5 11.5L12 17L10.5 11.5L5 10L10.5 8.5L12 3Z" />
                      </svg>
                    </div>
                  )}
                  <div
                    className="text-sm font-light leading-relaxed"
                    style={{
                      maxWidth: msg.role === "user" ? "75%" : "85%",
                      padding: msg.role === "user" ? "10px 16px" : "10px 0",
                      borderRadius: msg.role === "user" ? 18 : 0,
                      background: msg.role === "user" ? "rgba(255,255,255,0.08)" : "transparent",
                      border: msg.role === "user" ? "1px solid rgba(255,255,255,0.1)" : "none",
                      color: msg.role === "user" ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.75)",
                    }}
                  >
                    {msg.content}
                  </div>
                </div>
              ))}

              {isTyping && (
                <div className="msg-appear flex items-start gap-2.5">
                  <div
                    className="w-6 h-6 rounded-lg flex-shrink-0 flex items-center justify-center mt-0.5"
                    style={{
                      background: "rgba(255,255,255,0.06)",
                      border: "1px solid rgba(255,255,255,0.1)",
                    }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 3L13.5 8.5L19 10L13.5 11.5L12 17L10.5 11.5L5 10L10.5 8.5L12 3Z" />
                    </svg>
                  </div>
                  <TypingIndicator />
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* ── Bottom Input (only when chatting) ───────── */}
        {!isEmpty && (
          <div
            className="relative z-10 px-4 md:px-5 pt-3 pb-5"
            style={{ background: "linear-gradient(to top, rgba(0,0,0,0.85) 60%, transparent)" }}
          >
            <div className="max-w-2xl mx-auto">
              <InputBar
                input={input}
                setInput={setInput}
                onSend={handleSend}
                onMic={handleMic}
                onStop={() => setIsTyping(false)}
                isTyping={isTyping}
                isListening={isListening}
                hasText={hasText}
              />

              <p className="text-center text-[11px] font-light mt-2.5" style={{ color: "rgba(255,255,255,0.18)" }}>
                missiAI may make mistakes. Verify important information.
              </p>
            </div>
          </div>
        )}
      </div>
    </>
  )
}