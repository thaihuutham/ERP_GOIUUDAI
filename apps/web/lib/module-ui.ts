export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
export type FieldValue = string | number | boolean;
export type UserRole = 'STAFF' | 'MANAGER' | 'ADMIN';

export type FieldType =
  | 'text'
  | 'number'
  | 'date'
  | 'datetime-local'
  | 'textarea'
  | 'select'
  | 'checkbox';

export type SelectOption = {
  label: string;
  value: string;
};

export type FormField = {
  name: string;
  label: string;
  type?: FieldType;
  required?: boolean;
  placeholder?: string;
  description?: string;
  defaultValue?: FieldValue;
  options?: SelectOption[];
};

export type ActionPreset = {
  label: string;
  description?: string;
  values: Record<string, FieldValue>;
};

export type FeatureAction = {
  key: string;
  label: string;
  method: HttpMethod;
  endpoint: string;
  description?: string;
  submitLabel?: string;
  presets?: ActionPreset[];
  allowedRoles?: UserRole[];
  fields: FormField[];
};

export type FeatureView = 'table' | 'object';

export type FilterType = 'text' | 'select' | 'date' | 'number' | 'checkbox';
export type FilterBehavior = 'search' | 'exact' | 'contains' | 'date_from' | 'date_to' | 'boolean';

export type FeatureFilter = {
  key: string;
  label: string;
  type?: FilterType;
  placeholder?: string;
  description?: string;
  options?: SelectOption[];
  defaultValue?: FieldValue;
  queryParam?: string;
  targetField?: string;
  behavior?: FilterBehavior;
  includeInQuery?: boolean;
};

export type ModuleFeature = {
  key: string;
  title: string;
  description: string;
  view?: FeatureView;
  listEndpoint?: string;
  emptyMessage?: string;
  columns?: string[];
  filters?: FeatureFilter[];
  autoLoad?: boolean;
  actions: FeatureAction[];
};

export type ModuleDefinition = {
  key: string;
  title: string;
  summary: string;
  highlights: string[];
  features: ModuleFeature[];
};
