import { formatDate } from '@dn/domain'
import { Button, SectionLabel, StoryHero } from '@dn/ui'
import { type StoryHeroState, storyHeroFixture, storyHeroNow } from '../../fixtures/story-hero.ts'

export function StoryHeroStatePreview({ state = 'long' }: { state?: StoryHeroState }) {
  const story = storyHeroFixture(state)
  return (
    <div
      data-theme={state === 'dark' ? 'dark' : undefined}
      className="-mx-4 bg-canvas px-gutter pb-10 text-text md:-mx-8"
    >
      <StoryHero
        story={story}
        now={storyHeroNow}
        kicker={`First reported ${formatDate(story.firstObservedAt)} · Europe`}
        editAction={
          <Button size="sm" className="min-h-tap" onClick={() => {}}>
            Edit summary
          </Button>
        }
        sidebar={<SectionLabel>Political lean</SectionLabel>}
      >
        <div className="mt-10">
          <SectionLabel>What changed</SectionLabel>
        </div>
        <section id="sources-heading" className="mt-10 scroll-mt-24">
          <SectionLabel>Original reporting</SectionLabel>
          {story.sources.map((source) => (
            <p
              key={source.articleId}
              id={`report-${source.articleId}`}
              className="min-h-tap scroll-mt-24 border-b border-border py-3 target:outline-2 target:outline-accent"
            >
              {source.publisher.name}
            </p>
          ))}
        </section>
      </StoryHero>
    </div>
  )
}
