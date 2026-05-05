import Link from "next/link"
import Image from "next/image"

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[var(--missi-bg)] text-[var(--missi-text-primary)] flex flex-col items-center justify-center px-6 relative overflow-hidden">
      {/* Subtle radial glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 60% 40% at 50% 40%, var(--missi-text-muted), transparent)",
        }}
      />

      <div className="relative z-10 flex flex-col items-center text-center max-w-md">
        {/* Logo */}
        <div className="mb-10 select-none">
          <Image
            src="/missi-ai-logo.png"
            alt="missi"
            width={52}
            height={52}
            className="h-10 w-10 md:h-12 md:w-12 object-contain opacity-80 pointer-events-none"
            draggable={false}
            priority
          />
        </div>

        {/* 404 indicator */}
        <div
          className="text-[120px] md:text-[160px] font-semibold leading-none tracking-tighter select-none"
          style={{ color: "var(--missi-text-muted)" }}
          data-testid="not-found-404-text"
        >
          404
        </div>

        {/* Message */}
        <h1
          className="text-xl md:text-2xl font-medium tracking-tight -mt-6 mb-3"
          data-testid="not-found-heading"
        >
          This page doesn&apos;t exist
        </h1>
        <p
          className="text-sm font-light leading-relaxed mb-10"
          style={{ color: "var(--missi-text-muted)" }}
        >
          The page you&apos;re looking for has been moved, deleted, or never
          existed in the first place.
        </p>

        {/* CTA */}
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-7 py-3 rounded-full text-sm font-medium transition-all duration-300 hover:scale-[1.03]"
          style={{ background: "var(--missi-border)", color: "var(--missi-text-primary)" }}
          data-testid="not-found-home-button"
        >
          Back to missi.space
        </Link>
      </div>
    </div>
  )
}
