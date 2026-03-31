import type { Metadata } from "next"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Terms of Service — missiAI",
  description: "Terms governing your use of missiAI voice assistant.",
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
        style={{ color: "rgba(255,255,255,0.3)" }}
      >
        Last updated: March 2026
      </p>

      <div className="space-y-10">
        {/* Acceptance */}
        <section>
          <h2
            className="text-lg font-medium tracking-tight mb-4 text-white"
            data-testid="terms-section-acceptance"
          >
            Acceptance of terms
          </h2>
          <p style={{ color: "rgba(255,255,255,0.5)" }}>
            By accessing or using missiAI, you agree to be bound by these Terms
            of Service. If you do not agree, do not use the service. We may
            update these terms from time to time — continued use after changes
            constitutes acceptance of the new terms.
          </p>
        </section>

        {/* What missiAI is */}
        <section>
          <h2
            className="text-lg font-medium tracking-tight mb-4 text-white"
            data-testid="terms-section-product"
          >
            What missiAI is
          </h2>
          <p style={{ color: "rgba(255,255,255,0.5)" }}>
            missiAI is an AI-powered voice and text assistant designed for
            personal productivity and companionship. It is{" "}
            <strong className="text-white/70">
              not a substitute for professional advice
            </strong>{" "}
            — including medical, legal, financial, or mental health guidance. Do
            not rely on missiAI for critical decisions. Always consult a
            qualified professional when needed.
          </p>
        </section>

        {/* Acceptable use */}
        <section>
          <h2
            className="text-lg font-medium tracking-tight mb-4 text-white"
            data-testid="terms-section-acceptable-use"
          >
            Acceptable use
          </h2>
          <p className="mb-4" style={{ color: "rgba(255,255,255,0.5)" }}>
            When using missiAI, you agree not to:
          </p>
          <ul
            className="space-y-2.5 text-sm"
            style={{ color: "rgba(255,255,255,0.45)" }}
          >
            <li className="flex items-start gap-3">
              <span
                className="w-1 h-1 rounded-full mt-2 flex-shrink-0"
                style={{ background: "rgba(255,255,255,0.25)" }}
              />
              Use the service for any illegal activity or to facilitate harm
            </li>
            <li className="flex items-start gap-3">
              <span
                className="w-1 h-1 rounded-full mt-2 flex-shrink-0"
                style={{ background: "rgba(255,255,255,0.25)" }}
              />
              Abuse, overload, or reverse-engineer our API endpoints
            </li>
            <li className="flex items-start gap-3">
              <span
                className="w-1 h-1 rounded-full mt-2 flex-shrink-0"
                style={{ background: "rgba(255,255,255,0.25)" }}
              />
              Attempt to manipulate the AI through prompt injection or
              adversarial techniques
            </li>
            <li className="flex items-start gap-3">
              <span
                className="w-1 h-1 rounded-full mt-2 flex-shrink-0"
                style={{ background: "rgba(255,255,255,0.25)" }}
              />
              Impersonate others or misrepresent your identity
            </li>
            <li className="flex items-start gap-3">
              <span
                className="w-1 h-1 rounded-full mt-2 flex-shrink-0"
                style={{ background: "rgba(255,255,255,0.25)" }}
              />
              Use automated scripts to interact with the service in ways that
              degrade performance for other users
            </li>
          </ul>
        </section>

        {/* Service availability */}
        <section>
          <h2
            className="text-lg font-medium tracking-tight mb-4 text-white"
            data-testid="terms-section-availability"
          >
            Service availability
          </h2>
          <p style={{ color: "rgba(255,255,255,0.5)" }}>
            missiAI is currently in beta and is provided{" "}
            <strong className="text-white/70">as-is</strong>. We do not
            guarantee uninterrupted availability, and the service may
            experience downtime for maintenance, updates, or unforeseen issues.
            We will make reasonable efforts to keep the service running
            reliably, but no formal uptime SLA is offered during the beta
            period.
          </p>
        </section>

        {/* Intellectual property */}
        <section>
          <h2
            className="text-lg font-medium tracking-tight mb-4 text-white"
            data-testid="terms-section-ip"
          >
            Intellectual property
          </h2>
          <p style={{ color: "rgba(255,255,255,0.5)" }}>
            You retain full rights to the content of your conversations with
            missiAI. The missiAI brand, logo, code, and service design are the
            intellectual property of missiAI and its creator. You may not
            reproduce, distribute, or create derivative works from our brand
            assets without written permission.
          </p>
        </section>

        {/* Termination */}
        <section>
          <h2
            className="text-lg font-medium tracking-tight mb-4 text-white"
            data-testid="terms-section-termination"
          >
            Termination
          </h2>
          <p style={{ color: "rgba(255,255,255,0.5)" }}>
            We reserve the right to suspend or terminate accounts that violate
            these terms, abuse the service, or engage in activity that
            negatively impacts other users. You may delete your account at any
            time, which will remove your data as described in our Privacy
            Policy.
          </p>
        </section>

        {/* Limitation of liability */}
        <section>
          <h2
            className="text-lg font-medium tracking-tight mb-4 text-white"
            data-testid="terms-section-liability"
          >
            Limitation of liability
          </h2>
          <p style={{ color: "rgba(255,255,255,0.5)" }}>
            To the maximum extent permitted by law, missiAI and its creator
            shall not be liable for any indirect, incidental, special, or
            consequential damages arising from your use of the service. The
            service is provided without warranties of any kind, express or
            implied.
          </p>
        </section>

        {/* Governing law */}
        <section>
          <h2
            className="text-lg font-medium tracking-tight mb-4 text-white"
            data-testid="terms-section-governing-law"
          >
            Governing law
          </h2>
          <p style={{ color: "rgba(255,255,255,0.5)" }}>
            These terms shall be governed by and construed in accordance with
            the laws of India. Any disputes arising under these terms shall be
            subject to the exclusive jurisdiction of the courts in Gujarat,
            India.
          </p>
        </section>

        {/* Contact */}
        <section>
          <h2
            className="text-lg font-medium tracking-tight mb-4 text-white"
            data-testid="terms-section-contact"
          >
            Contact
          </h2>
          <p style={{ color: "rgba(255,255,255,0.5)" }}>
            Questions about these terms? Reach out at{" "}
            <a
              href="mailto:rudrasatani@missi.space"
              className="text-white/70 underline underline-offset-4 decoration-white/20 hover:decoration-white/40 transition-colors"
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
