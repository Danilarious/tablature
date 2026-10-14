import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { CompatibilityError } from '../validation/schemas';

/** An error whose message is safe to show to the user. */
export class HttpError extends Error {
  constructor(public readonly status: number, message: string, public readonly details?: unknown) {
    super(message);
    this.name = 'HttpError';
  }
}

export async function readJsonBody(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new HttpError(400, 'Request body must be valid JSON.');
  }
}

/**
 * Converts any thrown value into a response WITHOUT leaking filesystem paths,
 * SQL, or stack traces. Unexpected errors are logged server-side only.
 */
export function apiErrorResponse(error: unknown, context: string): NextResponse {
  // Next.js uses thrown errors for control flow (e.g. dynamic-rendering bailout). Re-throw them.
  const digest = (error as { digest?: unknown })?.digest;
  if (typeof digest === 'string' && (digest === 'DYNAMIC_SERVER_USAGE' || digest.startsWith('NEXT_'))) {
    throw error;
  }
  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        error: 'Validation failed.',
        issues: error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      },
      { status: 400 }
    );
  }
  if (error instanceof CompatibilityError) {
    return NextResponse.json(
      { error: error.message, issues: [{ path: error.path.join('.'), message: error.message }] },
      { status: 400 }
    );
  }
  if (error instanceof HttpError) {
    return NextResponse.json({ error: error.message, ...(error.details ? { details: error.details } : {}) }, { status: error.status });
  }
  const code = (error as { code?: unknown })?.code;
  if ((error as { name?: unknown })?.name === 'MigrationError') {
    return NextResponse.json(
      { error: 'The notebook database is unavailable (migration or maintenance in progress or failed). Check the server log for recovery steps.' },
      { status: 503 }
    );
  }
  if (typeof code === 'string' && code.startsWith('SQLITE_CONSTRAINT')) {
    console.error(`[api:${context}] constraint violation`, error);
    return NextResponse.json({ error: 'The record conflicts with existing data (duplicate ID or missing reference).' }, { status: 409 });
  }
  console.error(`[api:${context}] unexpected error`, error);
  return NextResponse.json({ error: 'An internal error occurred. Check the server log for details.' }, { status: 500 });
}
