import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Privacy Policy — missiAI",
  description: "How missiAI collects, uses, stores, and protects your information.",
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
        Last updated: April 2026
      </p>

      <div className="space-y-10">
        {/* Intro */}
        <section>
          <p style={{ color: "rgba(255,255,255,0.55)" }}>
            This Privacy Policy explains how missiAI collects, uses, stores, and
            protects information when you use our website, apps, and related
            features. We aim to keep this readable and practical so you can
            understand what information is involved in running missiAI and what
            choices you have.
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
              <p className="font-medium text-white/70 mb-1">Account and profile information</p>
              <p>
                When you create or use an account, we may collect basic details
                such as your email address, account identifiers, profile data,
                and authentication-related information needed to keep your
                account secure and available.
              </p>
            </div>
            <div>
              <p className="font-medium text-white/70 mb-1">Messages, voice, and other inputs</p>
              <p>
                If you type, speak, or otherwise interact with missiAI, we may
                process that content so the service can understand your request,
                respond to you, and support product features such as memory,
                context, and voice experiences.
              </p>
            </div>
            <div>
              <p className="font-medium text-white/70 mb-1">Memory and personalization data</p>
              <p>
                To make missiAI more useful over time, we may store preferences,
                recurring context, saved items, and other personalization data
                connected to your account so the product can feel consistent and
                helpful across sessions.
              </p>
            </div>
            <div>
              <p className="font-medium text-white/70 mb-1">Device, usage, and security data</p>
              <p>
                We may collect limited technical information such as device or
                browser details, log data, timestamps, and security signals to
                keep the service reliable, detect misuse, troubleshoot issues,
                and protect accounts.
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
            We use information to operate missiAI, authenticate users,
            personalize your experience, support memory and context features,
            respond to support requests, improve stability and safety, and
            detect abuse or unauthorized access. We do not sell your personal
            information. When we use third-party providers to help run the
            service, they process information only as needed to perform those
            functions for us.
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
            We rely on external service providers to help us operate missiAI.
            Depending on the feature you use, they may support account access,
            infrastructure, storage, security, and AI or voice processing.
          </p>
          <div
            className="rounded-xl overflow-hidden"
            style={{ border: "1px solid rgba(255,255,255,0.06)" }}
          >
            {[
              {
                service: "Authentication and identity providers",
                purpose: "Secure sign-in, session management, and account protection",
              },
              {
                service: "Cloud infrastructure and storage providers",
                purpose: "Hosting, storage, delivery, backups, and service reliability",
              },
              {
                service: "AI and voice processing providers",
                purpose: "Processing your inputs and helping generate responses or voice features",
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
            These providers may handle information on our behalf only to the
            extent reasonably necessary to deliver their services to us.
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
            We keep information for as long as it is reasonably needed to run
            the service, maintain your account, provide personalized features,
            comply with legal obligations, and protect the platform. Some data
            may be deleted quickly after processing, while account information,
            memories, preferences, and security logs may be retained for longer
            depending on operational or legal needs.
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
            Depending on where you live, you may have rights to access,
            correct, export, restrict, or delete certain personal information.
            You may also be able to close your account or request help with a
            data-related request by contacting us at the email below.
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
