export interface ExtractedField {
  id: string;
  name: string;
  type: string;
  label: string;
  placeholder: string;
  required: boolean;
  options?: string[];
  multiple?: boolean;
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

export interface JobPostingMeta {
  company: string | null;
  role: string | null;
  location: string | null;
}
