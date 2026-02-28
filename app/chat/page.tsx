"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import Link from "next/link"
import Image from "next/image"
import {
  ArrowLeft, Plus, Square, Copy, ThumbsUp, ThumbsDown,
  RotateCcw, Check, PanelLeftClose, PanelLeft,
  MessageSquare, Trash2, Pencil, Search, X,
} from "lucide-react"

/* ─────────────────────────────────────────────────
   Types
   ───────────────────────────────────────────────── */
interface Message {
  role: "user" | "assistant"
  content: string
  id: number
}

interface Chat {
  id: string
  title: string
  messages: Message[]
  createdAt: number
  updatedAt: number
}

/* ─────────────────────────────────────────────────
   LocalStorage helpers
   ───────────────────────────────────────────────── */
const STORAGE_KEY = "missiai-chats"

function loadChats(): Chat[] {
  if (typeof window === "undefined") return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

function saveChats(chats: Chat[]) {
  if (typeof window === "undefined") return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(chats))
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

function generateTitle(firstMessage: string): string {
  const trimmed = firstMessage.trim()
  if (trimmed.length <= 40) return trimmed
  return trimmed.slice(0, 40) + "..."
}

/* ─────────────────────────────────────────────────
   Starfield Canvas
   ───────────────────────────────────────────────── */
function StarfieldCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    let animId: number
    let stars: { x: number; y: number; size: number; brightness: number; speed: number; offset: number }[] = []

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
      stars = []
      const count = window.innerWidth < 768 ? 70 : 140
      for (let i = 0; i < count; i++) {
        stars.push({
          x: Math.random() * canvas.width, y: Math.random() * canvas.height,
          size: Math.random() * 1.3 + 0.2, brightness: Math.random() * 0.4 + 0.1,
          speed: Math.random() * 0.002 + 0.0005, offset: Math.random() * Math.PI * 2,
        })
      }
    }

    const draw = (t: number) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      for (const s of stars) {
        const b = s.brightness * (0.65 + 0.35 * Math.sin(t * s.speed + s.offset))
        ctx.fillStyle = `rgba(255,255,255,${b})`
        ctx.beginPath(); ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2); ctx.fill()
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
   Blinking cursor for streaming
   ───────────────────────────────────────────────── */
function StreamCursor() {
  return (
    <span className="inline-block w-[2px] h-[18px] ml-0.5 align-middle" style={{
      background: "rgba(255,255,255,0.6)",
      animation: "cursorBlink 0.8s ease-in-out infinite",
    }} />
  )
}

/* ─────────────────────────────────────────────────
   Message Actions
   ───────────────────────────────────────────────── */
function MessageActions({ content, onRegenerate }: { content: string; onRegenerate?: () => void }) {
  const [copied, setCopied] = useState(false)
  const [liked, setLiked] = useState<null | "up" | "down">(null)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const btn = "w-7 h-7 rounded-md flex items-center justify-center transition-all duration-200 hover:bg-white/[0.08]"

  return (
    <div className="flex items-center gap-0.5 mt-2 -ml-1" style={{ color: "rgba(255,255,255,0.3)" }}>
      <button onClick={handleCopy} className={btn} title="Copy">
        {copied ? <Check className="w-3.5 h-3.5" style={{ color: "rgba(255,255,255,0.6)" }} /> : <Copy className="w-3.5 h-3.5" />}
      </button>
      <button onClick={() => setLiked(liked === "up" ? null : "up")} className={btn}>
        <ThumbsUp className="w-3.5 h-3.5" style={{ color: liked === "up" ? "rgba(255,255,255,0.7)" : undefined }} />
      </button>
      <button onClick={() => setLiked(liked === "down" ? null : "down")} className={btn}>
        <ThumbsDown className="w-3.5 h-3.5" style={{ color: liked === "down" ? "rgba(255,255,255,0.7)" : undefined }} />
      </button>
      {onRegenerate && (
        <button onClick={onRegenerate} className={btn} title="Regenerate">
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  )
}

/* ─────────────────────────────────────────────────
   SIDEBAR
   ───────────────────────────────────────────────── */
function Sidebar({
  chats, activeChatId, onSelectChat, onNewChat, onDeleteChat, onRenameChat, isOpen, onClose,
}: {
  chats: Chat[]
  activeChatId: string | null
  onSelectChat: (id: string) => void
  onNewChat: () => void
  onDeleteChat: (id: string) => void
  onRenameChat: (id: string, title: string) => void
  isOpen: boolean
  onClose: () => void
}) {
  const [searchQuery, setSearchQuery] = useState("")
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState("")
  const editRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editingId && editRef.current) editRef.current.focus()
  }, [editingId])

  const filtered = searchQuery.trim()
    ? chats.filter((c) => c.title.toLowerCase().includes(searchQuery.toLowerCase()))
    : chats

  const grouped: { label: string; chats: Chat[] }[] = []
  const today: Chat[] = [], yesterday: Chat[] = [], week: Chat[] = [], older: Chat[] = []
  const now = Date.now()
  for (const c of filtered) {
    const days = Math.floor((now - c.updatedAt) / 86400000)
    if (days === 0) today.push(c)
    else if (days === 1) yesterday.push(c)
    else if (days < 7) week.push(c)
    else older.push(c)
  }
  if (today.length) grouped.push({ label: "Today", chats: today })
  if (yesterday.length) grouped.push({ label: "Yesterday", chats: yesterday })
  if (week.length) grouped.push({ label: "This Week", chats: week })
  if (older.length) grouped.push({ label: "Older", chats: older })

  const startRename = (c: Chat) => { setEditingId(c.id); setEditTitle(c.title) }
  const confirmRename = () => {
    if (editingId && editTitle.trim()) onRenameChat(editingId, editTitle.trim())
    setEditingId(null)
  }

  return (
    <>
      {isOpen && <div className="fixed inset-0 bg-black/60 z-30 md:hidden" onClick={onClose} />}
      <aside
        className={`fixed md:relative z-40 top-0 left-0 h-full flex flex-col transition-all duration-300 ease-in-out
          ${isOpen ? "w-72 translate-x-0" : "w-0 -translate-x-full md:translate-x-0 md:w-0"}`}
        style={{
          background: "rgba(0,0,0,0.7)", backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)",
          borderRight: isOpen ? "1px solid rgba(255,255,255,0.06)" : "none", overflow: "hidden",
        }}
      >
        <div className="flex flex-col h-full w-72">
          <div className="flex items-center justify-between px-3 py-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            <button onClick={onNewChat}
              className="flex-1 flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all hover:bg-white/[0.06]"
              style={{ color: "rgba(255,255,255,0.7)" }}>
              <Plus className="w-4 h-4" /> New Chat
            </button>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/[0.06] transition-colors"
              style={{ color: "rgba(255,255,255,0.4)" }}>
              <PanelLeftClose className="w-4 h-4 hidden md:block" />
              <X className="w-4 h-4 md:hidden" />
            </button>
          </div>

          <div className="px-3 py-2">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <Search className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "rgba(255,255,255,0.25)" }} />
              <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search chats..." className="flex-1 bg-transparent border-none text-xs font-light placeholder:text-white/20 focus:outline-none"
                style={{ color: "rgba(255,255,255,0.7)" }} />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-2 py-1 sidebar-scroll">
            {grouped.length === 0 ? (
              <div className="px-3 py-8 text-center">
                <MessageSquare className="w-8 h-8 mx-auto mb-3" style={{ color: "rgba(255,255,255,0.1)" }} />
                <p className="text-xs font-light" style={{ color: "rgba(255,255,255,0.25)" }}>
                  {searchQuery ? "No chats found" : "No conversations yet"}
                </p>
              </div>
            ) : (
              grouped.map((group) => (
                <div key={group.label} className="mb-3">
                  <p className="px-3 py-1.5 text-[10px] font-medium tracking-wider uppercase" style={{ color: "rgba(255,255,255,0.25)" }}>
                    {group.label}
                  </p>
                  {group.chats.map((chat) => (
                    <div key={chat.id}
                      className={`group flex items-center gap-1 px-3 py-2 rounded-lg cursor-pointer transition-all duration-200 mb-0.5 ${
                        activeChatId === chat.id ? "bg-white/[0.08]" : "hover:bg-white/[0.04]"}`}
                      onClick={() => { onSelectChat(chat.id); if (window.innerWidth < 768) onClose() }}>
                      {editingId === chat.id ? (
                        <input ref={editRef} value={editTitle} onChange={(e) => setEditTitle(e.target.value)}
                          onBlur={confirmRename} onKeyDown={(e) => { if (e.key === "Enter") confirmRename(); if (e.key === "Escape") setEditingId(null) }}
                          className="flex-1 bg-transparent border-none text-xs font-light focus:outline-none"
                          style={{ color: "rgba(255,255,255,0.8)" }} onClick={(e) => e.stopPropagation()} />
                      ) : (
                        <>
                          <MessageSquare className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "rgba(255,255,255,0.2)" }} />
                          <span className="flex-1 text-xs font-light truncate"
                            style={{ color: activeChatId === chat.id ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.55)" }}>
                            {chat.title}
                          </span>
                          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={(e) => { e.stopPropagation(); startRename(chat) }}
                              className="w-6 h-6 rounded flex items-center justify-center hover:bg-white/[0.08]"
                              style={{ color: "rgba(255,255,255,0.3)" }}><Pencil className="w-3 h-3" /></button>
                            <button onClick={(e) => { e.stopPropagation(); onDeleteChat(chat.id) }}
                              className="w-6 h-6 rounded flex items-center justify-center hover:bg-red-500/20"
                              style={{ color: "rgba(255,255,255,0.3)" }}><Trash2 className="w-3 h-3" /></button>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>

          <div className="px-3 py-3" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
            <Link href="/" className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs transition-all hover:bg-white/[0.06]"
              style={{ color: "rgba(255,255,255,0.4)" }}>
              <Image src="/images/logo-symbol.png" alt="missiAI" width={20} height={20}
                className="w-5 h-5 opacity-60 select-none pointer-events-none" draggable={false} />
              <span className="font-medium">missi<span className="opacity-40">AI</span></span>
              <span className="ml-auto text-[10px]" style={{ color: "rgba(255,255,255,0.2)" }}>v0.1</span>
            </Link>
          </div>
        </div>
      </aside>
    </>
  )
}

/* ─────────────────────────────────────────────────
   MAIN CHAT PAGE
   ───────────────────────────────────────────────── */
export default function ChatPage() {
  const [chats, setChats] = useState<Chat[]>([])
  const [activeChatId, setActiveChatId] = useState<string | null>(null)
  const [input, setInput] = useState("")
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamingMsgId, setStreamingMsgId] = useState<number | null>(null)
  const [isListening, setIsListening] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  useEffect(() => {
    const stored = loadChats()
    setChats(stored)
    if (window.innerWidth < 768) setSidebarOpen(false)
  }, [])

  useEffect(() => {
    if (chats.length > 0) saveChats(chats)
  }, [chats])

  const activeChat = chats.find((c) => c.id === activeChatId) || null
  const messages = activeChat?.messages || []
  const isEmpty = messages.length === 0 && !activeChatId

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [])

  useEffect(() => { scrollToBottom() }, [messages, isStreaming, scrollToBottom])

  useEffect(() => {
    const ta = textareaRef.current
    if (ta) { ta.style.height = "24px"; ta.style.height = Math.min(ta.scrollHeight, 160) + "px" }
  }, [input])

  const handleNewChat = useCallback(() => {
    setActiveChatId(null); setInput(""); setIsStreaming(false); setError(null)
  }, [])

  const handleSelectChat = useCallback((id: string) => {
    setActiveChatId(id); setInput(""); setIsStreaming(false); setError(null)
  }, [])

  const handleDeleteChat = useCallback((id: string) => {
    setChats((prev) => { const u = prev.filter((c) => c.id !== id); saveChats(u); return u })
    if (activeChatId === id) setActiveChatId(null)
  }, [activeChatId])

  const handleRenameChat = useCallback((id: string, title: string) => {
    setChats((prev) => { const u = prev.map((c) => c.id === id ? { ...c, title } : c); saveChats(u); return u })
  }, [])

  /* ── STREAMING AI CALL ───────────────────────── */
  const callAI = useCallback(async (chatId: string, allMessages: Message[]) => {
    setIsStreaming(true)
    setError(null)

    const controller = new AbortController()
    abortControllerRef.current = controller

    // Create empty AI message that we'll fill with streamed text
    const aiMsgId = Date.now()
    setStreamingMsgId(aiMsgId)
    const aiMsg: Message = { role: "assistant", content: "", id: aiMsgId }

    // Add empty AI message to chat
    setChats((prev) => {
      const updated = prev.map((c) =>
        c.id === chatId ? { ...c, messages: [...c.messages, aiMsg], updatedAt: Date.now() } : c
      )
      saveChats(updated)
      return updated
    })

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: allMessages.map((m) => ({ role: m.role, content: m.content })),
        }),
        signal: controller.signal,
      })

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}))
        throw new Error(errData.error || `Server error: ${response.status}`)
      }

      const reader = response.body?.getReader()
      if (!reader) throw new Error("No response stream")

      const decoder = new TextDecoder()
      let fullText = ""

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        const lines = chunk.split("\n")

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue
          const data = line.slice(6).trim()
          if (data === "[DONE]") continue

          try {
            const parsed = JSON.parse(data)
            if (parsed.text) {
              fullText += parsed.text

              // Update the AI message content in real-time
              const currentText = fullText
              setChats((prev) => {
                const updated = prev.map((c) => {
                  if (c.id !== chatId) return c
                  const msgs = c.messages.map((m) =>
                    m.id === aiMsgId ? { ...m, content: currentText } : m
                  )
                  return { ...c, messages: msgs, updatedAt: Date.now() }
                })
                // Don't save to localStorage on every chunk (performance)
                return updated
              })
            }
          } catch {
            // skip malformed chunks
          }
        }
      }

      // Final save to localStorage
      setChats((prev) => {
        saveChats(prev)
        return prev
      })

    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") {
        // User cancelled — save what we have
        setChats((prev) => { saveChats(prev); return prev })
      } else {
        const errorMsg = err instanceof Error ? err.message : "Something went wrong"
        setError(errorMsg)
        // Remove empty AI message on error
        setChats((prev) => {
          const updated = prev.map((c) => {
            if (c.id !== chatId) return c
            const msgs = c.messages.filter((m) => m.id !== aiMsgId || m.content.length > 0)
            return { ...c, messages: msgs }
          })
          saveChats(updated)
          return updated
        })
      }
    } finally {
      setIsStreaming(false)
      setStreamingMsgId(null)
      abortControllerRef.current = null
    }
  }, [])

  const handleStop = useCallback(() => {
    abortControllerRef.current?.abort()
    setIsStreaming(false)
    setStreamingMsgId(null)
  }, [])

  const handleSend = useCallback(() => {
    const trimmed = input.trim()
    if (!trimmed || isStreaming) return

    const userMsg: Message = { role: "user", content: trimmed, id: Date.now() }

    if (!activeChatId) {
      const newChat: Chat = {
        id: generateId(), title: generateTitle(trimmed),
        messages: [userMsg], createdAt: Date.now(), updatedAt: Date.now(),
      }
      setChats((prev) => { const u = [newChat, ...prev]; saveChats(u); return u })
      setActiveChatId(newChat.id)
      setInput("")
      callAI(newChat.id, [userMsg])
    } else {
      const updatedMessages = [...messages, userMsg]
      setChats((prev) => {
        const u = prev.map((c) =>
          c.id === activeChatId ? { ...c, messages: updatedMessages, updatedAt: Date.now() } : c
        )
        saveChats(u)
        return u
      })
      setInput("")
      callAI(activeChatId, updatedMessages)
    }
  }, [input, isStreaming, activeChatId, messages, callAI])

  const handleRegenerate = useCallback(() => {
    if (!activeChat || isStreaming) return
    const msgs = activeChat.messages
    const lastUserIdx = msgs.findLastIndex((m) => m.role === "user")
    if (lastUserIdx === -1) return
    const messagesUpToUser = msgs.slice(0, lastUserIdx + 1)
    setChats((prev) => {
      const u = prev.map((c) =>
        c.id === activeChatId ? { ...c, messages: messagesUpToUser, updatedAt: Date.now() } : c
      )
      saveChats(u)
      return u
    })
    callAI(activeChatId!, messagesUpToUser)
  }, [activeChat, activeChatId, isStreaming, callAI])

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
        @keyframes cursorBlink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
        .msg-in { animation: fadeUp 0.3s ease-out both; }
        .chat-scroll::-webkit-scrollbar, .sidebar-scroll::-webkit-scrollbar { width: 4px; }
        .chat-scroll::-webkit-scrollbar-track, .sidebar-scroll::-webkit-scrollbar-track { background: transparent; }
        .chat-scroll::-webkit-scrollbar-thumb, .sidebar-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 10px; }
      `}</style>

      <div className="fixed inset-0 bg-black flex font-inter">
        <StarfieldCanvas />

        <Sidebar chats={chats} activeChatId={activeChatId} onSelectChat={handleSelectChat}
          onNewChat={handleNewChat} onDeleteChat={handleDeleteChat} onRenameChat={handleRenameChat}
          isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

        <div className="flex-1 flex flex-col relative z-[5] min-w-0">

          {/* Header */}
          <header className="relative z-10 flex items-center justify-between px-4 py-3 md:px-5"
            style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", background: "rgba(0,0,0,0.4)",
              backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)" }}>
            <div className="flex items-center gap-2">
              {!sidebarOpen && (
                <button onClick={() => setSidebarOpen(true)}
                  className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/[0.06] transition-colors"
                  style={{ color: "rgba(255,255,255,0.4)" }}>
                  <PanelLeft className="w-4 h-4" />
                </button>
              )}
              <Link href="/"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs transition-all duration-200 hover:bg-white/10"
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.45)" }}>
                <ArrowLeft className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Home</span>
              </Link>
            </div>

            <div className="absolute left-1/2 -translate-x-1/2 select-none">
              <Image src="/images/missiai-logo.png" alt="missiAI" width={200} height={40}
                className="h-12 md:h-14 w-auto object-contain brightness-0 invert opacity-90 select-none pointer-events-none"
                priority draggable={false} onContextMenu={(e) => e.preventDefault()} />
            </div>

            <button onClick={handleNewChat}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs transition-all duration-200 hover:bg-white/10"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.45)" }}>
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">New</span>
            </button>
          </header>

          {/* Messages */}
          <div className="chat-scroll flex-1 overflow-y-auto flex flex-col">
            {isEmpty || (!activeChat && messages.length === 0) ? (
              <div className="flex-1 flex flex-col items-center justify-center px-5">
                <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-white mb-1">
                  What&apos;s on your mind?
                </h1>
                <p className="text-sm font-light tracking-wide mb-8" style={{ color: "rgba(255,255,255,0.3)" }}>
                  I remember. I learn. I evolve. Let&apos;s think together.
                </p>
              </div>
            ) : (
              <div className="max-w-3xl w-full mx-auto px-5 md:px-8 py-8 flex flex-col gap-8 flex-1">
                {messages.map((msg, idx) => (
                  <div key={msg.id} className="msg-in" style={{ animationDelay: `${Math.min(idx * 0.03, 0.3)}s` }}>
                    {msg.role === "user" ? (
                      <div className="flex justify-end">
                        <div className="max-w-[75%] px-4 py-2.5 rounded-2xl text-[15px] leading-relaxed"
                          style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.9)" }}>
                          {msg.content}
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start gap-3">
                        <div className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center mt-0.5 select-none overflow-hidden"
                          style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}>
                          <Image src="/images/logo-symbol.png" alt="M" width={18} height={18}
                            className="w-[18px] h-[18px] opacity-80 select-none pointer-events-none" draggable={false} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-[15px] leading-[1.75] font-light whitespace-pre-line"
                            style={{ color: "rgba(255,255,255,0.82)" }}>
                            {msg.content}
                            {/* Show blinking cursor while streaming this message */}
                            {streamingMsgId === msg.id && isStreaming && <StreamCursor />}
                          </div>
                          {/* Show actions only when not streaming */}
                          {streamingMsgId !== msg.id && msg.content && (
                            <MessageActions content={msg.content}
                              onRegenerate={idx === messages.length - 1 ? handleRegenerate : undefined} />
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}

                {/* Error */}
                {error && (
                  <div className="msg-in flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm"
                    style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", color: "rgba(239,68,68,0.8)" }}>
                    <span>⚠</span> {error}
                    <button onClick={() => setError(null)} className="ml-auto hover:text-red-400"><X className="w-3.5 h-3.5" /></button>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* Input */}
          <div className="relative z-10 px-5 md:px-8 pt-2 pb-4"
            style={{ background: isEmpty ? "transparent" : "linear-gradient(to top, rgba(0,0,0,0.9) 50%, transparent)" }}>
            <div className="max-w-3xl mx-auto">
              <div className="flex items-center gap-0 rounded-full transition-all duration-300 focus-within:border-white/[0.18]"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
                  padding: "5px 5px 5px 4px", height: 50 }}>
                <button className="w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center transition-colors hover:bg-white/[0.06]"
                  style={{ color: "rgba(255,255,255,0.4)", background: "transparent", border: "none", cursor: "pointer" }}>
                  <Plus className="w-5 h-5" />
                </button>

                <textarea ref={textareaRef} value={input} onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend() } }}
                  placeholder="Ask anything" rows={1}
                  className="flex-1 bg-transparent border-none text-[15px] font-light leading-6 placeholder:text-white/25 focus:outline-none resize-none"
                  style={{ color: "rgba(255,255,255,0.9)", minHeight: 24, maxHeight: 40, paddingTop: 7, paddingBottom: 7, textAlign: "left", paddingLeft: 0, marginLeft: 0 }} />

                <button onClick={() => setIsListening((p) => !p)}
                  className="w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center transition-all duration-200"
                  style={{ background: isListening ? "rgba(255,255,255,0.12)" : "transparent", border: "none", cursor: "pointer",
                    color: isListening ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.3)",
                    animation: isListening ? "micPulse 1.5s ease-in-out infinite" : "none" }}>
                  <MicIcon />
                </button>

                <button
                  onClick={isStreaming ? handleStop : handleSend}
                  disabled={!hasText && !isStreaming}
                  className="w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center transition-all duration-200"
                  style={{
                    background: isStreaming ? "rgba(255,255,255,0.15)" : hasText ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.06)",
                    border: "none", color: isStreaming ? "#fff" : hasText ? "#000" : "rgba(255,255,255,0.12)",
                    cursor: (!hasText && !isStreaming) ? "default" : "pointer",
                    boxShadow: hasText && !isStreaming ? "0 2px 12px rgba(255,255,255,0.1)" : "none",
                  }}>
                  {isStreaming ? <Square className="w-3.5 h-3.5" fill="currentColor" /> : <SendArrowIcon />}
                </button>
              </div>

              <p className="text-center text-[11px] font-light mt-2.5 tracking-wide" style={{ color: "rgba(255,255,255,0.16)" }}>
                missiAI can make mistakes. Verify important information.
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}