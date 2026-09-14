type FieldLike = {
  name?: string;
  value?: unknown;
  title?: string;
  document?: { fields?: FieldLike[] };
  fields?: FieldLike[];
  documents?: unknown[];
};

function asArray<T>(value: T | T[] | Record<string, T> | undefined | null): T[] {
  if (value == null) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === "object") return Object.values(value);
  return [];
}

export function findField(fields: FieldLike[] | Record<string, FieldLike> | undefined, name: string): FieldLike | undefined {
  return asArray(fields).find((f) => f.name === name);
}

export function fieldValue(fields: FieldLike[] | Record<string, FieldLike> | undefined, name: string): unknown {
  return findField(fields, name)?.value;
}

export function nestedValue(
  rootFields: FieldLike[] | Record<string, FieldLike> | undefined,
  sectionName: string,
  fieldName: string,
): unknown {
  const section = findField(rootFields, sectionName);
  return fieldValue(section?.document?.fields, fieldName);
}

export function flattenNamedFields(documentFields: FieldLike[] | Record<string, FieldLike> | undefined): FieldLike[] {
  return asArray(documentFields);
}
