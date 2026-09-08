export type FieldType =
  | "text"
  | "textarea"
  | "number"
  | "decimal"
  | "select"
  | "checkbox"
  | "email"
  | "tel";

export interface SelectSource {
  /** Prisma delegate to read options from, e.g. "city". */
  model: string;
  /** Field shown to the user. */
  labelField: string;
  /** Optional second line / disambiguator, e.g. the state name. */
  hintField?: string;
  /** Restricts options, e.g. only ACTIVE rows. */
  activeOnly?: boolean;
}

export interface MasterField {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  placeholder?: string;
  hint?: string;
  /** Fixed options, or a lookup against another table. */
  options?: Array<{ value: string; label: string }>;
  optionsFrom?: SelectSource;
  /** Width in the 2-column form grid. */
  colSpan?: 1 | 2;
  /** Show as a column in the list. */
  inList?: boolean;
  align?: "left" | "right" | "center";
  min?: number;
  max?: number;
  step?: number;
  /** Uppercase on input — used for codes. */
  uppercase?: boolean;
}

export interface MasterDef {
  /** URL slug: /masters/<key> */
  key: string;
  /** Permission resource: masters.<resource>.<action> */
  resource: string;
  /** Prisma delegate name. */
  model: string;
  label: string;
  singular: string;
  description: string;
  /** Section on the masters index page. */
  group: string;
  icon: string;
  fields: MasterField[];
  searchFields: string[];
  defaultSort?: { field: string; dir: "asc" | "desc" };
  /** Relations to pull for list display: { city: "name" }. */
  listRelations?: Record<string, string>;
}
