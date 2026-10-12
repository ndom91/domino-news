import { createFileRoute } from '@tanstack/react-router'
import { Email, LegalPage, Section } from '../components/legal.tsx'
import { OPERATOR } from '../lib/operator.ts'

export const Route = createFileRoute('/imprint')({
  head: () => ({ meta: [{ title: 'Imprint · Domino News' }] }),
  component: ImprintPage,
})

// German headings are the legally required wording; the English line explains each one.
function ImprintPage() {
  return (
    <LegalPage title="Imprint">
      <Section id="provider" title="Angaben gemäß § 5 DDG">
        <p className="type-meta">Information under §5 of the German Digital Services Act</p>
        <address className="not-italic">
          {OPERATOR.name}
          {OPERATOR.address ? (
            <>
              <br />
              {OPERATOR.address}
            </>
          ) : null}
          <br />
          {OPERATOR.country}
        </address>
        <p>
          E-Mail: <Email address={OPERATOR.email} />
        </p>
      </Section>

      <Section id="editorial" title="Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV">
        <p className="type-meta">
          Responsible for content under §18(2) of the Interstate Media Treaty
        </p>
        <p>
          {OPERATOR.name}
          {OPERATOR.address ? `, ${OPERATOR.address}` : ''}
        </p>
      </Section>

      <Section id="disputes" title="Verbraucherstreitbeilegung">
        <p className="type-meta">Consumer dispute resolution</p>
        <p>
          Wir sind nicht bereit oder verpflichtet, an Streitbeilegungsverfahren vor einer
          Verbraucherschlichtungsstelle teilzunehmen.
        </p>
        <p className="text-text-secondary">
          We are neither willing nor obliged to take part in dispute resolution before a consumer
          arbitration board.
        </p>
      </Section>

      <Section id="links" title="Haftung für Links">
        <p className="type-meta">Liability for links</p>
        <p>
          Domino verlinkt auf Artikel anderer Verlage. Für deren Inhalte sind ausschließlich die
          jeweiligen Anbieter verantwortlich. Wird uns ein rechtswidriger Inhalt bekannt, entfernen
          wir den Link umgehend.
        </p>
        <p className="text-text-secondary">
          Domino links to articles by other publishers, who alone are responsible for their content.
          If we learn that linked content is unlawful, we remove the link promptly.
        </p>
      </Section>
    </LegalPage>
  )
}
