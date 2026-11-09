export type Ok<T> = { ok: true; data: T }
export type Fail = { ok: false; code: string; message: string }
export type Result<T> = Ok<T> | Fail

export class AppError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'AppError'
    this.code = code
  }
}

export function fail(error: unknown): Fail {
  if (error instanceof AppError) {
    return { ok: false, code: error.code, message: error.message }
  }
  console.error('[asms] unhandled error', error)
  return {
    ok: false,
    code: 'INTERNAL_ERROR',
    message: '服务暂时不可用，请稍后再试',
  }
}

export async function run<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, data: await fn() }
  } catch (error) {
    return fail(error)
  }
}

export function assert(
  condition: unknown,
  code: string,
  message: string,
): asserts condition {
  if (!condition) throw new AppError(code, message)
}
