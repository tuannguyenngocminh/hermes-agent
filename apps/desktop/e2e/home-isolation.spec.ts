import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

import { expect, test, _electron } from '@playwright/test'

import { PACKAGED_BINARY_PATH, packagedBinaryExists } from './fixtures'

test('packaged desktop ignores HERMES_HOME and creates its own Super Agent root', async () => {
  test.skip(!packagedBinaryExists(), `Built app binary not found: ${PACKAGED_BINARY_PATH}`)

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'super-agent-home-isolation-'))
  const localAppData = path.join(root, 'AppData', 'Local')
  const dailyHome = path.join(localAppData, 'hermes')
  const foreignHome = path.join(root, 'foreign-hermes-home')
  const dailySentinel = path.join(dailyHome, 'daily-sentinel.txt')
  const foreignSentinel = path.join(foreignHome, 'foreign-sentinel.txt')
  const writeSentinel = (file: string, content: string) => {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, content, 'utf8')
    return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
  }
  const dailyHash = writeSentinel(dailySentinel, 'Hermes Daily must remain untouched')
  const foreignHash = writeSentinel(foreignSentinel, 'Foreign HERMES_HOME must remain untouched')
  let app: Awaited<ReturnType<typeof _electron.launch>> | undefined

  try {
    const env: Record<string, string> = {
      ...process.env as Record<string, string>,
      LOCALAPPDATA: localAppData,
      HERMES_HOME: foreignHome,
      HERMES_DESKTOP_BOOT_FAKE: '1',
      HERMES_DESKTOP_BOOT_FAKE_STEP_MS: '20',
      HERMES_DESKTOP_APP_NAME: `SuperAgentHomeIsolation-${Date.now()}`,
      HERMES_DESKTOP_CDP_PORT: 'off',
      HERMES_DESKTOP_DISABLE_GPU: '1',
      ELECTRON_DISABLE_SANDBOX: '1',
    }
    delete env.SUPER_AGENT_HOME
    delete env.HERMES_DESKTOP_USER_DATA_DIR

    app = await _electron.launch({ executablePath: PACKAGED_BINARY_PATH, args: ['--disable-gpu', '--no-sandbox'], env })
    const page = await app.firstWindow()
    await page.waitForSelector('#root', { state: 'attached', timeout: 30_000 })
    const pluginRoot = await page.evaluate(async () => {
      const bridge = (window as any).hermesDesktop
      return bridge.desktopPluginsRoot()
    })

    expect(pluginRoot).toBe(path.join(localAppData, 'super-agent', 'desktop-plugins'))
    expect(fs.existsSync(pluginRoot)).toBe(true)
    expect(crypto.createHash('sha256').update(fs.readFileSync(dailySentinel)).digest('hex')).toBe(dailyHash)
    expect(crypto.createHash('sha256').update(fs.readFileSync(foreignSentinel)).digest('hex')).toBe(foreignHash)
    expect(fs.existsSync(path.join(dailyHome, 'desktop-plugins'))).toBe(false)
    expect(fs.existsSync(path.join(foreignHome, 'desktop-plugins'))).toBe(false)
  } finally {
    await app?.close().catch(() => undefined)
    fs.rmSync(root, { recursive: true, force: true })
  }
})
