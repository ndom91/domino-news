import { createFileRoute, Link } from '@tanstack/react-router'
import { Email, LegalPage, Section } from '../components/legal.tsx'
import { OPERATOR } from '../lib/operator.ts'
import { seo } from '../lib/seo.ts'

export const Route = createFileRoute('/about')({
  head: ({ match }) =>
    seo({
      origin: match.context.session.origin,
      path: match.pathname,
      index: true,
      title: 'About',
      description:
        'What Domino is: news grouped into stories across every publisher, with sources, narratives and reviewed publisher assessments.',
    }),
  component: AboutPage,
})

function AboutPage() {
  return (
    <LegalPage
      title="About Domino"
      lead={
        <p>
          Domino follows the news across more than 60 publishers and turns their reporting into
          stories: one page per development, with every source linked. You see who reported what,
          when, and how it connects to what came before.
        </p>
      }
    >
      <Section id="how" title="How it works">
        <p>
          Domino reads the public feeds that publishers offer: headlines, short descriptions and
          links. It groups articles about the same development into a story, and links stories that
          follow from each other into narratives.
        </p>
        <p>
          Story summaries, background notes and the claims list are written by a language model (an
          AI system that writes text) that runs on our own servers. Each summary only uses the
          articles in its story, and every statement links to the article it comes from. A summary
          says what publishers report, not what Domino has verified. Read the originals for the full
          picture.
        </p>
      </Section>

      <Section id="publishers" title="Publishers, lean and reliability">
        <p>
          Every publisher has a page with who owns it, how it’s funded, how reliable it’s generally
          considered, and its political lean. Each of these comes from a named source:
        </p>
        <ul>
          <li>
            Political lean comes from audience surveys by the Reuters Institute, AllSides ratings
            for US publishers, or, where neither exists, our own research. Estimates are always
            labelled as estimates.
          </li>
          <li>Reliability comes from Wikipedia’s list of perennial sources.</li>
          <li>Ownership comes from Wikidata and the publishers’ own pages.</li>
        </ul>
        <p>
          Lean labels are kept simple, but their evidence and story-level comparisons remain
          country-relative: “centre-right” in the UK isn’t the same as in the US. Where a country’s
          politics don’t divide into left and right, we say so instead of forcing a label.
        </p>
      </Section>

      <Section id="principles" title="What we don’t do">
        <ul>
          <li>No ads, no tracking and no analytics.</li>
          <li>We don’t sell or share your data.</li>
          <li>
            We don’t guess your politics. Blindspot and For You work from what you choose and, only
            if you turn it on, what you read.
          </li>
        </ul>
        <p>
          How we handle your data is in the <Link to="/privacy">privacy policy</Link>.
        </p>
      </Section>

      <Section id="who" title="Who runs Domino">
        <p>
          Domino is an independent project by {OPERATOR.name}, currently open by invitation only.
          Questions, corrections and feedback: <Email address={OPERATOR.email} />.
        </p>
        <p>
          Legal details are in the <Link to="/imprint">imprint</Link> and the{' '}
          <Link to="/terms">terms of service</Link>.
        </p>
      </Section>
    </LegalPage>
  )
}
