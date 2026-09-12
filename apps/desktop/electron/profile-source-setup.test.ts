import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  disableUpstreamProfileBuild,
  ensureKiloModelDefaults,
  ensureProfileSourceSetup,
  profileSourceSkillPath
} from './profile-source-setup'

const roots: string[] = []

const KILO_FALLBACK_MODELS = [
  'nvidia/nemotron-3-ultra-550b-a55b:free',
  'poolside/laguna-s-2.1:free',
  'nvidia/nemotron-3-super-120b-a12b:free',
  'poolside/laguna-xs-2.1:free',
  'kilo-auto/free'
]

const KILO_DEFAULT_MODEL = 'stepfun/step-3.7-flash:free'

const tempRoot = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-profile-source-'))
  roots.push(root)

  return root
}

afterEach(() => roots.splice(0).forEach(root => fs.rmSync(root, { force: true, recursive: true })))

describe('profile-source setup', () => {
  it('seeds the anonymous Kilo main model and ordered fallback chain when model config is missing', () => {
    const result = ensureKiloModelDefaults('')

    expect(result).toContain('model:\n')
    expect(result).toContain('  provider: kilocode\n')
    expect(result).toContain(`  default: ${KILO_DEFAULT_MODEL}\n`)
    expect(result).toContain('  fallback_providers:\n')

    const models = [...result.matchAll(/\n {6}model: ([^\n]+)/g)].map(match => match[1])
    expect(models).toEqual(KILO_FALLBACK_MODELS)
  })

  it('preserves an existing provider, default model, and fallback chain byte-for-byte', () => {
    const config = `model:\n  provider: openai-codex\n  default: gpt-5.6\n  fallback_providers:\n    - provider: openai-codex\n      model: gpt-5.5\nother:\n  keep: true\n`

    expect(ensureKiloModelDefaults(config)).toBe(config)
  })

  it('does not inject a Kilo fallback into an explicit non-Kilo model config', () => {
    const config = `model:\n  provider: openai-codex\n  default: gpt-5.6\nother:\n  keep: true\n`

    expect(ensureKiloModelDefaults(config)).toBe(config)
  })

  it('adds the Kilo fallback chain when Kilo is explicitly selected but the chain is missing', () => {
    const config = `model:\n  provider: kilocode\n  default: ${KILO_DEFAULT_MODEL}\n`
    const result = ensureKiloModelDefaults(config)

    expect(result).toContain('  provider: kilocode\n')
    expect(result).toContain(`  default: ${KILO_DEFAULT_MODEL}\n`)
    expect(result).toContain('  fallback_providers:\n')
    expect(result).toContain(`      model: ${KILO_FALLBACK_MODELS[0]}\n`)
  })

  it('is idempotent and does not duplicate the fallback chain', () => {
    const first = ensureKiloModelDefaults('model:\n')
    const second = ensureKiloModelDefaults(first)

    expect(second).toBe(first)
    expect((second.match(/fallback_providers:/g) ?? []).length).toBe(1)
    expect((second.match(/ {6}model: /g) ?? []).length).toBe(KILO_FALLBACK_MODELS.length)
  })

  it('writes the bundled workflow under the fixed Hermes home path and preserves user config', () => {
    const root = tempRoot()
    const source = path.join(root, 'bundled-skill.md')
    fs.writeFileSync(source, '---\nname: profile-source\n---\n', 'utf8')
    fs.writeFileSync(path.join(root, 'config.yaml'), 'model:\n  provider: openai\nonboarding:\n  seen: true\n', 'utf8')

    const skillPath = ensureProfileSourceSetup({ hermesHome: root, workflowSource: source })

    expect(skillPath).toBe(profileSourceSkillPath(root))
    expect(skillPath).toContain(path.join('profile-source-v4', 'SKILL.md'))
    expect(fs.readFileSync(skillPath, 'utf8')).toContain('name: profile-source')
    expect(fs.readFileSync(path.join(root, 'config.yaml'), 'utf8')).toBe(
      'model:\n  provider: openai\nonboarding:\n  seen: true\n  profile_build: off\n\nimage_gen:\n  provider: openai-codex\n'
    )
  })

  it('seeds Kilo defaults through the profile bootstrap when the config is absent', () => {
    const root = tempRoot()
    const source = path.join(root, 'bundled-skill.md')
    fs.writeFileSync(source, 'profile source\n', 'utf8')

    ensureProfileSourceSetup({ hermesHome: root, workflowSource: source })

    const config = fs.readFileSync(path.join(root, 'config.yaml'), 'utf8')
    expect(config).toContain('model:\n  provider: kilocode\n')
    expect(config).toContain(`  default: ${KILO_DEFAULT_MODEL}\n`)
    expect(config).toContain(`      model: ${KILO_FALLBACK_MODELS.at(-1)}\n`)
  })

  it.each(['fal', 'openai'])('preserves an explicit image provider %s and remains idempotent', provider => {
    const root = tempRoot()
    const source = path.join(root, 'bundled-skill.md')
    fs.writeFileSync(source, 'profile source\n', 'utf8')
    const config = `image_gen:\n  provider: ${provider}\nonboarding:\n  seen: true\n`
    fs.writeFileSync(path.join(root, 'config.yaml'), config, 'utf8')

    ensureProfileSourceSetup({ hermesHome: root, workflowSource: source })
    const first = fs.readFileSync(path.join(root, 'config.yaml'), 'utf8')
    ensureProfileSourceSetup({ hermesHome: root, workflowSource: source })
    const second = fs.readFileSync(path.join(root, 'config.yaml'), 'utf8')

    expect(first).toContain(`image_gen:\n  provider: ${provider}`)
    expect(first).not.toContain('openai-codex')
    expect(second).toBe(first)
  })

  it('refuses an unfamiliar onboarding configuration without modifying it', () => {
    expect(() => disableUpstreamProfileBuild('onboarding: ask\n')).toThrow('unsupported onboarding shape')
  })

  it('refreshes an existing bundled workflow when its source changes', () => {
    const root = tempRoot()
    const source = path.join(root, 'bundled-skill.md')
    fs.writeFileSync(source, 'new internal prompt\n', 'utf8')
    const installed = profileSourceSkillPath(root)
    fs.mkdirSync(path.dirname(installed), { recursive: true })
    fs.writeFileSync(installed, 'old internal prompt\n', 'utf8')

    ensureProfileSourceSetup({ hermesHome: root, workflowSource: source })

    expect(fs.readFileSync(installed, 'utf8')).toBe('new internal prompt\n')
  })
})
