import { createFileRoute, Link } from '@tanstack/react-router'
import { Email, LegalPage, Section } from '../components/legal.tsx'
import { OPERATOR } from '../lib/operator.ts'
import { seo } from '../lib/seo.ts'

export const Route = createFileRoute('/contact-us')({
  head: ({ match }) =>
    seo({
      origin: match.context.session.origin,
      path: match.pathname,
      index: true,
      title: 'Contact us',
      description: 'Contact the team behind Domino Wire.',
    }),
  component: ContactPage,
})

function ContactPage() {
  return (
    <LegalPage
      title="Contact us"
      lead={<p>Questions or feedback about Domino Wire? We’d like to hear from you.</p>}
    >
      <Section id="contact" title="Get in touch">
        <p>
          Email us at <Email address={OPERATOR.email} /> for help, feedback or questions about the
          app and its coverage.
        </p>
        <p>
          Domino Wire is operated by {OPERATOR.name}. See our <Link to="/imprint">imprint</Link> for
          more information.
        </p>
      </Section>
    </LegalPage>
  )
}
