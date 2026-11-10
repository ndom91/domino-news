import { plural } from '@dn/domain'
import type { StoryDetail } from '@dn/schemas'
import { IconButton, Menu, MenuItem, MenuLinkItem } from '@dn/ui'
import {
  DotsThreeIcon,
  EnvelopeSimpleIcon,
  LinkIcon,
  ShareNetworkIcon,
} from '@phosphor-icons/react'
import { useEffect, useRef, useState } from 'react'

/** The story header's share menu: copy link, email, and the system share sheet where there is one. */
export function ShareStory({ story, origin }: { story: StoryDetail; origin: string }) {
  const [status, setStatus] = useState('')
  const [canShare, setCanShare] = useState(false)
  const statusTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => setCanShare(typeof navigator.share === 'function'), [])
  useEffect(() => () => clearTimeout(statusTimer.current), [])
  const url = `${origin}/stories/${encodeURIComponent(story.slug)}`
  async function copyStoryLink() {
    clearTimeout(statusTimer.current)
    try {
      await navigator.clipboard.writeText(url)
      setStatus('Link copied.')
      statusTimer.current = setTimeout(() => setStatus(''), 3000)
    } catch {
      setStatus('Could not copy the link. Please copy it from the address bar.')
    }
  }
  async function shareStory() {
    clearTimeout(statusTimer.current)
    setStatus('')
    try {
      await navigator.share({ title: story.title, url })
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setStatus('Could not share the link. Please try copying it instead.')
    }
  }
  return (
    <div className="relative shrink-0">
      <Menu
        trigger={
          <IconButton
            label="Share"
            variant="primary"
            className="!border-key-text !bg-key-text !text-key hover:not-data-disabled:!bg-key hover:not-data-disabled:!text-key-text"
            icon={<ShareNetworkIcon size={20} aria-hidden />}
          />
        }
      >
        <MenuItem onClick={() => void copyStoryLink()}>
          <LinkIcon size={16} aria-hidden className="mr-3" /> Copy link
        </MenuItem>
        <MenuLinkItem
          render={
            <a
              href={`mailto:?subject=${encodeURIComponent(story.title)}&body=${encodeURIComponent(url)}`}
            />
          }
        >
          <EnvelopeSimpleIcon size={16} aria-hidden className="mr-3" /> Email
        </MenuLinkItem>
        {canShare ? (
          <MenuItem closeOnClick={false} onClick={() => void shareStory()}>
            <DotsThreeIcon size={16} aria-hidden className="mr-3" /> More options…
          </MenuItem>
        ) : null}
        <p className="w-60 border-t border-border px-4 py-3 text-sm font-normal leading-normal text-text-secondary">
          Shares this story’s page, with its summary and all{' '}
          {plural(story.sources.length, 'report')}.
        </p>
      </Menu>
      <span
        aria-live="polite"
        className={
          status
            ? 'absolute right-0 top-full z-10 mt-2 w-max max-w-60 bg-elevated px-2 text-sm text-text'
            : 'sr-only'
        }
      >
        {status}
      </span>
    </div>
  )
}
