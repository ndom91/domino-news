import { z } from 'zod/mini'

export const countryCodeSchema = z.string().check(z.regex(/^[A-Z]{2}$/))

/** A place an event happens in or directly affects. City and county are optional. */
export const placeSchema = z.object({
  city: z.nullable(z.string().check(z.trim(), z.minLength(1), z.maxLength(100))),
  county: z.nullable(z.string().check(z.trim(), z.minLength(1), z.maxLength(100))),
  country: countryCodeSchema,
})
export type Place = z.infer<typeof placeSchema>

export const localScopeSchema = z.enum(['city', 'county', 'country'])
export type LocalScope = z.infer<typeof localScopeSchema>
