import Link from "next/link"
import Image from "next/image"
import { ArrowLeft } from "lucide-react"

export default function LegalLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <nav className="flex items-center justify-between px-6 md:px-10 py-5 max-w-3xl mx-auto">
        <Link
          href="/"
          className="flex items-center gap-2 transition-opacity hover:opacity-70"
          style={{ color: "rgba(255,255,255,0.45)" }}
          data-testid="legal-back-home"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="text-xs font-light tracking-wide">Home</span>
        </Link>
        <Image
          src="/missi-ai-logo.png"
          alt="missiAI"
          width={28}
          height={28}
          className="w-6 h-6 opacity-40 brightness-0 invert pointer-events-none select-none"
          draggable={false}
        />
      </nav>

      {/* Content */}
      <main className="max-w-3xl mx-auto px-6 md:px-10 pb-20">
        <article
          className="prose-custom"
          style={{ fontSize: "16px", lineHeight: 1.85 }}
        >
          {children}
        </article>
      </main>
    </div>
  )
}
