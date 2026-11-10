import { INFERENCE_SETTINGS_LIMITS, type OpsStatus } from '@dn/schemas'
import { Button, SectionLabel, TextInput } from '@dn/ui'
import { Stat, useOpsAction } from './shared.tsx'

const duration = (seconds: number | null) => (seconds === null ? '–' : `${seconds.toFixed(1)}s`)

export function InferenceSection({ inference }: { inference: OpsStatus['inference'] }) {
  const jobs = inference.summaryJobs
  const assessments = inference.updateAssessments
  return (
    <section aria-labelledby="inference-heading">
      <SectionLabel id="inference-heading">Inference work</SectionLabel>
      <p className="mb-4 max-w-reading text-sm text-text-secondary">
        Last {inference.windowHours} hours. Stale summary jobs are queue churn that exited before
        inference; compare them with recorded summaries before adding stronger coalescing.
      </p>
      <dl className="grid grid-cols-2 border-t-2 border-rule sm:grid-cols-4">
        <Stat
          label="Summary jobs"
          value={jobs.completed}
          note={`${jobs.recorded} recorded · ${jobs.stale} stale`}
        />
        <Stat
          label="Metadata skips"
          value={jobs.prefiltered}
          note={`${jobs.corroborationOnly} model corroborations · ${jobs.uncertain} uncertain`}
        />
        <Stat
          label="Update assessments"
          value={assessments.succeeded}
          note={`${assessments.failed} failed · ${duration(assessments.averageDurationSeconds)} average`}
        />
        <Stat
          label="No revision"
          value={jobs.corroborationOnly + jobs.uncertain}
          note="Assessment found no material update"
        />
      </dl>
      <InferenceControls settings={inference.settings} />
    </section>
  )
}

function InferenceControls({ settings }: { settings: OpsStatus['inference']['settings'] }) {
  const action = useOpsAction()
  const formKey = `${settings.publishedSummaryDebounceSeconds}:${settings.summaryUpdateAssessmentMaxArticles}`
  return (
    <section aria-labelledby="inference-controls-heading" className="mt-10 max-w-3xl">
      <SectionLabel id="inference-controls-heading">Inference controls</SectionLabel>
      <p className="mb-4 text-sm text-text-secondary">
        These changes apply to newly scheduled published-story updates. They do not restart workers
        or alter jobs already queued.
      </p>
      <form
        key={formKey}
        className="border-y-2 border-text"
        onSubmit={(event) => {
          event.preventDefault()
          const values = new FormData(event.currentTarget)
          action.mutate({
            action: 'update_inference_settings',
            settings: {
              publishedSummaryDebounceSeconds: Number(values.get('debounceSeconds')),
              summaryUpdateAssessmentMaxArticles: Number(values.get('maxAssessmentArticles')),
            },
          })
        }}
      >
        <fieldset>
          <legend className="sr-only">Published-story update controls</legend>
          <div className="divide-y divide-border">
            <div className="grid gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_11rem] sm:items-center">
              <div>
                <h3 className="type-label text-text">Published-story debounce</h3>
                <p className="mt-1 text-sm text-text-secondary">
                  Wait before assessing a burst of reporting.{' '}
                  {INFERENCE_SETTINGS_LIMITS.publishedSummaryDebounceSeconds.min}–
                  {INFERENCE_SETTINGS_LIMITS.publishedSummaryDebounceSeconds.max} seconds.
                </p>
              </div>
              <TextInput
                name="debounceSeconds"
                type="number"
                inputMode="numeric"
                min={INFERENCE_SETTINGS_LIMITS.publishedSummaryDebounceSeconds.min}
                max={INFERENCE_SETTINGS_LIMITS.publishedSummaryDebounceSeconds.max}
                step={30}
                defaultValue={settings.publishedSummaryDebounceSeconds}
                label="Published-story debounce in seconds"
                hideLabel
              />
            </div>
            <div className="grid gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_11rem] sm:items-center">
              <div>
                <h3 className="type-label text-text">Assessment articles</h3>
                <p className="mt-1 text-sm text-text-secondary">
                  Distinct publishers considered for each update.{' '}
                  {INFERENCE_SETTINGS_LIMITS.summaryUpdateAssessmentMaxArticles.min}–
                  {INFERENCE_SETTINGS_LIMITS.summaryUpdateAssessmentMaxArticles.max} publishers.
                </p>
              </div>
              <TextInput
                name="maxAssessmentArticles"
                type="number"
                inputMode="numeric"
                min={INFERENCE_SETTINGS_LIMITS.summaryUpdateAssessmentMaxArticles.min}
                max={INFERENCE_SETTINGS_LIMITS.summaryUpdateAssessmentMaxArticles.max}
                step={1}
                defaultValue={settings.summaryUpdateAssessmentMaxArticles}
                label="Assessment article count"
                hideLabel
              />
            </div>
          </div>
        </fieldset>
        <div className="flex flex-wrap items-center gap-3 border-t border-border py-4">
          <Button type="submit" variant="primary" loading={action.isPending}>
            Save inference controls
          </Button>
          {action.isError ? (
            <p className="mt-2 text-sm font-semibold text-error" role="alert">
              {action.error.message}
            </p>
          ) : null}
        </div>
      </form>
      <section aria-labelledby="runtime-capacity-heading" className="mt-8">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h3 id="runtime-capacity-heading" className="type-label text-text">
            Worker capacity
          </h3>
          <p className="type-meta">Set in the environment · restart required</p>
        </div>
        <dl className="mt-3 grid grid-cols-2 border-t border-border">
          <Stat label="Embedding" value={settings.embeddingConcurrency} />
          <Stat label="Generation" value={settings.generationConcurrency} />
        </dl>
      </section>
    </section>
  )
}
