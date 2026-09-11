export interface ExtractedField {
  id: string;
  name: string;
  type: string;
  label: string;
  placeholder: string;
  required: boolean;
  options?: string[];
  /** True if this field accepts more than one selected value (e.g. id/name ending in "[]", a <select multiple>, or aria-multiselectable="true"). */
  multiple?: boolean;
  /**
   * Only meaningful when type === "select".
   * "strict"  — `options` is the complete, closed list. The value MUST be one of these entries verbatim; do not invent or free-type a value.
   * "dynamic" — this is a typeahead/search field (e.g. school or city lookup). `options` may be empty or just a stale preview — type a query into it and pick from whatever results actually render, rather than trusting `options` as exhaustive.
   */
  optionsMode?: 'strict' | 'dynamic';
  elementSelector: string;
  alreadyFilled?: boolean;
}

export interface AnalysisResponse {
  url: string;
  title: string;
  inputsCount: number;
  textareasCount: number;
  selectsCount: number;
  fields: ExtractedField[];
}

/** Best-effort job-posting facts scraped from schema.org JobPosting JSON-LD, if present. Never guessed -- fields are null when the page has no such data. */
export interface JobPostingMeta {
  company: string | null;
  role: string | null;
  location: string | null;
}
