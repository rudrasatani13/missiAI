import type { Metadata } from "next"

export const runtime = "edge"
export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Privacy Policy — missiAI",
  description: "How missiAI handles your data, voice recordings, and personal information.",
}

export default function PrivacyPolicy() {
  return (
    <div data-testid="privacy-policy-page">
      <h1
        className="text-3xl md:text-4xl font-semibold tracking-tight mb-3"
        data-testid="privacy-heading"
      >
        Privacy Policy
      </h1>
      <p
        className="text-sm mb-12"
        style={{ color: "rgba(255,255,255,0.3)" }}
      >
        Last updated: March 2026
      </p>

      <div className="space-y-10">
        {/* Intro */}
        <section>
          <p style={{ color: "rgba(255,255,255,0.55)" }}>
            missiAI is a voice AI assistant built with your privacy in mind. This
            policy explains what data we collect, how we use it, and what control
            you have over it. We keep things simple and transparent — no walls of
            legalese.
          </p>
        </section>

        {/* What we collect */}
        <section>
          <h2
            className="text-lg font-medium tracking-tight mb-4 text-white"
            data-testid="privacy-section-data-collected"
          >
            What data we collect
          </h2>
          <div className="space-y-4" style={{ color: "rgba(255,255,255,0.5)" }}>
            <div>
              <p className="font-medium text-white/70 mb-1">Voice recordings</p>
              <p>
                Your voice is sent to our speech-to-text service for real-time
                transcription. Audio is processed in-flight and is{" "}
                <strong className="text-white/70">not stored</strong> on our
                servers after processing.
              </p>
            </div>
            <div>
              <p className="font-medium text-white/70 mb-1">Conversation text</p>
              <p>
                The text of your conversations is held in your browser session
                only. It is sent to our AI service to generate responses but is
                not persisted on our servers beyond the active session.
              </p>
            </div>
            <div>
              <p className="font-medium text-white/70 mb-1">Memory facts</p>
              <p>
                missiAI extracts key facts from your conversations (preferences,
                habits, context) and stores them in Cloudflare KV tied to your
                account. These memories power the personalized experience.
              </p>
            </div>
            <div>
              <p className="font-medium text-white/70 mb-1">Account information</p>
              <p>
                We use Clerk for authentication. Clerk collects your email
                address and basic profile information when you sign up. We do
                not store passwords — Clerk handles authentication securely.
              </p>
            </div>
          </div>
        </section>

        {/* How we use data */}
        <section>
          <h2
            className="text-lg font-medium tracking-tight mb-4 text-white"
            data-testid="privacy-section-data-usage"
          >
            How we use your data
          </h2>
          <p style={{ color: "rgba(255,255,255,0.5)" }}>
            Your data is used exclusively to provide AI responses and memory
            features within missiAI. We do not sell, share, or monetize your
            personal data. We do not use your conversations to train AI models.
            Your data exists to make missi work better for{" "}
            <em>you</em> — nothing else.
          </p>
        </section>

        {/* Third party services */}
        <section>
          <h2
            className="text-lg font-medium tracking-tight mb-4 text-white"
            data-testid="privacy-section-third-party"
          >
            Third-party services
          </h2>
          <p className="mb-4" style={{ color: "rgba(255,255,255,0.5)" }}>
            missiAI integrates with the following services to provide its
            functionality:
          </p>
          <div
            className="rounded-xl overflow-hidden"
            style={{ border: "1px solid rgba(255,255,255,0.06)" }}
          >
            {[
              {
                service: "Google Gemini API",
                purpose: "AI chat responses and memory extraction",
              },
              {
                service: "ElevenLabs",
                purpose: "Speech-to-text and text-to-speech",
              },
              {
                service: "Clerk",
                purpose: "User authentication and account management",
              },
            ].map((item, i) => (
              <div
                key={i}
                className="flex items-start gap-4 px-5 py-3.5 text-sm"
                style={{
                  borderBottom:
                    i < 2 ? "1px solid rgba(255,255,255,0.04)" : "none",
                  background:
                    i % 2 === 0 ? "rgba(255,255,255,0.01)" : "transparent",
                }}
              >
                <span className="font-medium text-white/70 min-w-[140px]">
                  {item.service}
                </span>
                <span style={{ color: "rgba(255,255,255,0.45)" }}>
                  {item.purpose}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-4 text-sm" style={{ color: "rgba(255,255,255,0.35)" }}>
            Each service has its own privacy policy. We recommend reviewing them
            if you want full details on how they handle data.
          </p>
        </section>

        {/* Data retention */}
        <section>
          <h2
            className="text-lg font-medium tracking-tight mb-4 text-white"
            data-testid="privacy-section-retention"
          >
            Data retention
          </h2>
          <p style={{ color: "rgba(255,255,255,0.5)" }}>
            Memory facts are stored in Cloudflare KV and persist until you
            delete your account. Voice recordings are never stored.
            Conversation text exists only for the duration of your active
            browser session. Rate-limiting data and usage logs are retained
            temporarily for security purposes and automatically expire.
          </p>
        </section>

        {/* User rights */}
        <section>
          <h2
            className="text-lg font-medium tracking-tight mb-4 text-white"
            data-testid="privacy-section-rights"
          >
            Your rights
          </h2>
          <p style={{ color: "rgba(255,255,255,0.5)" }}>
            You can delete all of your data at any time by deleting your
            account. This removes your memory facts from Cloudflare KV and
            your profile from Clerk. If you need assistance with data
            deletion, contact us at the email below.
          </p>
        </section>

        {/* Contact */}
        <section>
          <h2
            className="text-lg font-medium tracking-tight mb-4 text-white"
            data-testid="privacy-section-contact"
          >
            Contact
          </h2>
          <p style={{ color: "rgba(255,255,255,0.5)" }}>
            For any privacy-related questions or data requests, reach out to us
            at{" "}
            <a
              href="mailto:rudrasatani@missi.space"
              className="text-white/70 underline underline-offset-4 decoration-white/20 hover:decoration-white/40 transition-colors"
              data-testid="privacy-contact-email"
            >
              rudrasatani@missi.space
            </a>
          </p>
        </section>
      </div>
    </div>
  )
}
