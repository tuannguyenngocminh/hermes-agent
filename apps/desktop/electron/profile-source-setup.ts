import fs from 'node:fs'
import path from 'node:path'

const PROFILE_SOURCE_SKILL = path.join('skills', 'super-agent', 'profile-source-v4', 'SKILL.md')
const KILO_PROVIDER = 'kilocode'
const KILO_DEFAULT_MODEL = 'stepfun/step-3.7-flash:free'

const KILO_FALLBACK_MODELS = [
  'nvidia/nemotron-3-ultra-550b-a55b:free',
  'poolside/laguna-s-2.1:free',
  'nvidia/nemotron-3-super-120b-a12b:free',
  'poolside/laguna-xs-2.1:free',
  'kilo-auto/free'
] as const

export function profileSourceSkillPath(hermesHome: string): string {
  return path.join(path.resolve(hermesHome), PROFILE_SOURCE_SKILL)
}

export function disableUpstreamProfileBuild(config: string): string {
  const lines = config.split(/\r?\n/)

  if (lines.length === 1 && !lines[0]) {
    lines.length = 0
  }

  const start = lines.findIndex(line => !line.trimStart().startsWith('#') && line.trimStart().startsWith('onboarding:'))

  if (start < 0) {
    if (lines.length && lines.at(-1) !== '') {
      lines.push('')
    }

    lines.push('onboarding:', '  profile_build: off')

    return `${lines.join('\n')}${lines.at(-1) === '' ? '' : '\n'}`
  }

  const value = lines[start].trimStart().slice('onboarding:'.length).split('#', 1)[0].trim()

  if (value === '{}') {
    lines[start] = 'onboarding:'
  } else if (value) {
    throw new Error('Existing config.yaml uses an unsupported onboarding shape; it was left unchanged.')
  }

  const end = lines.findIndex(
    (line, index) =>
      index > start && line.trim() && !line.startsWith(' ') && !line.startsWith('\t') && !line.startsWith('#')
  )

  let limit = end < 0 ? lines.length : end

  while (limit > start + 1 && !lines[limit - 1].trim()) {
    limit -= 1
  }

  const existing = lines.findIndex(
    (line, index) => index > start && index < limit && line.trimStart().startsWith('profile_build:')
  )

  if (existing >= 0) {
    const indent = lines[existing].match(/^\s*/)?.[0] ?? ''
    lines[existing] = `${indent}profile_build: off`
  } else {
    lines.splice(limit, 0, '  profile_build: off')
  }

  return `${lines.join('\n')}${lines.at(-1) === '' ? '' : '\n'}`
}

export function ensureImageGenProviderDefault(config: string): string {
  const lines = config.split(/\r?\n/)

  if (lines.length === 1 && !lines[0]) {
    lines.length = 0
  }

  const start = lines.findIndex(line => !line.trimStart().startsWith('#') && line.trimStart().startsWith('image_gen:'))

  if (start < 0) {
    if (lines.length && lines.at(-1) !== '') {
      lines.push('')
    }

    lines.push('image_gen:', '  provider: openai-codex')

    return `${lines.join('\n')}${lines.at(-1) === '' ? '' : '\n'}`
  }

  const value = lines[start].trimStart().slice('image_gen:'.length).split('#', 1)[0].trim()

  if (value === '{}') {
    lines[start] = 'image_gen:'
  } else if (value) {
    throw new Error('Existing config.yaml uses an unsupported image_gen shape; it was left unchanged.')
  }

  const end = lines.findIndex(
    (line, index) =>
      index > start && line.trim() && !line.startsWith(' ') && !line.startsWith('\t') && !line.startsWith('#')
  )

  let limit = end < 0 ? lines.length : end

  while (limit > start + 1 && !lines[limit - 1].trim()) {
    limit -= 1
  }

  const existing = lines.findIndex((line, index) => index > start && index < limit && /^ {2}provider\s*:/.test(line))

  if (existing >= 0) {
    const configured = lines[existing]
      .slice(lines[existing].indexOf(':') + 1)
      .split('#', 1)[0]
      .trim()

    if (configured) {
      return config
    }

    lines[existing] = '  provider: openai-codex'
  } else {
    lines.splice(limit, 0, '  provider: openai-codex')
  }

  return `${lines.join('\n')}${lines.at(-1) === '' ? '' : '\n'}`
}

function topLevelBlockEnd(lines: string[], start: number): number {
  const next = lines.findIndex(
    (line, index) =>
      index > start &&
      line.trim() &&
      !line.startsWith(' ') &&
      !line.startsWith('\t') &&
      !line.trimStart().startsWith('#')
  )

  return next < 0 ? lines.length : next
}

function modelFieldIndex(lines: string[], start: number, end: number, field: string): number {
  const pattern = new RegExp(`^ {2}${field}\\s*:`)

  return lines.findIndex((line, index) => index > start && index < end && pattern.test(line))
}

function scalarValue(line: string): string {
  return line
    .slice(line.indexOf(':') + 1)
    .split('#', 1)[0]
    .trim()
}

function appendKiloDefaults(lines: string[], end: number, fields: string[]): number {
  const insertion = end
  lines.splice(insertion, 0, ...fields)

  return insertion + fields.length
}

function kiloFallbackLines(): string[] {
  return [
    '  fallback_providers:',
    ...KILO_FALLBACK_MODELS.flatMap(model => ['    - provider: kilocode', `      model: ${model}`])
  ]
}

export function ensureKiloModelDefaults(config: string): string {
  const eol = config.includes('\r\n') ? '\r\n' : '\n'
  const lines = config.split(/\r?\n/)

  if (lines.length === 1 && !lines[0]) {
    lines.length = 0
  }

  const modelStart = lines.findIndex(
    line => /^model\s*:/.test(line.trimStart()) && !line.startsWith(' ') && !line.startsWith('\t')
  )

  if (modelStart < 0) {
    if (lines.length && lines.at(-1) !== '') {
      lines.push('')
    }

    lines.push('model:', `  provider: ${KILO_PROVIDER}`, `  default: ${KILO_DEFAULT_MODEL}`, ...kiloFallbackLines())

    return `${lines.join(eol)}${lines.at(-1) === '' ? '' : eol}`
  }

  const modelValue = scalarValue(lines[modelStart])

  if (modelValue && modelValue !== '{}') {
    return config
  }

  const modelEnd = topLevelBlockEnd(lines, modelStart)
  const providerIndex = modelFieldIndex(lines, modelStart, modelEnd, 'provider')
  const defaultIndex = modelFieldIndex(lines, modelStart, modelEnd, 'default')
  const fallbackIndex = modelFieldIndex(lines, modelStart, modelEnd, 'fallback_providers')
  const provider = providerIndex >= 0 ? scalarValue(lines[providerIndex]).toLowerCase() : ''
  const defaultModel = defaultIndex >= 0 ? scalarValue(lines[defaultIndex]) : ''

  // An explicit non-Kilo provider, or a partial config whose provider is
  // absent but already contains a model/fallback choice, belongs to the user.
  // Leave it untouched rather than injecting an incompatible Kilo chain.
  if (provider && !['kilocode', 'kilo', 'kilo-code', 'kilo-gateway'].includes(provider)) {
    return config
  }

  if (!provider && (defaultModel || fallbackIndex >= 0)) {
    return config
  }

  const additions: string[] = []

  if (providerIndex < 0) {
    additions.push(`  provider: ${KILO_PROVIDER}`)
  }

  if (defaultIndex < 0) {
    additions.push(`  default: ${KILO_DEFAULT_MODEL}`)
  }

  if (fallbackIndex < 0) {
    additions.push(...kiloFallbackLines())
  }

  if (additions.length) {
    appendKiloDefaults(lines, modelEnd, additions)
  }

  return `${lines.join(eol)}${lines.at(-1) === '' ? '' : eol}`
}

function writeAtomic(target: string, contents: string) {
  const temp = `${target}.tmp`
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(temp, contents, 'utf8')
  fs.renameSync(temp, target)
}

export function ensureProfileSourceSetup({
  hermesHome,
  workflowSource
}: {
  hermesHome: string
  workflowSource: string
}) {
  if (!fs.existsSync(workflowSource)) {
    throw new Error(`Bundled profile-source workflow is missing: ${workflowSource}`)
  }

  const skillPath = profileSourceSkillPath(hermesHome)
  const bundledWorkflow = fs.readFileSync(workflowSource, 'utf8')
  const installedWorkflow = fs.existsSync(skillPath) ? fs.readFileSync(skillPath, 'utf8') : null

  if (installedWorkflow !== bundledWorkflow) {
    writeAtomic(skillPath, bundledWorkflow)
  }

  const configPath = path.join(path.resolve(hermesHome), 'config.yaml')
  const current = fs.existsSync(configPath) ? fs.readFileSync(configPath, 'utf8') : ''
  const next = ensureKiloModelDefaults(ensureImageGenProviderDefault(disableUpstreamProfileBuild(current)))

  if (next !== current) {
    writeAtomic(configPath, next)
  }

  return skillPath
}
