import type { Preview } from '@dn/schemas'
import { Button, cx, deskKey, PublisherLogo } from '@dn/ui'
import { Link, useLocation } from '@tanstack/react-router'
import { Page } from './page.tsx'

const ACTION: Record<Preview['type'], string> = {
  story: 'Sign in to read the story',
  narrative: 'Sign in to follow the narrative',
  publisher: 'Sign in to see the full profile',
}

/**
 * What a signed-out visitor sees of a story, narrative or publisher, usually from a shared
 * link: the title, one sentence and a way in. Link previews read the same page's head tags.
 */
export function PreviewTeaser({ preview }: { preview: Preview }) {
  const { href } = useLocation()
  return (
    <Page className="pb-24">
      <article
        className={cx(
          deskKey(preview.desk),
          'mt-6 max-w-3xl border-t-6 border-key pt-5 max-md:mt-2',
        )}
      >
        <p className="type-label text-text-muted">{preview.kicker}</p>
        <div className="mt-3 flex items-start gap-5">
          {preview.type === 'publisher' ? <PublisherLogo slug={preview.slug} size={72} /> : null}
          <h1 className="type-headline-lg text-balance">{preview.title}</h1>
        </div>
        {preview.description ? (
          <p className="mt-5 max-w-reading text-md text-text-secondary">{preview.description}</p>
        ) : null}
        <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-3">
          <Button
            variant="primary"
            nativeButton={false}
            render={<Link to="/login" search={{ next: href }} />}
          >
            {ACTION[preview.type]}
          </Button>
          <Link to="/about" className="link-inline text-sm font-semibold">
            What is Domino?
          </Link>
        </div>
      </article>
    </Page>
  )
}
