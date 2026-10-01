import { describe, expect, it } from 'vitest'
import { searchPattern } from '../search.ts'

describe('searchPattern', () => {
  it('matches literally and never everything', () => {
    expect(searchPattern('  lunch * ')).toBe('%lunch%')
    expect(searchPattern('50%_off')).toBe(String.raw`%50\%\_off%`)
    expect(searchPattern('a,b(c)"d')).toBe('%a b c d%')
    expect(searchPattern('*')).toBeNull()
    expect(searchPattern('')).toBeNull()
  })
})
