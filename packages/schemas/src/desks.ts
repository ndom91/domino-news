import { z } from 'zod/mini'

// Which desk a Story belongs to: one per Story, set by generated summaries. Drives the
// story-bar colour, so it stays a small fixed set that maps onto the six key colours.
export const DESKS = ['politics', 'science', 'economy', 'culture', 'justice', 'conflict'] as const

export const deskSchema = z.enum(DESKS)
export type Desk = z.infer<typeof deskSchema>

export const DESK_LABELS: Record<Desk, string> = {
  politics: 'Politics',
  science: 'Science',
  economy: 'Economy',
  culture: 'Culture',
  justice: 'Justice',
  conflict: 'Conflict',
}

// Colour slot (narrative-1…6 utilities) per desk. Slot 0 = no desk yet.
export const DESK_SLOT: Record<Desk, number> = {
  politics: 1,
  science: 2,
  economy: 3,
  culture: 4,
  justice: 5,
  conflict: 6,
}

/** What each desk covers, as given to the model. */
export const DESK_SCOPES: Record<Desk, string> = {
  politics: 'governments, elections, parties, diplomacy, public policy',
  science: 'climate, weather, natural disasters, environment, health, medicine, space, research',
  economy: 'business, trade, markets, jobs and labour, the tech industry',
  culture: 'society, arts, books, media, sport, religion',
  justice: 'courts, trials, crime, police, prisons, civil and human rights',
  conflict: 'war, armed attacks, military action, terrorism',
}
