import { createFileRoute, Link } from '@tanstack/react-router'
import { Email, LegalPage, Section } from '../components/legal.tsx'
import { OPERATOR } from '../lib/operator.ts'
import { seo } from '../lib/seo.ts'

export const Route = createFileRoute('/delete-account')({
  head: ({ match }) =>
    seo({
      origin: match.context.session.origin,
      path: match.pathname,
      index: true,
      title: 'Delete your account',
      description: 'How to delete your Domino Wire account and associated data.',
    }),
  component: DeleteAccountPage,
})

function DeleteAccountPage() {
  return (
    <LegalPage
      title="Delete your account"
      lead={<p>You can delete your Domino Wire account and its associated data at any time.</p>}
    >
      <Section id="request" title="How to request deletion">
        <p>
          Sign in to Domino Wire on the web, open your{' '}
          <Link to="/account" search={{ tab: 'security' }}>
            account page
          </Link>
          , and choose Delete account under Privacy & security. Confirm the deletion when prompted.
          You may need your password or to sign in again.
        </p>
        <p>
          If you can’t sign in or prefer to request deletion by email, contact{' '}
          <Email address={OPERATOR.email} /> with the subject “Delete my Domino Wire account”.
          Include the email address or username associated with your account, but never your
          password. We may need to verify that the account belongs to you.
        </p>
      </Section>
      <Section id="data" title="What happens to your data">
        <p>
          When your account is deleted, your account details, sessions, linked sign-in methods,
          preferences, follows, reading history, feedback and push notification data are removed.
          Deletion can’t be undone.
        </p>
        <p>
          Copies in database backups remain until the backups are pruned, within 14 days. Accounts
          that have published publisher assessments cannot be deleted through the account page. If
          deletion fails for any reason, contact us to request deletion.
        </p>
        <p>
          For more about how we handle your data, see our <Link to="/privacy">privacy policy</Link>.
        </p>
      </Section>
    </LegalPage>
  )
}
