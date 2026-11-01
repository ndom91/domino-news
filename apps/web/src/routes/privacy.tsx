import { createFileRoute, Link } from '@tanstack/react-router'
import { Email, LegalPage, Section } from '../components/legal.tsx'
import { OPERATOR } from '../lib/operator.ts'
import { seo } from '../lib/seo.ts'

export const Route = createFileRoute('/privacy')({
  head: ({ match }) =>
    seo({
      origin: match.context.session.origin,
      path: match.pathname,
      index: true,
      title: 'Privacy policy',
      description: 'What Domino Wire stores about you, why, for how long, and how to delete it.',
    }),
  component: PrivacyPage,
})

// Retention as implemented: sessions (auth.ts), reading history and taps (preferences.ts),
// push deliveries (push-delivery.ts), backups (scripts/deploy.sh). Update both together.
const RETENTION = [
  ['Account details', 'Until you delete your account'],
  ['Sessions, with IP address and browser', '30 days after sign-in, then deleted'],
  [
    'Your picks, follows, country and saved locality',
    'Until you change them or your account is deleted',
  ],
  ['For You thumbs up and down', '30 days; what they taught For You fades over 30 days'],
  ['Reading history (only if you turn it on)', '30 days; deleted at once when you turn it off'],
  [
    'Push-notification token and delivery record',
    'Token until you disable alerts or delete your account; delivery record 30 days',
  ],
  ['Database backups', '14 days'],
] as const

function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy policy"
      lead={
        <p>
          Domino collects as little as it can: what it needs to run your account and the features
          you choose. We also use Rybbit analytics. There are no ads.
        </p>
      }
    >
      <Section id="controller" title="Who is responsible">
        <p>
          The controller under the GDPR is {OPERATOR.name}, {OPERATOR.country}. Contact:{' '}
          <Email address={OPERATOR.email} />. Full details are in the{' '}
          <Link to="/imprint">imprint</Link>.
        </p>
      </Section>

      <Section id="data" title="What we process, and why">
        <ul>
          <li>
            <strong>Your account:</strong> username, name, email address (optional), a hashed
            password (we never store the password itself) and any passkeys you add. With Google
            sign-in, also the name, email address and profile picture Google shares. Needed to
            provide the service (Art. 6(1)(b) GDPR).
          </li>
          <li>
            <strong>Sessions:</strong> when you sign in, we store a session with your IP address and
            browser details. We use them to keep you signed in, to limit sign-in attempts and to
            keep accounts secure (Art. 6(1)(b) and (f) GDPR; our legitimate interest is the security
            of the service).
          </li>
          <li>
            <strong>Your settings:</strong> the regions, desks, topics and country you pick, any
            city and county or local area you explicitly save for Local, the narratives and
            publishers you follow, and your thumbs up and down on For You. Needed to provide those
            features (Art. 6(1)(b) GDPR). Domino does not request or store your precise coordinates.
          </li>
          <li>
            <strong>Reading history, only if you turn it on:</strong> which stories you open, for
            Blindspot. It’s off by default. You can turn it off on your{' '}
            <Link to="/account">account page</Link> at any time, which deletes it immediately
            (consent, Art. 6(1)(a) GDPR).
          </li>
          <li>
            <strong>Your country:</strong> worked out from your connection on each visit to show
            relevant coverage and a country-level Local feed. It isn’t stored unless you pick a
            country yourself (Art. 6(1)(f) GDPR).
          </li>
          <li>
            <strong>Push alerts, only if you allow them:</strong> your device’s push token and a
            record of each alert. We use them to send a newly published For You story no more than
            once every four hours (consent, Art. 6(1)(a) GDPR).
          </li>
        </ul>
        <p>
          We don’t build a profile of your political views, and we don’t use your data for
          advertising.
        </p>
      </Section>

      <Section id="cookies" title="Cookies and local storage">
        <p>
          Domino sets one cookie: the session cookie that keeps you signed in. It’s strictly
          necessary, so it needs no consent (§25(2) TDDDG). Your light or dark theme choice is kept
          in your browser’s local storage and never sent to us. The site also loads Rybbit analytics
          from stats.ndo.dev.
        </p>
      </Section>

      <Section id="recipients" title="Who else receives data">
        <ul>
          <li>
            <strong>Cloudflare</strong> delivers the site and protects it from attacks, so it
            handles every request, including your IP address. Cloudflare is certified under the
            EU–US Data Privacy Framework.
          </li>
          <li>
            <strong>Hosting:</strong>{' '}
            {OPERATOR.hostingProvider
              ? `our servers are hosted by ${OPERATOR.hostingProvider}.`
              : 'our servers are run by the operator.'}
          </li>
          <li>
            <strong>Google</strong>, only if you choose to sign in with Google. Google’s own privacy
            policy applies to that sign-in.
          </li>
          <li>
            <strong>Expo</strong> delivers push alerts. It receives your device’s push token and the
            alert’s title and text.
          </li>
        </ul>
        <p>We don’t sell or share your data with anyone else.</p>
      </Section>

      <Section id="ai" title="AI">
        <p>
          The language models that write summaries run on our own servers. They only see publishers’
          headlines and descriptions, never anything about you. Your data isn’t sent to AI providers
          or used to train models.
        </p>
      </Section>

      <Section id="retention" title="How long we keep it">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b-2 border-rule type-label">
              <th scope="col" className="py-2 pr-4">
                Data
              </th>
              <th scope="col" className="py-2">
                Kept
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {RETENTION.map(([data, kept]) => (
              <tr key={data}>
                <td className="py-2 pr-4 align-top">{data}</td>
                <td className="py-2 align-top text-text-secondary">{kept}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section id="rights" title="Your rights">
        <p>
          You can ask for a copy of your data, have it corrected or deleted, limit how we use it,
          receive it in a portable format, and object to processing based on our legitimate interest
          (Arts. 15–21 GDPR). Where you gave consent, you can withdraw it at any time.
        </p>
        <p>
          You can delete your account yourself, under Privacy & security on your{' '}
          <Link to="/account" search={{ tab: 'security' }}>
            account page
          </Link>
          . That deletes your account and everything tied to it straight away. Copies in our
          database backups are deleted within 14 days, when old backups are pruned.
        </p>
        <p>
          For other ways to request deletion, see{' '}
          <Link to="/delete-account">delete your account</Link>.
        </p>
        <p>
          For anything else, email <Email address={OPERATOR.email} />. We reply within one month.
        </p>
        <p>
          You can also complain to a data protection authority, for example the one where you live.
        </p>
      </Section>

      <Section id="changes" title="Changes">
        <p>
          If this policy changes, the date above changes with it. We’ll email you about important
          changes.
        </p>
      </Section>
    </LegalPage>
  )
}
