import { Navbar } from "@/components/landing/navbar"
import { Footer } from "@/components/landing/footer"

export function PrivacyPolicy() {
  return (
    <div className="relative min-h-screen overflow-x-hidden bg-background">
      <Navbar />

      <main className="relative pt-32 pb-24 px-6 md:px-12 mx-auto max-w-4xl font-sans">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px] -z-10" />

        <div className="space-y-4 mb-12">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-foreground">Privacy Policy</h1>
          <p className="text-muted-foreground text-lg">Last updated: April 9, 2026</p>
        </div>

        <article className="prose prose-zinc dark:prose-invert max-w-none text-muted-foreground leading-relaxed">
          <section className="space-y-4 mb-10">
            <h2 className="text-2xl font-semibold text-foreground">1. Introduction</h2>
            <p>
              Welcome to <strong>Vercelplay</strong>. We are committed to protecting your personal information and your right to privacy. This Privacy Policy outlines how we collect, use, and safeguard your data when you use our platform—which allows you to upload, convert, stream, and monetize video content via HLS technology.
            </p>
          </section>

          <section className="space-y-4 mb-10">
            <h2 className="text-2xl font-semibold text-foreground">2. Information We Collect</h2>
            <p>We collect information that you voluntarily provide to us when you register on Vercelplay, express an interest in obtaining information about us or our products, or otherwise contact us.</p>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Account Information:</strong> Name, email address, password, and profile data.</li>
              <li><strong>Content Data:</strong> Video files, cover images, and markdown text you upload for streaming and publication.</li>
              <li><strong>Monetization Data:</strong> Direct link URLs or API keys for configured third-party ad providers (e.g., Adsterra, Monetag).</li>
              <li><strong>Usage Analytics & System Data:</strong> IP addresses, browser types, interaction logs, and device information to optimize our HLS streaming performance.</li>
            </ul>
          </section>

          <section className="space-y-4 mb-10">
            <h2 className="text-2xl font-semibold text-foreground">3. How We Use Information</h2>
            <p>We rely on legitimate business interests and user consent to process your information for the following purposes:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>To facilitate account creation and logon processes.</li>
              <li>To encode, store, and stream uploaded video content.</li>
              <li>To bill and manage your subscription tiers securely.</li>
              <li>To improve our CDN efficiency and monitor worker infrastructure.</li>
              <li>To integrate your specified third-party advertising scripts gracefully.</li>
            </ul>
          </section>

          <section className="space-y-4 mb-10">
            <h2 className="text-2xl font-semibold text-foreground">4. Data Storage & Security</h2>
            <p>
              We implement industry-standard security measures, including HTTPS, Redis-backed rate limiting, and encrypted database connections, to protect your personal information. Content and media files are stored securely using AWS/S3 compatible storage integrations. However, no electronic transmission over the internet or information storage technology can be guaranteed to be 100% secure.
            </p>
          </section>

          <section className="space-y-4 mb-10">
            <h2 className="text-2xl font-semibold text-foreground">5. Third-Party Services</h2>
            <p>Vercelplay integrates with trusted third-party providers to enhance functionality. We only share necessary data required to perform specific services:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Payment Processing:</strong> Stripe (for subscription handling).</li>
              <li><strong>Infrastructure:</strong> AWS/S3, Cloudflare, Docker.</li>
              <li><strong>Ad Networks:</strong> Code injection solely powered by data you input strictly for your revenue streams (Adsterra, Monetag).</li>
            </ul>
          </section>

          <section className="space-y-4 mb-10">
            <h2 className="text-2xl font-semibold text-foreground">6. Cookies & Tracking</h2>
            <p>
              We use standard cookies and similar tracking technologies (like web beacons and pixels) primarily for essential platform functioning, such as keeping you authenticated via JWT sessions securely across pages.
            </p>
          </section>

          <section className="space-y-4 mb-10">
            <h2 className="text-2xl font-semibold text-foreground">7. User Rights</h2>
            <p>
              Under Global and GDPR-friendly laws, you have the right to access, rectify, port, or erase your personal information. 
              You may also object to the processing of your data at any time. To execute these rights, access your Account Settings or contact us directly.
            </p>
          </section>

          <section className="space-y-4 mb-10">
            <h2 className="text-2xl font-semibold text-foreground">8. Data Retention</h2>
            <p>
              We will only keep your personal information for as long as it is necessary for the purposes set out in this privacy policy, unless a longer retention period is required or permitted by law. When you close your account, your profile and associated video media will be queued for deletion from our master databases.
            </p>
          </section>

          <section className="space-y-4 mb-10">
            <h2 className="text-2xl font-semibold text-foreground">9. Children's Privacy</h2>
            <p>
              Our platform is intended for users who are at least 18 years of age. We do not knowingly collect personally identifiable information from children under 18. If a parent or guardian becomes aware that their child has provided us with personal information, they should contact us immediately.
            </p>
          </section>

          <section className="space-y-4 mb-10">
            <h2 className="text-2xl font-semibold text-foreground">10. Changes to This Policy</h2>
            <p>
              We may update this privacy policy from time to time in order to reflect changes to our practices or operational, legal, or regulatory reasons. 
              The updated version will be indicated by an updated "Last updated" date.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold text-foreground">11. Contact Information</h2>
            <p>
              If you have questions or comments about this policy, or if you wish to exercise your data rights, you may email us at: <a href="mailto:privacy@vercelplay.com" className="text-primary hover:underline">privacy@vercelplay.com</a>.
            </p>
          </section>

        </article>
      </main>

      <Footer />
    </div>
  )
}
