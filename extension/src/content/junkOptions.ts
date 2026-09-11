const JUNK_OPTION_PATTERNS: RegExp[] = [
  /^[-_.]{3,}$/,
  /^loading(\.{0,3})?$/i,
  /^please wait(\.{0,3})?$/i,
  /^searching(\.{0,3})?$/i,
  /^fetching(\.{0,3})?$/i,
  /^no (results|options|matches)( found)?$/i,
];

export function isJunkOptionText(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;
  return JUNK_OPTION_PATTERNS.some(re => re.test(trimmed));
}

/** Strips loading placeholders / separator rows out of a scraped or DOM-read options list. */
export function filterJunkOptions(options: string[]): string[] {
  return options.filter(opt => !isJunkOptionText(opt));
}
