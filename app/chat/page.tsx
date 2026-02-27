"use client";

import { useState, useRef, useEffect, useCallback } from "react";

function StarfieldCanvas() {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let animId, stars = [], shootingStars = [];
    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; initStars(); };
    const initStars = () => {
      stars = [];
      const count = window.innerWidth < 768 ? 80 : 160;
      for (let i = 0; i < count; i++) stars.push({ x: Math.random() * canvas.width, y: Math.random() * canvas.height, size: Math.random() * 1.4 + 0.3, brightness: Math.random() * 0.5 + 0.15, twinkleSpeed: Math.random() * 0.003 + 0.001, twinkleOffset: Math.random() * Math.PI * 2 });
    };
    const draw = (t) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const s of stars) { const b = s.brightness * (0.7 + 0.3 * Math.sin(t * s.twinkleSpeed + s.twinkleOffset)); ctx.fillStyle = `rgba(255,255,255,${b})`; ctx.beginPath(); ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2); ctx.fill(); }
      if (Math.random() < 0.001) { const a = Math.PI / 4 + Math.random() * 0.6, sp = 4 + Math.random() * 4, ml = 60 + Math.random() * 60; shootingStars.push({ x: Math.random() * canvas.width, y: -20, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, brightness: 1, life: ml, maxLife: ml }); }
      for (let i = shootingStars.length - 1; i >= 0; i--) { const ss = shootingStars[i]; ss.x += ss.vx; ss.y += ss.vy; ss.life--; const al = (ss.life / ss.maxLife) * ss.brightness; const g = ctx.createLinearGradient(ss.x, ss.y, ss.x - ss.vx * 18, ss.y - ss.vy * 18); g.addColorStop(0, `rgba(255,255,255,${al})`); g.addColorStop(0.4, `rgba(200,215,255,${al * 0.6})`); g.addColorStop(1, "transparent"); ctx.strokeStyle = g; ctx.lineWidth = 1.5; ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(ss.x, ss.y); ctx.lineTo(ss.x - ss.vx * 18, ss.y - ss.vy * 18); ctx.stroke(); if (ss.life <= 0) shootingStars.splice(i, 1); }
      animId = requestAnimationFrame(draw);
    };
    resize(); animId = requestAnimationFrame(draw); window.addEventListener("resize", resize);
    return () => { cancelAnimationFrame(animId); window.removeEventListener("resize", resize); };
  }, []);
  return <canvas ref={canvasRef} style={{ position: "fixed", inset: 0, width: "100%", height: "100%", zIndex: 0, pointerEvents: "none" }} />;
}

const ArrowLeftIcon = () => (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5"/><path d="M12 19L5 12L12 5"/></svg>);
const PlusIcon = () => (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5V19"/><path d="M5 12H19"/></svg>);
const MicIcon = () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="8" y1="22" x2="16" y2="22"/></svg>);
const SendArrowIcon = () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5"/><path d="M5 12L12 5L19 12"/></svg>);
const StopIcon = () => (<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>);
const SparkleIcon = ({ size = 16 }) => (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3L13.5 8.5L19 10L13.5 11.5L12 17L10.5 11.5L5 10L10.5 8.5L12 3Z"/><path d="M19 15L19.88 17.12L22 18L19.88 18.88L19 21L18.12 18.88L16 18L18.12 17.12L19 15Z" opacity="0.5"/><path d="M5 17L5.63 18.37L7 19L5.63 19.63L5 21L4.37 19.63L3 19L4.37 18.37L5 17Z" opacity="0.35"/></svg>);
const SmallSparkle = () => (<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3L13.5 8.5L19 10L13.5 11.5L12 17L10.5 11.5L5 10L10.5 8.5L12 3Z"/></svg>);

function TypingIndicator() { return (<div style={{ display: "flex", gap: 4, alignItems: "center", padding: "4px 0" }}>{[0,1,2].map(i => (<span key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: "rgba(255,255,255,0.4)", animation: `typingBounce 1.2s ease-in-out ${i * 0.15}s infinite` }} />))}</div>); }

const AI_RESPONSES = [
  "That's a fascinating question. Let me think through this carefully for you — missiAI is designed to bring deep, thoughtful reasoning to every conversation.",
  "I appreciate you bringing that up. The intersection of memory and intelligence is what makes truly personalized assistance possible.",
  "Great point. There are several dimensions worth exploring here. Let me walk you through the key considerations.",
  "Interesting. Here's what I'd recommend — balancing innovation with practical implementation is always the sweet spot.",
  "I understand completely. Let me provide a thorough breakdown that addresses each aspect of your question.",
  "That's exactly the kind of challenge missiAI was built for. Here's how I'd approach it with contextual understanding.",
];
const SUGGESTIONS = ["What can missiAI do?", "Tell me about AI with Memory", "Help me brainstorm ideas", "Write something creative"];

export default function MissiAIChat() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const endRef = useRef(null);
  const taRef = useRef(null);

  const scroll = useCallback(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), []);
  useEffect(() => { scroll(); }, [messages, isTyping, scroll]);
  useEffect(() => { if (taRef.current) { taRef.current.style.height = "24px"; taRef.current.style.height = Math.min(taRef.current.scrollHeight, 160) + "px"; } }, [input]);

  const simResp = useCallback(() => { setIsTyping(true); setTimeout(() => { setMessages(p => [...p, { role: "assistant", content: AI_RESPONSES[Math.floor(Math.random() * AI_RESPONSES.length)], id: Date.now() }]); setIsTyping(false); }, 1200 + Math.random() * 1800); }, []);
  const send = useCallback(() => { const t = input.trim(); if (!t || isTyping) return; setMessages(p => [...p, { role: "user", content: t, id: Date.now() }]); setInput(""); simResp(); }, [input, isTyping, simResp]);
  const suggest = useCallback((t) => { if (isTyping) return; setMessages(p => [...p, { role: "user", content: t, id: Date.now() }]); simResp(); }, [isTyping, simResp]);

  const isEmpty = messages.length === 0;
  const hasText = input.trim().length > 0;

  const pill = { display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 999, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.5)", fontSize: 13, cursor: "pointer", transition: "all 0.25s", textDecoration: "none", fontFamily: "'Inter',sans-serif" };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&display=swap');
        *{margin:0;padding:0;box-sizing:border-box} body{font-family:'Inter',sans-serif;background:#000;color:#fff;overflow:hidden}
        @keyframes typingBounce{0%,60%,100%{transform:translateY(0);opacity:.4}30%{transform:translateY(-6px);opacity:.9}}
        @keyframes fadeSlideUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
        @keyframes subtlePulse{0%,100%{opacity:.6}50%{opacity:1}}
        @keyframes micPulse{0%,100%{box-shadow:0 0 0 0 rgba(255,255,255,.15)}50%{box-shadow:0 0 0 8px rgba(255,255,255,0)}}
        .msg-appear{animation:fadeSlideUp .35s ease-out both}
        .cs::-webkit-scrollbar{width:4px}.cs::-webkit-scrollbar-track{background:transparent}.cs::-webkit-scrollbar-thumb{background:rgba(255,255,255,.1);border-radius:4px}
        textarea::placeholder{color:rgba(255,255,255,.3);text-align:center}textarea{resize:none;text-align:center}textarea:focus{outline:none}
      `}</style>

      <div style={{ position: "fixed", inset: 0, background: "#000", display: "flex", flexDirection: "column", fontFamily: "'Inter',sans-serif" }}>
        <StarfieldCanvas />

        <header style={{ position: "relative", zIndex: 10, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)", background: "rgba(0,0,0,0.5)", backdropFilter: "blur(20px)" }}>
          <a href="/" style={pill}><ArrowLeftIcon /> Back</a>
          <img src="/images/missiai-logo.png" alt="missiAI" style={{ height: 32, objectFit: "contain" }} />
          <button onClick={() => { setMessages([]); setInput(""); setIsTyping(false); }} style={pill}><PlusIcon /> New</button>
        </header>

        <div className="cs" style={{ flex: 1, overflowY: "auto", position: "relative", zIndex: 5, display: "flex", flexDirection: "column" }}>
          {isEmpty ? (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 20px", gap: 32 }}>
              <div style={{ width: 64, height: 64, borderRadius: 20, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", display: "flex", alignItems: "center", justifyContent: "center", animation: "subtlePulse 4s ease-in-out infinite" }}><SparkleIcon size={28} /></div>
              <div style={{ textAlign: "center", maxWidth: 380 }}>
                <h1 style={{ fontSize: 22, fontWeight: 500, letterSpacing: "-0.02em", marginBottom: 8 }}>How can I help you today?</h1>
                <p style={{ fontSize: 13, color: "rgba(255,255,255,0.35)", lineHeight: 1.6, fontWeight: 300 }}>Start a conversation with missiAI — your intelligent assistant with memory.</p>
              </div>

              <div style={{ width: "100%", maxWidth: 560 }}>
                <div style={{ display: "flex", alignItems: "flex-end", gap: 8, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 28, padding: "8px 8px 8px 18px", boxShadow: "0 8px 32px rgba(0,0,0,0.3)" }}>
                  <textarea ref={taRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} placeholder="Message missiAI..." rows={1} style={{ flex: 1, background: "transparent", border: "none", color: "rgba(255,255,255,0.9)", fontSize: 14, fontWeight: 300, lineHeight: "24px", fontFamily: "'Inter',sans-serif", minHeight: 24, maxHeight: 160 }} />
                  <button onClick={() => setIsListening(p => !p)} style={{ width: 36, height: 36, borderRadius: 18, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.2s", background: isListening ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: isListening ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.35)", animation: isListening ? "micPulse 1.5s ease-in-out infinite" : "none", cursor: "pointer" }}><MicIcon /></button>
                  <button onClick={send} disabled={!hasText} style={{ width: 36, height: 36, borderRadius: 18, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.2s", background: hasText ? "linear-gradient(135deg, rgba(255,255,255,0.95), rgba(220,220,225,0.9))" : "rgba(255,255,255,0.06)", border: hasText ? "none" : "1px solid rgba(255,255,255,0.08)", color: hasText ? "#000" : "rgba(255,255,255,0.15)", cursor: hasText ? "pointer" : "default", boxShadow: hasText ? "0 2px 12px rgba(255,255,255,0.15)" : "none" }}><SendArrowIcon /></button>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", marginTop: 20 }}>
                  {SUGGESTIONS.map((s, i) => (<button key={i} onClick={() => suggest(s)} style={{ padding: "10px 18px", borderRadius: 999, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.45)", fontSize: 13, cursor: "pointer", transition: "all 0.25s", fontFamily: "'Inter',sans-serif" }}>{s}</button>))}
                </div>
                <p style={{ textAlign: "center", fontSize: 11, fontWeight: 300, color: "rgba(255,255,255,0.18)", marginTop: 16 }}>missiAI may make mistakes. Verify important information.</p>
              </div>
            </div>
          ) : (
            <div style={{ maxWidth: 720, width: "100%", margin: "0 auto", padding: "24px 20px", display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
              {messages.map((msg, idx) => (
                <div key={msg.id} className="msg-appear" style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start", animationDelay: `${idx * 0.04}s` }}>
                  {msg.role === "assistant" && <div style={{ width: 26, height: 26, borderRadius: 8, flexShrink: 0, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", display: "flex", alignItems: "center", justifyContent: "center", marginRight: 10, marginTop: 2 }}><SmallSparkle /></div>}
                  <div style={{ maxWidth: msg.role === "user" ? "75%" : "85%", padding: msg.role === "user" ? "10px 16px" : "10px 0", borderRadius: msg.role === "user" ? 18 : 0, background: msg.role === "user" ? "rgba(255,255,255,0.08)" : "transparent", border: msg.role === "user" ? "1px solid rgba(255,255,255,0.1)" : "none", color: msg.role === "user" ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.75)", fontSize: 14, lineHeight: 1.65, fontWeight: 300 }}>{msg.content}</div>
                </div>
              ))}
              {isTyping && <div className="msg-appear" style={{ display: "flex", alignItems: "flex-start", gap: 10 }}><div style={{ width: 26, height: 26, borderRadius: 8, flexShrink: 0, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", display: "flex", alignItems: "center", justifyContent: "center", marginTop: 2 }}><SmallSparkle /></div><TypingIndicator /></div>}
              <div ref={endRef} />
            </div>
          )}
        </div>

        {!isEmpty && (
          <div style={{ position: "relative", zIndex: 10, padding: "12px 20px 20px", background: "linear-gradient(to top, rgba(0,0,0,0.85) 60%, transparent)" }}>
            <div style={{ maxWidth: 720, margin: "0 auto" }}>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 8, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 28, padding: "8px 8px 8px 18px" }}>
                <textarea value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} placeholder="Message missiAI..." rows={1} style={{ flex: 1, background: "transparent", border: "none", color: "rgba(255,255,255,0.9)", fontSize: 14, fontWeight: 300, lineHeight: "24px", fontFamily: "'Inter',sans-serif", minHeight: 24, maxHeight: 160 }} />
                <button onClick={() => setIsListening(p => !p)} style={{ width: 36, height: 36, borderRadius: 18, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.2s", background: isListening ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: isListening ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.35)", animation: isListening ? "micPulse 1.5s ease-in-out infinite" : "none", cursor: "pointer" }}><MicIcon /></button>
                <button onClick={isTyping ? () => setIsTyping(false) : send} disabled={!hasText && !isTyping} style={{ width: 36, height: 36, borderRadius: 18, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.2s", background: isTyping ? "rgba(255,255,255,0.12)" : hasText ? "linear-gradient(135deg, rgba(255,255,255,0.95), rgba(220,220,225,0.9))" : "rgba(255,255,255,0.06)", border: (hasText || isTyping) ? "none" : "1px solid rgba(255,255,255,0.08)", color: isTyping ? "#fff" : hasText ? "#000" : "rgba(255,255,255,0.15)", cursor: (!hasText && !isTyping) ? "default" : "pointer", boxShadow: hasText && !isTyping ? "0 2px 12px rgba(255,255,255,0.15)" : "none" }}>{isTyping ? <StopIcon /> : <SendArrowIcon />}</button>
              </div>
              <p style={{ textAlign: "center", fontSize: 11, fontWeight: 300, color: "rgba(255,255,255,0.18)", marginTop: 10 }}>missiAI may make mistakes. Verify important information.</p>
            </div>
          </div>
        )}
      </div>
    </>
  );
}