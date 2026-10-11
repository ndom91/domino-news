import { REGION_LABELS, REGIONS, type Region } from '@dn/schemas'
import type { SelectOption } from '@dn/ui'

/** Region choices for a Select, after the "no region" choice labelled `nullLabel`. */
export function regionOptions(nullLabel: string): SelectOption<Region>[] {
  return [
    { value: null, label: nullLabel },
    ...REGIONS.map((r) => ({ value: r, label: REGION_LABELS[r] })),
  ]
}
