import { describe, expect, it } from 'vitest'
import { toDbErrorCode, type DbErrorResponse } from '@/data/errors'

const response = (status: number, message: unknown, code?: unknown): DbErrorResponse => ({
  status,
  error: code === undefined ? { message } : { message, code },
})

describe('toDbErrorCode', () => {
  it.each([
    [
      'AbortError (the shared deadline fired)',
      response(0, 'AbortError: The user aborted a request.', ''),
      'timeout',
    ],
    [
      'TimeoutError (AbortSignal.timeout)',
      response(0, 'TimeoutError: The operation timed out.', ''),
      'timeout',
    ],
    ['a failed fetch', response(0, 'TypeError: Failed to fetch', ''), 'network'],
    ['status 0 without a message', response(0, undefined), 'network'],
    ['540 (project paused)', response(540, '<html>paused</html>'), 'paused'],
    ['540 with a code', response(540, 'x', 'PGRST000'), 'paused'],
    ['PGRST205 (table not in the schema cache)', response(404, 'x', 'PGRST205'), 'schema-missing'],
    ['42501 on 401 (grants missing)', response(401, 'x', '42501'), 'permission'],
    ['42501 on 403', response(403, 'x', '42501'), 'permission'],
    ['401 without a code (key rejected)', response(401, 'Invalid API key'), 'invalid-key'],
    ['403 with an empty code', response(403, 'x', ''), 'invalid-key'],
    ['23505 (unique violation)', response(409, 'x', '23505'), 'pg-23505'],
    ['23514 (check violation)', response(400, 'x', '23514'), 'pg-23514'],
    ['PGRST116 (more than one row)', response(406, 'x', 'PGRST116'), 'pg-PGRST116'],
    ['500 without a code', response(500, 'x'), 'http-500'],
    ['503 without a code', response(503, 'x'), 'http-503'],
    ['a null error body', { status: 502, error: null }, 'http-502'],
  ] as const)('maps %s', (_label, input, expected) => {
    expect(toDbErrorCode(input)).toBe(expected)
  })

  it.each([
    ['markup', '<b>x</b>'],
    ['a space', '23 505'],
    ['a URL', 'https://example.com'],
    ['an overlong value', 'A'.repeat(13)],
    ['a number', 23505],
  ])('ignores a code that is %s (only short alphanumeric codes are shown)', (_label, code) => {
    expect(toDbErrorCode(response(400, 'x', code))).toBe('http-400')
    expect(toDbErrorCode(response(401, 'x', code))).toBe('invalid-key')
  })

  it('treats a non-string message as empty', () => {
    expect(toDbErrorCode(response(0, { name: 'AbortError' }))).toBe('network')
  })

  it('falls back to unexpected for a status that is not an integer', () => {
    expect(toDbErrorCode(response(Number.NaN, 'x'))).toBe('unexpected')
  })
})
