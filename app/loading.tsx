export default function Loading() {
  return (
    <div
      className="min-h-screen bg-[var(--missi-bg)] flex flex-col"
      data-testid="loading-skeleton"
    >
      {/* Nav skeleton */}
      <div className="flex items-center justify-between px-6 md:px-10 py-5">
        <div
          className="w-9 h-9 rounded-full animate-pulse"
          style={{ background: "var(--missi-surface)" }}
        />
        <div className="flex items-center gap-3">
          <div
            className="w-20 h-8 rounded-full animate-pulse"
            style={{ background: "var(--missi-surface)" }}
          />
          <div
            className="w-24 h-8 rounded-full animate-pulse"
            style={{ background: "var(--missi-surface)" }}
          />
        </div>
      </div>

      {/* Hero skeleton */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 pb-24">
        {/* Badge */}
        <div
          className="w-36 h-6 rounded-full mb-8 animate-pulse"
          style={{ background: "var(--missi-surface)" }}
        />
        {/* Logo placeholder */}
        <div
          className="w-48 h-12 md:w-64 md:h-16 rounded-lg mb-6 animate-pulse"
          style={{ background: "var(--missi-surface)" }}
        />
        {/* Headline */}
        <div
          className="w-72 md:w-96 h-10 md:h-14 rounded-lg mb-6 animate-pulse"
          style={{ background: "var(--missi-border)" }}
        />
        {/* Subtext */}
        <div className="flex flex-col items-center gap-2 mb-10">
          <div
            className="w-80 h-4 rounded animate-pulse"
            style={{ background: "var(--missi-border)" }}
          />
          <div
            className="w-64 h-4 rounded animate-pulse"
            style={{ background: "var(--missi-border)" }}
          />
        </div>
        {/* CTA buttons */}
        <div className="flex items-center gap-3">
          <div
            className="w-32 h-11 rounded-full animate-pulse"
            style={{ background: "var(--missi-surface)" }}
          />
          <div
            className="w-36 h-11 rounded-full animate-pulse"
            style={{ background: "var(--missi-border)" }}
          />
        </div>
      </div>
    </div>
  )
}
