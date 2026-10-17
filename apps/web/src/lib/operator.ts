// Who runs Domino, for the imprint, privacy policy and terms. Edit here, not in the pages.
export const OPERATOR = {
  name: 'Nico Domino',
  email: 'domino-wire@ndo.dev',
  country: 'Germany',
  // §5 DDG expects a serviceable postal address for services offered to others. Null hides
  // the line; set it (e.g. a c/o imprint address service) to show it on /imprint.
  address: null as string | null,
  // Who hosts the servers, if not the operator. Null = the operator runs them.
  hostingProvider: null as string | null,
}

// When the legal pages last changed. Bump with any edit to their content.
export const LEGAL_UPDATED_AT = '2026-10-17'
