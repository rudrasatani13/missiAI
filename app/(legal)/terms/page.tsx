import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Terms of Service — missiAI",
  description: "Terms governing your use of missiAI and related services.",
}

export default function TermsOfService() {
  return (
    <div data-testid="terms-of-service-page">
      <h1
        className="text-3xl md:text-4xl font-semibold tracking-tight mb-3"
        data-testid="terms-heading"
      >
        Terms of Service
      </h1>
      <p
        className="text-sm mb-12"
        style={{ color: "var(--missi-text-muted)" }}
      >
        Last updated: April 2026
      </p>

      <div className="space-y-10">
        {/* Acceptance */}
        <section>
          <h2
            className="text-lg font-medium tracking-tight mb-4 text-[var(--missi-text-primary)]"
            data-testid="terms-section-acceptance"
          >
            Acceptance of terms
          </h2>
          <p style={{ color: "var(--missi-text-secondary)" }}>
            By accessing or using missiAI, you agree to these Terms of Service.
            If you do not agree, please do not use the service. We may update
            these terms from time to time, and your continued use of missiAI
            after an update means you accept the revised version.
          </p>
        </section>

        {/* What missiAI is */}
        <section>
          <h2
            className="text-lg font-medium tracking-tight mb-4 text-[var(--missi-text-primary)]"
            data-testid="terms-section-product"
          >
            What missiAI is
          </h2>
          <p style={{ color: "var(--missi-text-secondary)" }}>
            missiAI is a personal AI companion designed to support everyday
            life with memory, context, voice, and text-based assistance. It is{" "}
            <strong className="text-[var(--missi-text-secondary)]">
              not a substitute for professional advice
            </strong>{" "}
            including medical, legal, financial, mental health, or emergency
            guidance. Do not rely on missiAI for high-stakes or urgent
            decisions. Use your own judgment and contact a qualified
            professional when needed.
          </p>
        </section>

        {/* Accounts and access */}
        <section>
          <h2
            className="text-lg font-medium tracking-tight mb-4 text-[var(--missi-text-primary)]"
            data-testid="terms-section-account"
          >
            Accounts and access
          </h2>
          <p style={{ color: "var(--missi-text-secondary)" }}>
            You may need an account to use some features of missiAI. You are
            responsible for keeping your login details secure and for activity
            that happens through your account. Please provide accurate
            information and let us know if you believe your account has been
            accessed without permission.
          </p>
        </section>

        {/* Acceptable use */}
        <section>
          <h2
            className="text-lg font-medium tracking-tight mb-4 text-[var(--missi-text-primary)]"
            data-testid="terms-section-acceptable-use"
          >
            Acceptable use
          </h2>
          <p className="mb-4" style={{ color: "var(--missi-text-secondary)" }}>
            When using missiAI, you agree not to:
          </p>
          <ul
            className="space-y-2.5 text-sm"
            style={{ color: "var(--missi-text-secondary)" }}
          >
            <li className="flex items-start gap-3">
              <span
                className="w-1 h-1 rounded-full mt-2 flex-shrink-0"
                style={{ background: "var(--missi-border)" }}
              />
              Use the service for any illegal activity or to facilitate harm
            </li>
            <li className="flex items-start gap-3">
              <span
                className="w-1 h-1 rounded-full mt-2 flex-shrink-0"
                style={{ background: "var(--missi-border)" }}
              />
              Abuse, overload, probe, or interfere with the service or its
              underlying systems
            </li>
            <li className="flex items-start gap-3">
              <span
                className="w-1 h-1 rounded-full mt-2 flex-shrink-0"
                style={{ background: "var(--missi-border)" }}
              />
              Attempt to manipulate the AI through prompt injection or
              adversarial techniques
            </li>
            <li className="flex items-start gap-3">
              <span
                className="w-1 h-1 rounded-full mt-2 flex-shrink-0"
                style={{ background: "var(--missi-border)" }}
              />
              Impersonate others or misrepresent your identity
            </li>
            <li className="flex items-start gap-3">
              <span
                className="w-1 h-1 rounded-full mt-2 flex-shrink-0"
                style={{ background: "var(--missi-border)" }}
              />
              Use automated scripts to interact with the service in ways that
              degrade performance for other users
            </li>
            <li className="flex items-start gap-3">
              <span
                className="w-1 h-1 rounded-full mt-2 flex-shrink-0"
                style={{ background: "var(--missi-border)" }}
              />
              Upload, submit, or generate content that violates the rights,
              privacy, or safety of others
            </li>
          </ul>
        </section>

        {/* Service availability */}
        <section>
          <h2
            className="text-lg font-medium tracking-tight mb-4 text-[var(--missi-text-primary)]"
            data-testid="terms-section-availability"
          >
            Service availability
          </h2>
          <p style={{ color: "var(--missi-text-secondary)" }}>
            We work to keep missiAI available, secure, and useful, but we do
            not guarantee uninterrupted access or error-free operation. Features
            may change, improve, pause, or be removed over time. The service is
            provided <strong className="text-[var(--missi-text-secondary)]">as-is</strong> and may
            occasionally be unavailable because of maintenance, updates, or
            unexpected issues.
          </p>
        </section>

        {/* Intellectual property */}
        <section>
          <h2
            className="text-lg font-medium tracking-tight mb-4 text-[var(--missi-text-primary)]"
            data-testid="terms-section-ip"
          >
            Intellectual property
          </h2>
          <p style={{ color: "var(--missi-text-secondary)" }}>
            You retain rights to content you submit to missiAI, subject to any
            rights needed for us to operate the service. The missiAI brand,
            product design, software, visual assets, and related materials are
            owned by missiAI or its licensors and are protected by applicable
            intellectual property laws. You may not copy, resell, or exploit
            our service or branding without permission.
          </p>
        </section>

        {/* User content */}
        <section>
          <h2
            className="text-lg font-medium tracking-tight mb-4 text-[var(--missi-text-primary)]"
            data-testid="terms-section-content"
          >
            Your content
          </h2>
          <p style={{ color: "var(--missi-text-secondary)" }}>
            You are responsible for the content you submit, including prompts,
            messages, files, and any other information you provide through the
            service. You agree not to submit content that is unlawful,
            infringing, abusive, or harmful. We may review, restrict, or remove
            content when reasonably necessary to enforce these terms, protect
            users, or comply with law.
          </p>
        </section>

        {/* Termination */}
        <section>
          <h2
            className="text-lg font-medium tracking-tight mb-4 text-[var(--missi-text-primary)]"
            data-testid="terms-section-termination"
          >
            Termination
          </h2>
          <p style={{ color: "var(--missi-text-secondary)" }}>
            We may suspend, restrict, or terminate access to missiAI if we
            believe you have violated these terms, created risk for other
            users, misused the service, or acted unlawfully. You may stop using
            the service at any time. Account closure and related data handling
            are described in our Privacy Policy.
          </p>
        </section>

        {/* Limitation of liability */}
        <section>
          <h2
            className="text-lg font-medium tracking-tight mb-4 text-[var(--missi-text-primary)]"
            data-testid="terms-section-liability"
          >
            Limitation of liability
          </h2>
          <p style={{ color: "var(--missi-text-secondary)" }}>
            To the maximum extent permitted by law, missiAI and its operators
            will not be liable for any indirect, incidental, consequential,
            special, or punitive damages arising from or related to your use of
            the service. To the extent permitted by law, the service is
            provided without warranties of any kind, whether express or
            implied.
          </p>
        </section>

        {/* Governing law */}
        <section>
          <h2
            className="text-lg font-medium tracking-tight mb-4 text-[var(--missi-text-primary)]"
            data-testid="terms-section-governing-law"
          >
            Governing law
          </h2>
          <p style={{ color: "var(--missi-text-secondary)" }}>
            These terms shall be governed by and construed in accordance with
            the laws of India. Any disputes arising under these terms shall be
            subject to the exclusive jurisdiction of the courts in Gujarat,
            India.
          </p>
        </section>

        {/* Contact */}
        <section>
          <h2
            className="text-lg font-medium tracking-tight mb-4 text-[var(--missi-text-primary)]"
            data-testid="terms-section-contact"
          >
            Contact
          </h2>
          <p style={{ color: "var(--missi-text-secondary)" }}>
            Questions about these terms? Reach out at{" "}
            <a
              href="mailto:rudrasatani@missi.space"
              className="text-[var(--missi-text-secondary)] underline underline-offset-4 decoration-white/20 hover:decoration-white/40 transition-colors"
              data-testid="terms-contact-email"
            >
              rudrasatani@missi.space
            </a>
          </p>
        </section>
      </div>
    </div>
  )
}
