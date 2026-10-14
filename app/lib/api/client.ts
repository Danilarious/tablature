/**
 * Browser-side helpers for calling the local API safely.
 * Every response is checked before its JSON is used.
 */

export interface ApiErrorBody {
  error?: string;
  issues?: { path?: string; message?: string }[];
}

/** Human-readable message from an API error body (validation issues included). */
export function describeApiError(body: unknown, status: number): string {
  const b = (body && typeof body === 'object' ? body : {}) as ApiErrorBody;
  const base = typeof b.error === 'string' && b.error ? b.error : `Request failed (HTTP ${status}).`;
  const issues = Array.isArray(b.issues)
    ? b.issues
        .map((i) => [i?.path, i?.message].filter(Boolean).join(': '))
        .filter(Boolean)
    : [];
  return issues.length > 0 && !issues.includes(base) ? `${base} ${issues.join('; ')}` : base;
}

export class ApiRequestError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

/** fetch + res.ok check + JSON parse. Throws ApiRequestError with a readable message. */
export async function fetchJson<T>(input: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(input, init);
  } catch {
    throw new ApiRequestError(0, 'Could not reach the local notebook server.');
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new ApiRequestError(res.status, describeApiError(body, res.status));
  return body as T;
}

/** Uploads a file/blob as an attachment of an existing (saved) record. */
export async function uploadAttachmentFile(
  blob: Blob,
  filename: string,
  parentType: string,
  parentId: string,
  description?: string
): Promise<{ id: string; filePath: string; displayName: string }> {
  const form = new FormData();
  form.append('file', blob, filename);
  form.append('parentType', parentType);
  form.append('parentId', parentId);
  if (description) form.append('description', description);
  return fetchJson('/api/attachments', { method: 'POST', body: form });
}
