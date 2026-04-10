import { Navbar } from "@/components/landing/navbar"
import { Footer } from "@/components/landing/footer"

export function TermsOfService() {
  return (
    <div className="relative min-h-screen overflow-x-hidden bg-background">
      <Navbar />

      <main className="relative pt-32 pb-24 px-6 md:px-12 mx-auto max-w-4xl font-sans">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px] -z-10" />

        <div className="space-y-4 mb-12">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-foreground">Terms of Service</h1>
          <p className="text-muted-foreground text-lg">Last updated: April 9, 2026</p>
        </div>

        <article className="prose prose-zinc dark:prose-invert max-w-none text-muted-foreground leading-relaxed">
          <section className="space-y-4 mb-10">
            <h2 className="text-2xl font-semibold text-foreground">1. Introduction</h2>
            <p>
              These Terms of Service ("Terms") constitute a legally binding agreement made between you and <strong>Vercelplay</strong>, concerning your access to and use of our platform. Vercelplay provides video hosting, fast HLS conversion, and streaming infrastructure intended for content creators and distributors.
            </p>
          </section>

          <section className="space-y-4 mb-10">
            <h2 className="text-2xl font-semibold text-foreground">2. Eligibility</h2>
            <p>
              By using our Services, you represent and warrant that:
              <br/>(1) all registration information you submit will be true, accurate, current, and complete;
              <br/>(2) you have the legal capacity and you agree to comply with these Terms;
              <br/>(3) you are not under the age of 18.
            </p>
          </section>

          <section className="space-y-4 mb-10">
            <h2 className="text-2xl font-semibold text-foreground">3. User Responsibilities & Acceptable Use</h2>
            <p>
              As a user of Vercelplay, you agree not to use the platform for any illegal or unauthorized purpose. Specifically, you agree NOT to:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Upload or stream content that infringes on third-party copyright, trademark, or intellectual property rights.</li>
              <li>Distribute malware, trojans, or highly malicious code through your integration of ad networks.</li>
              <li>Attempt to bypass our rate limits, storage quotas, or manipulate our HLS encoding engines maliciously.</li>
              <li>Use the platform to host purely illegal activities, terroristic threats, or extreme unconsented explicit material resulting in harm.</li>
            </ul>
          </section>

          <section className="space-y-4 mb-10">
            <h2 className="text-2xl font-semibold text-foreground">4. Intellectual Property</h2>
            <p>
              <strong>Your Content:</strong> Vercelplay claims no intellectual property rights over the material you provide or upload to the platform. Your videos and materials remain yours. However, by uploading content, you grant Vercelplay a license to process, encode, store, and stream that content globally to your audience.
            </p>
            <p>
              <strong>Our Platform:</strong> The source code, databases, software, and designs on the platform are owned or controlled by us and are protected by copyright and trademark laws.
            </p>
          </section>

          <section className="space-y-4 mb-10">
            <h2 className="text-2xl font-semibold text-foreground">5. Account Terms</h2>
            <p>
              You are responsible for keeping your login credentials confidential. We will assume that any activity occurring under your account was authorized by you. We reserve the right to remove, reclaim, or change a username you select if we determine it is inappropriate or violates trademark claims.
            </p>
          </section>

          <section className="space-y-4 mb-10">
            <h2 className="text-2xl font-semibold text-foreground">6. Payments & Billing</h2>
            <p>
              Vercelplay offers subscription tiers to access premium processing limits and higher storage capabilities.
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Payments are processed automatically via Stripe on a recurring cycle (monthly/annually).</li>
              <li>You agree to provide current, complete, and accurate billing information for all purchases made via the platform.</li>
              <li>Cancellations will take effect at the end of the current paid term. We do not provide prorated refunds.</li>
            </ul>
          </section>

          <section className="space-y-4 mb-10">
            <h2 className="text-2xl font-semibold text-foreground">7. User Monetization (Ads)</h2>
            <p>
              Vercelplay provides you with a platform tools (e.g., Ads Toolkit) allowing you to connect third-party ad networks (like Adsterra and Monetag). We do not take a percentage of your generated ad revenue. However, you are strictly responsible for matching your chosen ad network policies. Vercelplay holds no responsibility over blocked payouts or suspended ad accounts managed by third-party boards.
            </p>
          </section>

          <section className="space-y-4 mb-10">
            <h2 className="text-2xl font-semibold text-foreground">8. Termination</h2>
            <p>
              We reserve the right, in our sole discretion and without notice, to terminate or suspend your account and access to the platform for conduct that we believe violates these Terms of Service or is harmful to other users of Vercelplay, us, or third parties, or for any other reason.
            </p>
          </section>

          <section className="space-y-4 mb-10">
            <h2 className="text-2xl font-semibold text-foreground">9. Disclaimer of Warranties</h2>
            <p>
              VERCELPLAY IS PROVIDED ON AN "AS-IS" AND "AS-AVAILABLE" BASIS. YOU AGREE THAT YOUR USE OF THE PLATFORM AND OUR SERVICES WILL BE AT YOUR SOLE RISK. TO THE FULLEST EXTENT PERMITTED BY LAW, WE DISCLAIM ALL WARRANTIES, EXPRESS OR IMPLIED, IN CONNECTION WITH THE SITE AND YOUR USE THEREOF.
            </p>
          </section>

          <section className="space-y-4 mb-10">
            <h2 className="text-2xl font-semibold text-foreground">10. Limitation of Liability</h2>
            <p>
              IN NO EVENT WILL WE OR OUR DIRECTORS, EMPLOYEES, OR AGENTS BE LIABLE TO YOU OR ANY THIRD PARTY FOR ANY DIRECT, INDIRECT, CONSEQUENTIAL, INCIDENTAL, OR PUNITIVE DAMAGES, INCLUDING LOST PROFIT OR LOST REVENUE ARISING FROM YOUR USE OF THE VERCELPLAY SITE AND STREAMING ENGINE.
            </p>
          </section>

          <section className="space-y-4 mb-10">
            <h2 className="text-2xl font-semibold text-foreground">11. Changes to Terms</h2>
            <p>
              We reserve the right to make changes to these Terms of Service at any time. All updates will be timestamped at the top of this page. Your continued use of the platform after updates are made publicly will constitute your acceptance of the new Terms.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold text-foreground">12. Contact Information</h2>
            <p>
              In order to resolve a complaint regarding the Site or to receive further information regarding use of the platform, please contact us at: <a href="mailto:legal@vercelplay.com" className="text-primary hover:underline">legal@vercelplay.com</a>.
            </p>
          </section>

        </article>
      </main>

      <Footer />
    </div>
  )
}
