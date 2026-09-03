/**
 * The product's identity, in one place.
 *
 * `name` is a proper noun and stays as it is in every language — a brand that
 * changes with the locale is not a brand. The descriptor beside it is what
 * gets translated, because it is the part carrying the words people search
 * for: "יומן עברי" here, "Hebrew Calendar" in English, "Calendário Hebraico"
 * in Portuguese. When the translation layer lands, `descriptor` and `tagline`
 * move into it and `name` does not.
 */
export const BRAND = {
  /** Spoken and written the same everywhere. */
  name: 'מועד',
  /** For contexts that cannot render Hebrew — package names, URLs, invoices. */
  latinName: 'Moed',
  /** Localised. Carries the search terms; never part of the logo itself. */
  descriptor: 'יומן עברי',
  /** Tehillim 102 — "for the appointed time has come". */
  tagline: 'כי בא מועד',
} as const;

/** "מועד · יומן עברי" — brand and descriptor, for titles and headers. */
export const lockup = `${BRAND.name} · ${BRAND.descriptor}`;
