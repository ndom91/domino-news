import {
  DESK_LABELS,
  type Desk,
  type ForYouReason,
  type Insights,
  type LocalScope,
  type Place,
  REGION_LABELS,
  type Region,
} from '@dn/schemas'
import { countryName } from './lean.ts'

// Reader-facing phrases shared by the web and native feeds.

/** Why a Story is in the reader's feed, without a full stop: "You follow Reuters". */
export function forYouReasonText(reason: ForYouReason): string {
  switch (reason.kind) {
    case 'narrative':
      return `You follow ${reason.label}`
    case 'publisher':
      return `From ${reason.label}, which you follow`
    case 'topic':
      return `Topic you picked: ${reason.label}`
    case 'region':
      return `Region you picked: ${reason.label}`
    case 'desk':
      return `Desk you picked: ${reason.label}`
    case 'learned':
      return `You asked for more ${reason.label}`
  }
}

/** A Local section heading: "In Leeds", "Across West Yorkshire", "Elsewhere in United Kingdom". */
export function localScopeTitle(scope: LocalScope, place: Place): string {
  if (scope === 'city') return `In ${place.city}`
  if (scope === 'county') return `Across ${place.county}`
  return place.city || place.county
    ? `Elsewhere in ${countryName(place.country)}`
    : `Across ${countryName(place.country)}`
}

/** A Blindspot reading gap's region or desk name. */
export function readingGapLabel(gap: Insights['gaps'][number]): string {
  return gap.kind === 'region' ? REGION_LABELS[gap.key as Region] : DESK_LABELS[gap.key as Desk]
}
