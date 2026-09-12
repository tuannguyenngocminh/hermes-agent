import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const styles = readFileSync(resolve(process.cwd(), 'src/styles.css'), 'utf8')

describe('source color tokens', () => {
  it('defines all source colors for the app light and dark themes', () => {
    expect(styles).toContain('--src-hermes:')
    expect(styles).toContain('--src-sa:')
    expect(styles).toContain('--src-hub:')
    expect(styles).toContain('--src-mine:')
    expect(styles).toMatch(/:root\.dark\s*\{[^}]*--src-hermes:/s)
    expect(styles).toMatch(/:root\.dark\s*\{[^}]*--src-sa:/s)
    expect(styles).toMatch(/:root\.dark\s*\{[^}]*--src-hub:/s)
    expect(styles).toMatch(/:root\.dark\s*\{[^}]*--src-mine:/s)
  })
})
