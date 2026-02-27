"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import Link from "next/link"
import Image from "next/image"
import { ArrowLeft, Plus, Square, Copy, ThumbsUp, ThumbsDown, RotateCcw, Check } from "lucide-react"

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
    let stars: { x: number; y: number; size: number; brightness: number; twinkleSpeed: number; twinkleOffset: number }[] = []
    let shootingStars: { x: number; y: number; vx: number; vy: number; brightness: number; life: number; maxLife: number }[] = []

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
      initStars()
    }

    const initStars = () => {
      stars = []
      const count = window.innerWidth < 768 ? 80 : 150
      for (let i = 0; i < count; i++) {
        stars.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          size: Math.random() * 1.3 + 0.2,
          brightness: Math.random() * 0.45 + 0.1,
          twinkleSpeed: Math.random() * 0.002 + 0.0008,
          twinkleOffset: Math.random() * Math.PI * 2,
        })
      }
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
      // Rare shooting stars
      if (Math.random() < 0.0008) {
        const a = Math.PI / 4 + Math.random() * 0.6, sp = 4 + Math.random() * 4, ml = 50 + Math.random() * 50
        shootingStars.push({ x: Math.random() * canvas.width, y: -20, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, brightness: 1, life: ml, maxLife: ml })
      }
      for (let i = shootingStars.length - 1; i >= 0; i--) {
        const ss = shootingStars[i]
        ss.x += ss.vx; ss.y += ss.vy; ss.life--
        const al = (ss.life / ss.maxLife) * ss.brightness
        const g = ctx.createLinearGradient(ss.x, ss.y, ss.x - ss.vx * 18, ss.y - ss.vy * 18)
        g.addColorStop(0, `rgba(255,255,255,${al})`)
        g.addColorStop(0.4, `rgba(200,215,255,${al * 0.5})`)
        g.addColorStop(1, "transparent")
        ctx.strokeStyle = g; ctx.lineWidth = 1.2; ctx.lineCap = "round"
        ctx.beginPath(); ctx.moveTo(ss.x, ss.y); ctx.lineTo(ss.x - ss.vx * 18, ss.y - ss.vy * 18); ctx.stroke()
        if (ss.life <= 0) shootingStars.splice(i, 1)
      }
      animId = requestAnimationFrame(draw)
    }

    resize()
    animId = requestAnimationFrame(draw)
    window.addEventListener("resize", resize)
    return () => { cancelAnimationFrame(animId); window.removeEventListener("resize", resize) }
  }, [])

  return <canvas ref={canvasRef} className="fixed inset-0 w-full h-full pointer-events-none" style={{ zIndex: 0 }} />
}

/* ─────────────────────────────────────────────────
   Icons
   ───────────────────────────────────────────────── */
function MicIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10a7 7 0 0 0 14 0" />
      <line x1="12" y1="19" x2="12" y2="22" /><line x1="8" y1="22" x2="16" y2="22" />
    </svg>
  )
}

function SendArrowIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 19V5" /><path d="M5 12L12 5L19 12" />
    </svg>
  )
}

/* ─────────────────────────────────────────────────
   Typing dots
   ───────────────────────────────────────────────── */
function TypingDots() {
  return (
    <div className="flex gap-1 items-center h-6">
      {[0, 1, 2].map((i) => (
        <span key={i} className="w-1.5 h-1.5 rounded-full" style={{
          background: "rgba(255,255,255,0.4)",
          animation: `bounce 1.2s ease-in-out ${i * 0.15}s infinite`,
        }} />
      ))}
    </div>
  )
}

/* ─────────────────────────────────────────────────
   Message Action Buttons (copy, like, dislike, regen)
   ───────────────────────────────────────────────── */
function MessageActions({ content }: { content: string }) {
  const [copied, setCopied] = useState(false)
  const [liked, setLiked] = useState<null | "up" | "down">(null)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const btnStyle = "w-7 h-7 rounded-md flex items-center justify-center transition-all duration-200 hover:bg-white/[0.08]"

  return (
    <div className="flex items-center gap-0.5 mt-2 -ml-1" style={{ color: "rgba(255,255,255,0.3)" }}>
      <button onClick={handleCopy} className={btnStyle} title="Copy">
        {copied ? <Check className="w-3.5 h-3.5" style={{ color: "rgba(255,255,255,0.6)" }} /> : <Copy className="w-3.5 h-3.5" />}
      </button>
      <button
        onClick={() => setLiked(liked === "up" ? null : "up")}
        className={btnStyle}
        title="Good response"
      >
        <ThumbsUp className="w-3.5 h-3.5" style={{ color: liked === "up" ? "rgba(255,255,255,0.7)" : undefined }} />
      </button>
      <button
        onClick={() => setLiked(liked === "down" ? null : "down")}
        className={btnStyle}
        title="Bad response"
      >
        <ThumbsDown className="w-3.5 h-3.5" style={{ color: liked === "down" ? "rgba(255,255,255,0.7)" : undefined }} />
      </button>
      <button className={btnStyle} title="Regenerate">
        <RotateCcw className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

/* ─────────────────────────────────────────────────
   Simulated AI responses
   ───────────────────────────────────────────────── */
const AI_RESPONSES = [
  "Hey Rudra.\n\nWhat intellectual adventure are we stepping into today?\n\nAI architecture? Future strategy? Building something slightly insane and futuristic? Or are we poking at some strange corner of the universe just for fun?\n\nThe floor is yours.",
  "Great question. Let me think through this carefully.\n\nThe intersection of memory and intelligence is what makes truly personalized assistance possible. When an AI can remember context across conversations, it transforms from a tool into a genuine collaborator.\n\nThat's the vision behind missiAI.",
  "Interesting challenge. Here are the key dimensions worth exploring:\n\nFirst, we need to consider the architecture — how data flows through the system and where intelligence gets applied. Second, the user experience needs to feel natural, almost invisible.\n\nLet me know which angle you want to dive deeper into.",
  "I appreciate you bringing that up.\n\nBalancing innovation with practical implementation is always the sweet spot. The best products don't just push boundaries — they make complexity feel simple.\n\nWhat specific aspect would you like me to elaborate on?",
]

/* ─────────────────────────────────────────────────
   Main Chat Playground
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

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current
    if (ta) {
      ta.style.height = "24px"
      ta.style.height = Math.min(ta.scrollHeight, 160) + "px"
    }
  }, [input])

  const simulateResponse = useCallback(() => {
    setIsTyping(true)
    setTimeout(() => {
      const resp = AI_RESPONSES[Math.floor(Math.random() * AI_RESPONSES.length)]
      setMessages((prev) => [...prev, { role: "assistant", content: resp, id: Date.now() }])
      setIsTyping(false)
    }, 1000 + Math.random() * 1500)
  }, [])

  const handleSend = useCallback(() => {
    const trimmed = input.trim()
    if (!trimmed || isTyping) return
    setMessages((prev) => [...prev, { role: "user", content: trimmed, id: Date.now() }])
    setInput("")
    simulateResponse()
  }, [input, isTyping, simulateResponse])

  const handleNewChat = useCallback(() => {
    setMessages([])
    setInput("")
    setIsTyping(false)
  }, [])

  const isEmpty = messages.length === 0
  const hasText = input.trim().length > 0

  return (
    <>
      <style jsx global>{`
        @keyframes bounce {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
          30% { transform: translateY(-6px); opacity: 0.9; }
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes micPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(255,255,255,0.15); }
          50% { box-shadow: 0 0 0 8px rgba(255,255,255,0); }
        }
        .msg-in { animation: fadeUp 0.3s ease-out both; }
        .chat-scroll::-webkit-scrollbar { width: 5px; }
        .chat-scroll::-webkit-scrollbar-track { background: transparent; }
        .chat-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 10px; }
        .chat-scroll::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.15); }
      `}</style>

      <div className="fixed inset-0 bg-black flex flex-col font-inter">
        <StarfieldCanvas />

        {/* ── Header ─────────────────────────────────── */}
        <header className="relative z-10 flex items-center justify-between px-5 py-3 md:px-6"
          style={{
            borderBottom: "1px solid rgba(255,255,255,0.06)",
            background: "rgba(0,0,0,0.4)",
            backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)",
          }}
        >
          <Link href="/"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs md:text-sm transition-all duration-200 hover:bg-white/10"
            style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.45)" }}
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Back</span>
          </Link>

          {/* Logo — full missiAI lengthy logo */}
          <div className="absolute left-1/2 -translate-x-1/2 select-none">
            <div className="relative" onContextMenu={(e) => e.preventDefault()} onDragStart={(e) => e.preventDefault()}>
              <Image src="/images/missiai-logo.png" alt="missiAI" width={200} height={40}
                className="h-12 md:h-14 w-auto object-contain brightness-0 invert opacity-90 select-none pointer-events-none"
                priority draggable={false} onContextMenu={(e) => e.preventDefault()} onDragStart={(e) => e.preventDefault()} />
            </div>
          </div>

          <button onClick={handleNewChat}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs md:text-sm transition-all duration-200 hover:bg-white/10"
            style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.45)" }}
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">New</span>
          </button>
        </header>

        {/* ── Main Content ───────────────────────────── */}
        <div className="chat-scroll flex-1 overflow-y-auto relative z-[5] flex flex-col">

          {isEmpty ? (
            /* ── EMPTY: Clean centered heading + input below ── */
            <div className="flex-1 flex flex-col items-center justify-center px-5">
              <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-white mb-1">
                What&apos;s on your mind?
              </h1>
              <p className="text-sm font-light tracking-wide mb-8" style={{ color: "rgba(255,255,255,0.3)" }}>
                I remember. I learn. I evolve. Let&apos;s think together.
              </p>
            </div>
          ) : (
            /* ── CHAT MESSAGES ── */
            <div className="max-w-3xl w-full mx-auto px-5 md:px-8 py-8 flex flex-col gap-8 flex-1">
              {messages.map((msg, idx) => (
                <div key={msg.id} className="msg-in" style={{ animationDelay: `${idx * 0.03}s` }}>
                  {msg.role === "user" ? (
                    /* User message — right aligned pill */
                    <div className="flex justify-end">
                      <div className="max-w-[75%] px-4 py-2.5 rounded-2xl text-[15px] leading-relaxed"
                        style={{
                          background: "rgba(255,255,255,0.08)",
                          border: "1px solid rgba(255,255,255,0.1)",
                          color: "rgba(255,255,255,0.9)",
                        }}
                      >
                        {msg.content}
                      </div>
                    </div>
                  ) : (
                    /* Assistant message — left aligned, with logo */
                    <div className="flex items-start gap-3">
                      {/* missiAI logo */}
                      <div className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center mt-0.5 select-none overflow-hidden"
                        style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
                      >
                        <Image src="/images/logo-symbol.png" alt="M" width={18} height={18}
                          className="w-[18px] h-[18px] opacity-80 select-none pointer-events-none" draggable={false} />
                      </div>

                      <div className="flex-1 min-w-0">
                        {/* Response text */}
                        <div className="text-[15px] leading-[1.75] font-light whitespace-pre-line"
                          style={{ color: "rgba(255,255,255,0.82)" }}
                        >
                          {msg.content}
                        </div>

                        {/* Action buttons */}
                        <MessageActions content={msg.content} />
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {/* Typing indicator */}
              {isTyping && (
                <div className="msg-in flex items-start gap-3">
                  <div className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center mt-0.5 select-none overflow-hidden"
                    style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
                  >
                    <Image src="/images/logo-symbol.png" alt="M" width={18} height={18}
                      className="w-[18px] h-[18px] opacity-80 select-none pointer-events-none" draggable={false} />
                  </div>
                  <TypingDots />
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* ── Input Bar (always at bottom) ───────────── */}
        <div className="relative z-10 px-5 md:px-8 pt-2 pb-4"
          style={{ background: isEmpty ? "transparent" : "linear-gradient(to top, rgba(0,0,0,0.9) 50%, transparent)" }}
        >
          <div className="max-w-3xl mx-auto">
            {/* Input container */}
            <div className="flex items-center gap-0 rounded-full transition-all duration-300 focus-within:border-white/[0.18]"
              style={{
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.1)",
                padding: "5px 5px 5px 4px",
                height: 50,
              }}
            >
              {/* + button */}
              <button className="w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center transition-colors hover:bg-white/[0.06]"
                style={{ color: "rgba(255,255,255,0.4)", background: "transparent", border: "none", cursor: "pointer" }}
              >
                <Plus className="w-5 h-5" />
              </button>

              {/* Input */}
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend() } }}
                placeholder="Ask anything"
                rows={1}
                className="flex-1 bg-transparent border-none text-[15px] font-light leading-6 placeholder:text-white/25 focus:outline-none resize-none"
                style={{ color: "rgba(255,255,255,0.9)", minHeight: 24, maxHeight: 40, paddingTop: 7, paddingBottom: 7, textAlign: "left", paddingLeft: 0, marginLeft: 0 }}
              />

              {/* Mic */}
              <button onClick={() => setIsListening((p) => !p)}
                className="w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center transition-all duration-200"
                style={{
                  background: isListening ? "rgba(255,255,255,0.12)" : "transparent",
                  border: "none", cursor: "pointer",
                  color: isListening ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.3)",
                  animation: isListening ? "micPulse 1.5s ease-in-out infinite" : "none",
                }}
              >
                <MicIcon />
              </button>

              {/* Send / Stop */}
              <button
                onClick={isTyping ? () => setIsTyping(false) : handleSend}
                disabled={!hasText && !isTyping}
                className="w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center transition-all duration-200"
                style={{
                  background: isTyping ? "rgba(255,255,255,0.15)" : hasText ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.06)",
                  border: "none",
                  color: isTyping ? "#fff" : hasText ? "#000" : "rgba(255,255,255,0.12)",
                  cursor: (!hasText && !isTyping) ? "default" : "pointer",
                  boxShadow: hasText && !isTyping ? "0 2px 12px rgba(255,255,255,0.1)" : "none",
                }}
              >
                {isTyping ? <Square className="w-3.5 h-3.5" fill="currentColor" /> : <SendArrowIcon />}
              </button>
            </div>

            {/* Disclaimer */}
            <p className="text-center text-[11px] font-light mt-2.5 tracking-wide" style={{ color: "rgba(255,255,255,0.16)" }}>
              missiAI can make mistakes. Verify important information.
            </p>
          </div>
        </div>
      </div>
    </>
  )
}