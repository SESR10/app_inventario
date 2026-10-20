import { describe, expect, it } from 'vitest'
import { parseNumber } from './format'

describe('parseNumber', () => {
  it.each([
    ['12', 12],
    ['12,5', 12.5],
    ['12.5', 12.5],
    ['1.234,56', 1234.56],
    ['1,234.56', 1234.56],
    [' 7 ', 7],
    ['1.500', 1500],
    ['12.000', 12000],
    ['1.234.567', 1234567],
    ['1,500', 1500],
    ['0.125', 0.125],
    ['1.5', 1.5],
    ['1.25', 1.25],
  ])('lee %s', (raw, expected) => expect(parseNumber(raw)).toBe(expected))

  it.each(['', 'abc', '1,2,3x'])('rechaza %s', (raw) => expect(parseNumber(raw)).toBeNull())
})
