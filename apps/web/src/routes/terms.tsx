import { createFileRoute, Link } from '@tanstack/react-router'
import { Email, LegalPage, Section } from '../components/legal.tsx'
import { OPERATOR } from '../lib/operator.ts'
import { seo } from '../lib/seo.ts'

export const Route = createFileRoute('/terms')({
  head: ({ match }) =>
    seo({
      origin: match.context.session.origin,
      path: match.pathname,
      index: true,
      title: 'Terms of service',
      description: 'The terms for using Domino Wire.',
    }),
  component: TermsPage,
})

function TermsPage() {
  return (
    <LegalPage
      title="Terms of service"
      lead={
        <p>
          These terms apply to using Domino, a free news service run by {OPERATOR.name} (see the{' '}
          <Link to="/imprint">imprint</Link>). By using Domino you agree to them.
        </p>
      }
    >
      <Section id="access" title="Access">
        <p>
          Domino is open by invitation only. Your account is personal: don’t share it, and keep your
          password and passkeys safe. We can suspend or close an account that breaks these terms,
          and we may end access for everyone if the service shuts down.
        </p>
      </Section>

      <Section id="content" title="What you see on Domino">
        <ul>
          <li>
            Story summaries, background notes and claims are written by a language model. They can
            contain mistakes. They describe what publishers report, are not verified facts and are
            not advice of any kind.
          </li>
          <li>
            Articles belong to their publishers. Domino shows their headlines and short descriptions
            and links to the originals.
          </li>
          <li>
            Publisher assessments (ownership, reliability, political lean) are our documented view,
            each with its sources. Read them as opinions, not statements of fact.
          </li>
        </ul>
      </Section>

      <Section id="use" title="Fair use">
        <p>Please don’t:</p>
        <ul>
          <li>copy content in bulk, or access Domino with scrapers, bots or other automation;</li>
          <li>try to break into, overload or get around the security of the service;</li>
          <li>use Domino for anything unlawful.</li>
        </ul>
      </Section>

      <Section id="availability" title="Availability">
        <p>
          Domino is provided as it is, free of charge. We work to keep it running and accurate, but
          can’t promise it will always be available, complete or error-free. We may change, pause or
          end features at any time.
        </p>
      </Section>

      <Section id="liability" title="Liability">
        <p>
          We are fully liable for intent and gross negligence, for injury to life, body or health,
          and under the Product Liability Act. For slight negligence, we are only liable if we
          breach an obligation that is essential to the service, and only for damage that was
          foreseeable when you started using it. Because Domino is free, the limits of §521 BGB also
          apply.
        </p>
      </Section>

      <Section id="changes" title="Changes and ending">
        <p>
          We may update these terms. If a change matters, we’ll email you before it applies. You can
          stop using Domino at any time, and delete your account yourself on your{' '}
          <Link to="/account" search={{ tab: 'security' }}>
            account page
          </Link>
          . Questions: <Email address={OPERATOR.email} />.
        </p>
      </Section>

      <Section id="law" title="Law">
        <p>
          German law applies. If you are a consumer, this doesn’t take away the protection of the
          law of the country where you live.
        </p>
      </Section>
    </LegalPage>
  )
}
