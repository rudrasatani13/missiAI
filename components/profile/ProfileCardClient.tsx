'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft,
  Heart,
  Users,
  Target,
  Flame,
  Brain,
  Calendar,
  Trophy,
  Zap,
  Download,
  RefreshCw,
  User,
  Copy,
  Check,
  Palette,
} from 'lucide-react'
import { toast } from 'sonner'

// ─── Types ───────────────────────────────────────────────────────────────────

interface ProfileCardData {
  userName: string
  avatarTier: string
  level: number
  totalXP: number
  loginStreak: number
  topInterests: string[]
  peopleInMyWorld: string[]
  activeGoals: string[]
  topHabit: { title: string; currentStreak: number; longestStreak: number } | null
  personalitySnapshot: string
  memoryStats: {
    totalMemories: number
    mostTalkedAbout: string
    daysActive: number
    totalInteractions: number
  }
  unlockedAchievements: number
  generatedAt: string
}

// ─── Card Themes ─────────────────────────────────────────────────────────────

type CardThemeId = 'cosmos' | 'aurora' | 'sunset' | 'ocean' | 'midnight'

interface CardTheme {
  id: CardThemeId
  name: string
  preview: string // CSS gradient for the theme picker swatch
  card: {
    background: string
    shimmerStart: string
    shimmerEnd: string
    accentColor: string
    accentColorMuted: string
    pillBg: string
    pillBorder: string
    statBg: string
    statBorder: string
    divider: string
    textPrimary: string
    textSecondary: string
    textMuted: string
    textFaint: string
  }
}

const CARD_THEMES: CardTheme[] = [
  {
    id: 'cosmos',
    name: 'Cosmos',
    preview: 'linear-gradient(135deg, #1e1432, #06060e)',
    card: {
      background: 'radial-gradient(ellipse at 50% 30%, rgba(30,20,50,1) 0%, rgba(8,6,14,1) 50%, rgba(2,2,4,1) 100%)',
      shimmerStart: 'rgba(124,58,237,0.08)',
      shimmerEnd: 'rgba(139,92,246,0.05)',
      accentColor: 'rgba(139,92,246,0.6)',
      accentColorMuted: 'rgba(139,92,246,0.15)',
      pillBg: 'rgba(255,255,255,0.06)',
      pillBorder: 'rgba(255,255,255,0.08)',
      statBg: 'rgba(255,255,255,0.03)',
      statBorder: 'rgba(255,255,255,0.05)',
      divider: 'rgba(255,255,255,0.06)',
      textPrimary: 'rgba(255,255,255,0.9)',
      textSecondary: 'rgba(255,255,255,0.65)',
      textMuted: 'rgba(255,255,255,0.35)',
      textFaint: 'rgba(255,255,255,0.15)',
    },
  },
  {
    id: 'aurora',
    name: 'Aurora',
    preview: 'linear-gradient(135deg, #0a2e1f, #041510)',
    card: {
      background: 'radial-gradient(ellipse at 50% 20%, rgba(10,50,35,1) 0%, rgba(4,20,16,1) 50%, rgba(2,8,6,1) 100%)',
      shimmerStart: 'rgba(52,211,153,0.08)',
      shimmerEnd: 'rgba(16,185,129,0.05)',
      accentColor: 'rgba(52,211,153,0.6)',
      accentColorMuted: 'rgba(52,211,153,0.15)',
      pillBg: 'rgba(52,211,153,0.08)',
      pillBorder: 'rgba(52,211,153,0.12)',
      statBg: 'rgba(52,211,153,0.04)',
      statBorder: 'rgba(52,211,153,0.08)',
      divider: 'rgba(52,211,153,0.1)',
      textPrimary: 'rgba(220,255,240,0.9)',
      textSecondary: 'rgba(200,240,225,0.65)',
      textMuted: 'rgba(180,220,200,0.35)',
      textFaint: 'rgba(52,211,153,0.2)',
    },
  },
  {
    id: 'sunset',
    name: 'Sunset',
    preview: 'linear-gradient(135deg, #2e1a0a, #140806)',
    card: {
      background: 'radial-gradient(ellipse at 50% 25%, rgba(50,25,10,1) 0%, rgba(20,10,6,1) 50%, rgba(6,3,2,1) 100%)',
      shimmerStart: 'rgba(251,146,60,0.08)',
      shimmerEnd: 'rgba(244,63,94,0.05)',
      accentColor: 'rgba(251,146,60,0.6)',
      accentColorMuted: 'rgba(251,146,60,0.15)',
      pillBg: 'rgba(251,146,60,0.08)',
      pillBorder: 'rgba(251,146,60,0.12)',
      statBg: 'rgba(251,146,60,0.04)',
      statBorder: 'rgba(251,146,60,0.08)',
      divider: 'rgba(251,146,60,0.1)',
      textPrimary: 'rgba(255,240,220,0.9)',
      textSecondary: 'rgba(255,220,200,0.65)',
      textMuted: 'rgba(240,180,150,0.4)',
      textFaint: 'rgba(251,146,60,0.2)',
    },
  },
  {
    id: 'ocean',
    name: 'Ocean',
    preview: 'linear-gradient(135deg, #0a1e2e, #040e14)',
    card: {
      background: 'radial-gradient(ellipse at 50% 25%, rgba(10,35,55,1) 0%, rgba(4,14,22,1) 50%, rgba(2,6,10,1) 100%)',
      shimmerStart: 'rgba(56,189,248,0.08)',
      shimmerEnd: 'rgba(59,130,246,0.05)',
      accentColor: 'rgba(56,189,248,0.6)',
      accentColorMuted: 'rgba(56,189,248,0.15)',
      pillBg: 'rgba(56,189,248,0.08)',
      pillBorder: 'rgba(56,189,248,0.12)',
      statBg: 'rgba(56,189,248,0.04)',
      statBorder: 'rgba(56,189,248,0.08)',
      divider: 'rgba(56,189,248,0.1)',
      textPrimary: 'rgba(220,240,255,0.9)',
      textSecondary: 'rgba(200,225,255,0.65)',
      textMuted: 'rgba(150,200,240,0.35)',
      textFaint: 'rgba(56,189,248,0.2)',
    },
  },
  {
    id: 'midnight',
    name: 'Midnight',
    preview: 'linear-gradient(135deg, #1a1a0a, #0e0e04)',
    card: {
      background: 'radial-gradient(ellipse at 50% 25%, rgba(25,25,12,1) 0%, rgba(12,12,6,1) 50%, rgba(4,4,2,1) 100%)',
      shimmerStart: 'rgba(250,204,21,0.06)',
      shimmerEnd: 'rgba(234,179,8,0.04)',
      accentColor: 'rgba(250,204,21,0.5)',
      accentColorMuted: 'rgba(250,204,21,0.12)',
      pillBg: 'rgba(250,204,21,0.06)',
      pillBorder: 'rgba(250,204,21,0.1)',
      statBg: 'rgba(250,204,21,0.03)',
      statBorder: 'rgba(250,204,21,0.06)',
      divider: 'rgba(250,204,21,0.08)',
      textPrimary: 'rgba(255,250,220,0.9)',
      textSecondary: 'rgba(255,240,200,0.6)',
      textMuted: 'rgba(220,200,150,0.35)',
      textFaint: 'rgba(250,204,21,0.15)',
    },
  },
]

// ─── Tier color map ──────────────────────────────────────────────────────────

const TIER_COLORS: Record<string, { colorStart: string; colorEnd: string }> = {
  Spark:   { colorStart: 'hsl(0, 0%, 55%)',   colorEnd: 'hsl(0, 0%, 75%)' },
  Ember:   { colorStart: 'hsl(30, 60%, 50%)',  colorEnd: 'hsl(45, 70%, 65%)' },
  Flame:   { colorStart: 'hsl(15, 80%, 55%)',  colorEnd: 'hsl(35, 90%, 65%)' },
  Nova:    { colorStart: 'hsl(260, 60%, 55%)', colorEnd: 'hsl(280, 70%, 70%)' },
  Stellar: { colorStart: 'hsl(200, 70%, 55%)', colorEnd: 'hsl(320, 60%, 65%)' },
  Cosmic:  { colorStart: 'hsl(280, 80%, 55%)', colorEnd: 'hsl(180, 70%, 60%)' },
}

// ─── Social Platform SVG Icons ───────────────────────────────────────────────

function WhatsAppIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  )
}

function InstagramIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
    </svg>
  )
}

function FacebookIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  )
}

function SnapchatIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="147 39 515 515" fill="currentColor">
      <path d="M407 473.5c-1 0-2-.04-2.9-.08-.6.05-1.2.08-1.9.08-22.4 0-37.4-10.6-50.7-20-9.5-6.7-18.4-13-28.9-14.8-5.1-.85-10.3-1.3-15.2-1.3-8.9 0-16 1.4-21.1 2.4-3.2.6-5.9 1.1-8 1.1-2.2 0-4.9-.5-6-4.3-.9-3-1.5-5.9-2.1-8.7-1.5-7-2.7-11.3-5.3-11.7-28.1-4.3-44.8-10.7-48.1-18.5-.3-.8-.5-1.6-.6-2.4-.1-2.3 1.5-4.3 3.8-4.7 22.3-3.7 42.2-15.5 59.1-35.1 13-15.2 19.5-29.7 20.1-31.3l.1-.2c3.2-6.6 3.9-12.3 1.9-16.9-3.6-8.6-15.6-12.4-23.6-14.9-2-.6-3.8-1.2-5.3-1.8-7-2.8-18.6-8.7-17.1-16.8 1.1-5.9 9-10 15.3-10 1.8 0 3.3.3 4.6.9 7.1 3.3 13.6 5 19.1 5 6.9 0 10.2-2.6 11-3.4-.2-3.7-.4-7.5-.7-11.2v-.05c-1.6-25.7-3.6-57.6 4.5-76 24.5-54.8 76.3-59.1 91.7-59.1.4 0 6.7-.06 6.7-.06.3 0 .6-.01.9-.01 15.4 0 67.3 4.3 91.8 59.2 8.2 18.3 6.2 50.3 4.5 76l-.1 1.2c-.2 3.5-.4 6.8-.6 10 .8.7 3.8 3.1 10 3.3 5.3-.2 11.3-1.9 18-5 2.1-1 4.3-1.2 5.9-1.2 2.3 0 4.7.5 6.7 1.3l.1.04c5.7 2 9.4 6 9.4 10.2.1 3.9-2.9 9.8-17.2 15.5-1.5.6-3.4 1.2-5.3 1.8-8 2.5-20 6.3-23.6 14.9-2 4.6-1.3 10.3 1.9 16.9l.1.2c1 2.3 25.2 57.5 79.2 66.4 2.3.4 3.9 2.4 3.8 4.7 0 .8-.2 1.7-.6 2.5-3.3 7.7-19.9 14.1-48.1 18.4-2.6.4-3.8 4.7-5.3 11.7-.6 2.9-1.3 5.7-2.1 8.7-.8 2.8-2.6 4.2-5.6 4.2h-.4c-1.9 0-4.6-.3-8-1-6-1.2-12.6-2.2-21.1-2.2-5 0-10.1.4-15.2 1.3-10.5 1.7-19.4 8.1-28.9 14.8-13.3 9.4-27.1 19.1-48.1 19.1" />
    </svg>
  )
}

function XTwitterIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  )
}

function TelegramIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
    </svg>
  )
}

// ─── Social Share Button Data ────────────────────────────────────────────────

interface SocialPlatform {
  id: string
  name: string
  icon: typeof WhatsAppIcon
  color: string
  bgColor: string
  borderColor: string
  action: 'native-share' | 'download' | 'url' | 'copy'
  getUrl?: (text: string) => string
}

const SHARE_TEXT = 'See what my AI companion knows about me'
const SHARE_URL = 'https://missi.space'
const SHARE_FULL_TEXT = `${SHARE_TEXT} — ${SHARE_URL}`

const SOCIAL_PLATFORMS: SocialPlatform[] = [
  {
    id: 'whatsapp',
    name: 'WhatsApp',
    icon: WhatsAppIcon,
    color: 'rgba(255,255,255,0.7)',
    bgColor: 'rgba(255,255,255,0.06)',
    borderColor: 'rgba(255,255,255,0.1)',
    action: 'url',
    getUrl: (text: string) => `https://wa.me/?text=${encodeURIComponent(text)}`,
  },
  {
    id: 'instagram',
    name: 'Instagram',
    icon: InstagramIcon,
    color: 'rgba(255,255,255,0.7)',
    bgColor: 'rgba(255,255,255,0.06)',
    borderColor: 'rgba(255,255,255,0.1)',
    action: 'download',
  },
  {
    id: 'facebook',
    name: 'Facebook',
    icon: FacebookIcon,
    color: 'rgba(255,255,255,0.7)',
    bgColor: 'rgba(255,255,255,0.06)',
    borderColor: 'rgba(255,255,255,0.1)',
    action: 'url',
    getUrl: () => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(SHARE_URL)}&quote=${encodeURIComponent(SHARE_TEXT)}`,
  },
  {
    id: 'snapchat',
    name: 'Snapchat',
    icon: SnapchatIcon,
    color: 'rgba(255,255,255,0.7)',
    bgColor: 'rgba(255,255,255,0.06)',
    borderColor: 'rgba(255,255,255,0.1)',
    action: 'download',
  },
  {
    id: 'x',
    name: 'X',
    icon: XTwitterIcon,
    color: 'rgba(255,255,255,0.7)',
    bgColor: 'rgba(255,255,255,0.06)',
    borderColor: 'rgba(255,255,255,0.1)',
    action: 'url',
    getUrl: (text: string) => `https://x.com/intent/tweet?text=${encodeURIComponent(text)}`,
  },
  {
    id: 'telegram',
    name: 'Telegram',
    icon: TelegramIcon,
    color: 'rgba(255,255,255,0.7)',
    bgColor: 'rgba(255,255,255,0.06)',
    borderColor: 'rgba(255,255,255,0.1)',
    action: 'url',
    getUrl: (text: string) => `https://t.me/share/url?url=${encodeURIComponent(SHARE_URL)}&text=${encodeURIComponent(text)}`,
  },
]

// ─── Sub-components ──────────────────────────────────────────────────────────

function EmptyPlaceholder() {
  return (
    <p className="text-xs font-light italic" style={{ color: 'rgba(255,255,255,0.25)' }}>
      Keep chatting — Missi is learning
    </p>
  )
}

function SectionHeader({ icon: Icon, label, theme }: { icon: typeof Heart; label: string; theme: CardTheme }) {
  return (
    <div className="flex items-center gap-1.5 mb-2.5">
      <Icon className="w-3 h-3" style={{ color: theme.card.textMuted }} />
      <span className="text-[9px] font-semibold tracking-[0.15em] uppercase" style={{ color: theme.card.textMuted }}>
        {label}
      </span>
    </div>
  )
}

function StatBox({ label, value, theme }: { label: string; value: string; theme: CardTheme }) {
  return (
    <div
      className="rounded-xl px-3 py-2.5"
      style={{ background: theme.card.statBg, border: `1px solid ${theme.card.statBorder}` }}
    >
      <p className="text-[9px] font-light m-0 mb-1" style={{ color: theme.card.textMuted }}>{label}</p>
      <p className="text-sm font-medium m-0 truncate" style={{ color: theme.card.textSecondary }}>{value}</p>
    </div>
  )
}

// ─── Theme Selector ──────────────────────────────────────────────────────────

function ThemeSelector({
  current,
  onChange,
}: {
  current: CardThemeId
  onChange: (id: CardThemeId) => void
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-1.5">
        <Palette className="w-3.5 h-3.5" style={{ color: 'rgba(255,255,255,0.3)' }} />
        <span className="text-[10px] font-medium tracking-wide" style={{ color: 'rgba(255,255,255,0.3)' }}>
          Theme
        </span>
      </div>
      <div className="flex gap-2">
        {CARD_THEMES.map((t) => (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            title={t.name}
            className="relative transition-all hover:scale-110"
            style={{
              width: 28,
              height: 28,
              borderRadius: '50%',
              background: t.preview,
              border: current === t.id ? '2px solid rgba(255,255,255,0.6)' : '2px solid rgba(255,255,255,0.1)',
              cursor: 'pointer',
              boxShadow: current === t.id ? '0 0 12px rgba(255,255,255,0.15)' : 'none',
            }}
          >
            {current === t.id && (
              <div className="absolute inset-0 flex items-center justify-center">
                <Check className="w-3 h-3 text-white" />
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── Share Sheet (bottom sheet modal) ────────────────────────────────────────

function ShareSheet({
  open,
  onClose,
  onCapture,
  capturing,
}: {
  open: boolean
  onClose: () => void
  onCapture: (platform: SocialPlatform) => void
  capturing: string | null
}) {
  const [copied, setCopied] = useState(false)

  const handleCopyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(`${SHARE_TEXT} — ${SHARE_URL}`)
      setCopied(true)
      toast('Link copied!')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast('Failed to copy')
    }
  }, [])

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50"
            style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
            onClick={onClose}
          />

          {/* Sheet */}
          <motion.div
            initial={{ opacity: 0, y: 100 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 80 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="fixed bottom-0 left-0 right-0 z-50 flex justify-center px-4 pb-6"
          >
            <div
              className="w-full max-w-[420px] rounded-2xl"
              style={{
                background: 'rgba(18,18,22,0.98)',
                border: '1px solid rgba(255,255,255,0.08)',
                boxShadow: '0 -10px 60px rgba(0,0,0,0.5)',
                backdropFilter: 'blur(24px)',
              }}
            >
              {/* Handle bar */}
              <div className="flex justify-center pt-3 pb-1">
                <div className="w-10 h-1 rounded-full" style={{ background: 'rgba(255,255,255,0.15)' }} />
              </div>

              {/* Title */}
              <div className="text-center px-5 pt-2 pb-4">
                <p className="text-[11px] font-semibold tracking-[0.15em] uppercase m-0" style={{ color: 'rgba(255,255,255,0.4)' }}>
                  Share to
                </p>
              </div>

              {/* Platform icons — horizontal scroll, no boxes */}
              <div
                className="flex gap-6 px-6 pb-5 overflow-x-auto"
                style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' }}
              >
                {SOCIAL_PLATFORMS.map((platform) => {
                  const Icon = platform.icon
                  const isCapturing = capturing === platform.id
                  return (
                    <button
                      key={platform.id}
                      onClick={() => onCapture(platform)}
                      disabled={capturing !== null}
                      className="flex flex-col items-center gap-1.5 shrink-0 transition-opacity hover:opacity-80 active:opacity-60"
                      style={{
                        background: 'none',
                        border: 'none',
                        padding: 0,
                        cursor: capturing !== null ? 'default' : 'pointer',
                        opacity: capturing !== null && !isCapturing ? 0.3 : 1,
                      }}
                    >
                      <div
                        className="flex items-center justify-center rounded-full"
                        style={{
                          width: 50,
                          height: 50,
                          background: platform.bgColor,
                          color: platform.color,
                        }}
                      >
                        {isCapturing ? (
                          <div className="w-5 h-5 rounded-full border-2 animate-spin" style={{ borderColor: 'transparent', borderTopColor: platform.color }} />
                        ) : (
                          <Icon size={24} />
                        )}
                      </div>
                      <span className="text-[10px] font-medium" style={{ color: 'rgba(255,255,255,0.45)' }}>
                        {platform.name}
                      </span>
                    </button>
                  )
                })}

                {/* Copy Link */}
                <button
                  onClick={handleCopyLink}
                  className="flex flex-col items-center gap-1.5 shrink-0 transition-opacity hover:opacity-80 active:opacity-60"
                  style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                >
                  <div
                    className="flex items-center justify-center rounded-full"
                    style={{
                      width: 50,
                      height: 50,
                      background: copied ? 'rgba(74,222,128,0.12)' : 'rgba(255,255,255,0.06)',
                    }}
                  >
                    {copied ? (
                      <Check className="w-6 h-6" style={{ color: '#4ade80' }} />
                    ) : (
                      <Copy className="w-6 h-6" style={{ color: 'rgba(255,255,255,0.45)' }} />
                    )}
                  </div>
                  <span className="text-[10px] font-medium" style={{ color: copied ? '#4ade80' : 'rgba(255,255,255,0.4)' }}>
                    {copied ? 'Copied!' : 'Copy'}
                  </span>
                </button>
              </div>

              {/* Divider + Cancel */}
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                <button
                  onClick={onClose}
                  className="w-full py-3.5 text-[13px] font-medium transition-all active:bg-white/[0.03]"
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'rgba(255,255,255,0.35)',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function ProfileCardClient() {
  const [data, setData] = useState<ProfileCardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [capturing, setCapturing] = useState<string | null>(null)
  const [activeTheme, setActiveTheme] = useState<CardThemeId>('cosmos')
  const [shareSheetOpen, setShareSheetOpen] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)

  const theme = CARD_THEMES.find(t => t.id === activeTheme) ?? CARD_THEMES[0]

  const fetchCard = useCallback(async (refresh = false) => {
    setLoading(true)
    setError(false)
    try {
      const url = refresh ? '/api/v1/profile/card?refresh=true' : '/api/v1/profile/card'
      const res = await fetch(url)
      if (!res.ok) throw new Error('Failed to fetch')
      const json = await res.json() as { success: boolean; data: ProfileCardData }
      if (!json.success || !json.data) throw new Error('Invalid response')
      setData(json.data)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchCard() }, [fetchCard])

  // ── Capture card and share to a platform ───────────────────────────────

  const captureAndShare = useCallback(async (platform: SocialPlatform) => {
    if (!cardRef.current || capturing) return
    setCapturing(platform.id)

    try {
      const html2canvas = (await import('html2canvas')).default
      const canvas = await html2canvas(cardRef.current, {
        backgroundColor: '#000000',
        scale: 2,
        useCORS: true,
        logging: false,
      })

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          b => (b ? resolve(b) : reject(new Error('Canvas to blob failed'))),
          'image/png'
        )
      })

      const fileName = `missi-profile-${data?.userName?.toLowerCase().replace(/\s+/g, '-') || 'card'}.png`

      // For platforms that support native sharing with files (mobile)
      if (platform.action === 'native-share' && navigator.share && navigator.canShare) {
        const file = new File([blob], fileName, { type: 'image/png' })
        const shareData = { title: 'My Missi AI Profile', text: SHARE_TEXT, files: [file] }
        if (navigator.canShare(shareData)) {
          await navigator.share(shareData)
          toast('Profile shared!')
          setCapturing(null)
          return
        }
      }

      // For WhatsApp/Instagram/Snapchat on mobile — try native share with image first
      if ((platform.id === 'whatsapp' || platform.id === 'instagram' || platform.id === 'snapchat') &&
          navigator.share && navigator.canShare) {
        const file = new File([blob], fileName, { type: 'image/png' })
        const shareData = { title: 'My Missi AI Profile', text: SHARE_TEXT, files: [file] }
        if (navigator.canShare(shareData)) {
          await navigator.share(shareData)
          toast(`Shared to ${platform.name}!`)
          setCapturing(null)
          return
        }
      }

      // For URL-based platforms — download image first, then open share URL
      if (platform.action === 'url' && platform.getUrl) {
        // Download the image
        downloadBlob(blob, fileName)

        // Open the platform share URL
        const shareUrl = platform.getUrl(SHARE_FULL_TEXT)
        window.open(shareUrl, '_blank', 'noopener,noreferrer')
        toast(`Image saved! Share it on ${platform.name}`)
        setCapturing(null)
        return
      }

      // Download fallback (for Instagram, Snapchat, or explicit download)
      downloadBlob(blob, fileName)
      if (platform.id === 'instagram') {
        toast('Image saved! Share it to your Instagram Story')
      } else if (platform.id === 'snapchat') {
        toast('Image saved! Share it on Snapchat')
      } else {
        toast('Profile card saved!')
      }
    } catch {
      toast('Failed to capture profile card')
    } finally {
      setCapturing(null)
    }
  }, [data?.userName, capturing])

  // ── Loading skeleton ───────────────────────────────────────────────────────

  if (loading) {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-start px-4 py-8 md:py-12"
        style={{ background: 'radial-gradient(ellipse at 50% 0%, rgba(20,20,30,1) 0%, #000000 60%)' }}
      >
        <div className="w-full max-w-[640px]">
          <div className="mb-10">
            <Link href="/chat" className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full opacity-50 hover:opacity-90 transition-all hover:bg-white/5 no-underline" style={{ color: 'white' }}>
              <ArrowLeft className="w-4 h-4" />
              <span className="text-xs font-light tracking-wide">Back</span>
            </Link>
          </div>
          <div className="rounded-3xl overflow-hidden" style={{ background: 'rgba(12,12,16,0.95)', border: '1px solid rgba(255,255,255,0.08)', height: 600, animation: 'pulse 1.5s ease-in-out infinite' }} />
        </div>
        <style>{`@keyframes pulse { 0%, 100% { opacity: 0.5; } 50% { opacity: 1; } }`}</style>
      </div>
    )
  }

  // ── Error state ────────────────────────────────────────────────────────────

  if (error || !data) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4" style={{ background: 'radial-gradient(ellipse at 50% 0%, rgba(20,20,30,1) 0%, #000000 60%)' }}>
        <p className="text-sm mb-4" style={{ color: 'rgba(255,255,255,0.4)' }}>Could not load your profile card.</p>
        <button onClick={() => fetchCard()} className="px-5 py-2 rounded-full text-xs font-medium transition-all hover:scale-105" style={{ border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.7)', cursor: 'pointer' }}>
          Try again
        </button>
      </div>
    )
  }

  const tierColors = TIER_COLORS[data.avatarTier] ?? TIER_COLORS.Spark
  const t = theme.card

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-start px-4 py-8 md:py-12"
      style={{ background: 'radial-gradient(ellipse at 50% 0%, rgba(20,20,30,1) 0%, #000000 60%)' }}
    >
      {/* Ambient background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-20%] left-[20%] w-[500px] h-[500px] rounded-full" style={{ background: 'radial-gradient(circle, rgba(124,58,237,0.06) 0%, transparent 70%)' }} />
        <div className="absolute bottom-[-10%] right-[10%] w-[400px] h-[400px] rounded-full" style={{ background: 'radial-gradient(circle, rgba(59,130,246,0.04) 0%, transparent 70%)' }} />
      </div>

      <div className="w-full max-w-[640px] relative z-10">
        {/* Header: Back + Refresh */}
        <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.3 }} className="flex items-center justify-between mb-6">
          <Link href="/chat" className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full opacity-50 hover:opacity-90 transition-all hover:bg-white/5 no-underline" style={{ color: 'white' }}>
            <ArrowLeft className="w-4 h-4" />
            <span className="text-xs font-light tracking-wide">Back</span>
          </Link>
          <button
            onClick={() => fetchCard(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-light transition-all hover:scale-105 hover:bg-white/5"
            style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.4)', cursor: 'pointer' }}
          >
            <RefreshCw className="w-3 h-3" />
            Refresh
          </button>
        </motion.div>

        {/* Theme Selector */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }} className="flex justify-center mb-5">
          <ThemeSelector current={activeTheme} onChange={setActiveTheme} />
        </motion.div>

        {/* ═══════════════════════════════════════════════════════════════════
            THE SHAREABLE CARD
            ═══════════════════════════════════════════════════════════════════ */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTheme}
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          >
            <div
              ref={cardRef}
              id="missi-profile-card"
              className="relative rounded-3xl overflow-hidden"
              style={{
                background: t.background,
                border: '1px solid rgba(255,255,255,0.06)',
                boxShadow: '0 20px 60px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05)',
                padding: '40px 32px 28px',
              }}
            >
              {/* Subtle top glow — static, no animation */}
              <div
                className="absolute top-0 left-[10%] right-[10%] h-[250px] pointer-events-none"
                style={{
                  background: `radial-gradient(ellipse at 50% 0%, ${t.shimmerStart} 0%, transparent 70%)`,
                }}
              />

              {/* ── Header: Orb + Name ─────────────────────────────────────── */}
              <div className="relative flex flex-col items-center mb-6">
                <div className="relative mb-4">
                  <div
                    className="absolute inset-0 rounded-full"
                    style={{
                      background: `radial-gradient(circle, ${tierColors.colorStart}40, transparent 70%)`,
                      filter: 'blur(16px)',
                      transform: 'scale(1.6)',
                      animation: 'orbPulse 3s ease-in-out infinite',
                    }}
                  />
                  <div
                    className="relative flex items-center justify-center"
                    style={{
                      width: 80,
                      height: 80,
                      borderRadius: '50%',
                      background: `linear-gradient(135deg, ${tierColors.colorStart}, ${tierColors.colorEnd})`,
                      boxShadow: `0 0 30px ${tierColors.colorStart}40, 0 0 60px ${tierColors.colorStart}15`,
                    }}
                  >
                    <span className="text-white font-medium" style={{ fontSize: 32, lineHeight: 1 }}>
                      {data.userName.charAt(0).toUpperCase()}
                    </span>
                  </div>
                </div>
                <h2 className="font-semibold m-0" style={{ fontSize: 24, color: t.textPrimary }}>{data.userName}</h2>
                <p className="mt-1" style={{ fontSize: 13, color: t.textMuted }}>{data.avatarTier} · Level {data.level}</p>
              </div>

              {/* ── Personality Snapshot ────────────────────────────────────── */}
              <div className="text-center mb-6 pb-6" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <p className="italic m-0 px-4" style={{ fontSize: 14, color: t.textSecondary, lineHeight: 1.6 }}>
                  &ldquo;{data.personalitySnapshot}&rdquo;
                </p>
              </div>

              {/* ── 2-Column Grid ─────────────────────────────────────────── */}
              <div className="grid gap-5 mb-6" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
                {/* What I Love */}
                <div>
                  <SectionHeader icon={Heart} label="What I Love" theme={theme} />
                  {data.topInterests.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {data.topInterests.map((interest, i) => (
                        <span key={i} className="inline-block px-2.5 py-1 rounded-full text-[10px] font-medium" style={{ background: t.pillBg, border: `1px solid ${t.pillBorder}`, color: t.textSecondary }}>
                          {interest}
                        </span>
                      ))}
                    </div>
                  ) : <EmptyPlaceholder />}
                </div>

                {/* My People */}
                <div>
                  <SectionHeader icon={Users} label="My People" theme={theme} />
                  {data.peopleInMyWorld.length > 0 ? (
                    <div className="flex flex-col gap-1.5">
                      {data.peopleInMyWorld.map((person, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <User className="w-3 h-3 shrink-0" style={{ color: t.textMuted }} />
                          <span className="text-[11px] font-light" style={{ color: t.textSecondary }}>{person}</span>
                        </div>
                      ))}
                    </div>
                  ) : <EmptyPlaceholder />}
                </div>

                {/* My Goals */}
                <div>
                  <SectionHeader icon={Target} label="My Goals" theme={theme} />
                  {data.activeGoals.length > 0 ? (
                    <div className="flex flex-col gap-1.5">
                      {data.activeGoals.map((goal, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <Target className="w-3 h-3 shrink-0" style={{ color: t.textMuted }} />
                          <span className="text-[11px] font-light" style={{ color: t.textSecondary }}>{goal}</span>
                        </div>
                      ))}
                    </div>
                  ) : <EmptyPlaceholder />}
                </div>

                {/* My Streak */}
                <div>
                  <SectionHeader icon={Flame} label="My Streak" theme={theme} />
                  {data.topHabit ? (
                    <div>
                      <p className="text-[11px] font-light m-0 mb-1.5" style={{ color: t.textSecondary }}>{data.topHabit.title}</p>
                      <div className="flex items-baseline gap-2">
                        <span className="font-semibold" style={{ fontSize: 28, color: t.textPrimary, lineHeight: 1 }}>{data.topHabit.currentStreak}</span>
                        <span className="text-[10px] font-light" style={{ color: t.textMuted }}>day streak</span>
                      </div>
                      <p className="text-[10px] font-light m-0 mt-1" style={{ color: t.textFaint }}>Best: {data.topHabit.longestStreak} days</p>
                    </div>
                  ) : <EmptyPlaceholder />}
                </div>
              </div>

              {/* ── Memory Stats 2×2 ──────────────────────────────────────── */}
              <div className="mb-6">
                <SectionHeader icon={Brain} label="Memory Stats" theme={theme} />
                <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
                  <StatBox label="Total Memories" value={String(data.memoryStats.totalMemories)} theme={theme} />
                  <StatBox label="Days Active" value={String(data.memoryStats.daysActive)} theme={theme} />
                  <StatBox label="Most Talked About" value={data.memoryStats.mostTalkedAbout} theme={theme} />
                  <StatBox label="Total Interactions" value={String(data.memoryStats.totalInteractions)} theme={theme} />
                </div>
              </div>

              {/* ── Bottom Bar ─────────────────────────────────────────────── */}
              <div className="flex items-center justify-between pt-4" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <Zap className="w-3 h-3" style={{ color: t.textMuted }} />
                    <span className="text-[10px] font-medium" style={{ color: t.textMuted }}>{data.totalXP} XP</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Calendar className="w-3 h-3" style={{ color: t.textMuted }} />
                    <span className="text-[10px] font-medium" style={{ color: t.textMuted }}>{data.loginStreak}-day login</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Trophy className="w-3 h-3" style={{ color: t.textMuted }} />
                    <span className="text-[10px] font-medium" style={{ color: t.textMuted }}>{data.unlockedAchievements} achievements</span>
                  </div>
                </div>
                <div className="w-16">
                  <div className="w-full rounded-full overflow-hidden" style={{ height: 3, background: `${t.accentColorMuted}` }}>
                    <div className="h-full rounded-full" style={{ width: `${Math.min(100, (data.totalXP % 100))}%`, background: `linear-gradient(90deg, ${tierColors.colorStart}, ${tierColors.colorEnd})` }} />
                  </div>
                </div>
              </div>

              {/* ── Branding footer ────────────────────────────────────────── */}
              <div className="text-center mt-5">
                <span className="text-[9px] font-light tracking-wider" style={{ color: t.textFaint }}>missi intelligence</span>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>

        {/* ── Two Clean Buttons (outside shareable card) ────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="flex items-center justify-center gap-3 mt-6 mb-16"
        >
          <button
            onClick={() => captureAndShare({ id: 'download', name: 'Download', icon: Download as never, color: '#fff', bgColor: '', borderColor: '', action: 'download' })}
            disabled={capturing !== null}
            className="flex items-center gap-2 px-5 py-2.5 rounded-full text-xs font-medium transition-all hover:scale-105 active:scale-95"
            style={{
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: 'rgba(255,255,255,0.6)',
              cursor: capturing !== null ? 'default' : 'pointer',
              boxShadow: '0 2px 12px rgba(0,0,0,0.2)',
            }}
          >
            <Download className="w-3.5 h-3.5" />
            Download PNG
          </button>

          <button
            onClick={() => setShareSheetOpen(true)}
            className="flex items-center gap-2 px-6 py-2.5 rounded-full text-xs font-medium transition-all hover:scale-105 active:scale-95"
            style={{
              background: 'linear-gradient(135deg, rgba(255,255,255,0.14), rgba(255,255,255,0.06))',
              border: '1px solid rgba(255,255,255,0.18)',
              color: 'rgba(255,255,255,0.9)',
              cursor: 'pointer',
              boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
            }}
          >
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
            </svg>
            Share Your Profile
          </button>
        </motion.div>
      </div>

      {/* Share Sheet Modal */}
      <ShareSheet
        open={shareSheetOpen}
        onClose={() => setShareSheetOpen(false)}
        onCapture={(platform) => {
          captureAndShare(platform)
          // Don't close immediately — let the capture finish, then auto-close
          setTimeout(() => setShareSheetOpen(false), 1500)
        }}
        capturing={capturing}
      />

      <style>{`
        @keyframes orbPulse {
          0%, 100% { opacity: 0.6; transform: scale(1.5); }
          50% { opacity: 0.9; transform: scale(1.7); }
        }
      `}</style>
    </div>
  )
}

// ─── Utility ─────────────────────────────────────────────────────────────────

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
