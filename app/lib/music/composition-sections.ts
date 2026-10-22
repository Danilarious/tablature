/** Preserve legacy content for writes; null means malformed/non-array data needs repair. */
export function parseCompositionSections(raw: unknown): unknown[] | null {
  if (raw === null || raw === undefined || raw === '') return [];
  try {
    const value = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(value) ? value : null;
  } catch { return null; }
}

/** UI options ignore unrecognized entries without rewriting the stored section document. */
export function compositionSectionOptions(raw: unknown): { id: string; name: string }[] {
  return (parseCompositionSections(raw) || []).flatMap((item, index) => {
    if (!item || typeof item !== 'object' || !('name' in item) || typeof item.name !== 'string' || !item.name.trim()) return [];
    return [{ id: 'id' in item && typeof item.id === 'string' ? item.id : `legacy-${index}`, name: item.name }];
  });
}
