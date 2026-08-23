import * as fs from 'node:fs'
import * as path from 'node:path'

import { expect, test } from './test'
import { buildAppEnv, createSandbox, launchDesktop } from './fixtures'

const REPO_ROOT = path.resolve(process.cwd(), '..', '..', '..', '..')
const FIXTURE_PATH = path.join(REPO_ROOT, '_evidence', 'bp-11c-v2', 'sample-skill', 'SKILL.md')
const EVIDENCE_ROOT = path.join(REPO_ROOT, '_evidence', 'bp-11c-v2')
// BP-11B already proved this local source + venv can start a gateway. Reuse
// that runtime while createSandbox still isolates every BP-11C profile datum.
const READY_RUNTIME_ROOT = path.join(REPO_ROOT, '_evidence', 'bp-05', 'hermes-home', 'hermes-agent')

type ElectronBridge = {
  desktopPluginsRoot?: () => Promise<string>
  readFileText: (filePath: string) => Promise<{ byteSize: number; text: string }>
}

function installWindowsElectronAlias(): () => void {
  if (process.platform !== 'win32') {
    return () => undefined
  }

  const electronDist = path.resolve(process.cwd(), '..', '..', 'node_modules', 'electron', 'dist')
  const electronExe = path.join(electronDist, 'electron.exe')
  const extensionlessElectron = path.join(electronDist, 'electron')

  if (fs.existsSync(extensionlessElectron)) {
    return () => undefined
  }

  fs.linkSync(electronExe, extensionlessElectron)

  return () => fs.rmSync(extensionlessElectron, { force: true })
}

async function dismissProviderSetup(page: import('@playwright/test').Page): Promise<void> {
  const later = page.getByRole('button', { name: /choose a provider later/i })
  await later.waitFor({ state: 'visible', timeout: 30_000 })
  await later.click()
}

test('BP-11C reads SKILL.md through Electron bridge and renders metadata card', async () => {
  const sandbox = createSandbox('bp-11c-v2')
  const consoleLines: string[] = []
  let app: Awaited<ReturnType<typeof launchDesktop>>['app'] | null = null
  const removeElectronAlias = installWindowsElectronAlias()

  try {
    fs.mkdirSync(path.join(sandbox.hermesHome, 'super-agent-workflows', 'bp-11c-sample'), { recursive: true })
    fs.copyFileSync(FIXTURE_PATH, path.join(sandbox.hermesHome, 'super-agent-workflows', 'bp-11c-sample', 'SKILL.md'))
    fs.writeFileSync(path.join(sandbox.hermesHome, 'config.yaml'), '# BP-11C E2E: no provider configured\n', 'utf8')

    const env = buildAppEnv(sandbox, {
      ELECTRON_DISABLE_SANDBOX: '1',
      HERMES_DESKTOP_CDP_PORT: 'off',
      HERMES_DESKTOP_DISABLE_GPU: '1',
      HERMES_DESKTOP_HERMES_ROOT: READY_RUNTIME_ROOT,
    })
    const launched = await launchDesktop(env)
    app = launched.app
    const { page } = launched

    page.on('console', message => {
      if (message.text().includes('[BP-11C]')) {
        consoleLines.push(message.text())
      }
    })

    await dismissProviderSetup(page)
    await page.getByText('Desktop Plugin PoC', { exact: true }).click({ timeout: 30_000 })
    await expect(page.getByRole('button', { name: 'Đọc SKILL.md mẫu' })).toBeVisible({ timeout: 30_000 })

    const bridgeData = await page.evaluate(async () => {
      const hermesDesktop = (window as unknown as { hermesDesktop: ElectronBridge }).hermesDesktop
      const desktopPluginsRoot = hermesDesktop.desktopPluginsRoot
      if (!desktopPluginsRoot) {
        throw new Error('Electron bridge does not expose desktopPluginsRoot')
      }

      const pluginsRoot = await desktopPluginsRoot()
      const profileRoot = pluginsRoot?.replace(/[\\/]+desktop-plugins[\\/]*$/, '') ?? ''
      const skillPath = `${profileRoot}\\super-agent-workflows\\bp-11c-sample\\SKILL.md`
      const result = await hermesDesktop.readFileText(skillPath)

      return { pluginsRoot, skillPath, byteSize: result.byteSize, text: result.text }
    })
    expect(bridgeData.pluginsRoot).toBeTruthy()
    expect(bridgeData.text).toContain('work_area: Nội dung marketing')
    expect(bridgeData.text).toContain('display_name: Viết bài Facebook')

    await page.getByRole('button', { name: 'Đọc SKILL.md mẫu' }).click()
    const card = page.getByRole('article', { name: 'BP-11C skill metadata card' })
    await expect(card).toContainText('Skill: Viết bài Facebook')
    await expect(card).toContainText('Mảng công việc: Nội dung marketing')
    await expect(card).toContainText('Nguồn: SKILL.md qua Electron bridge')

    fs.mkdirSync(EVIDENCE_ROOT, { recursive: true })
    fs.writeFileSync(
      path.join(EVIDENCE_ROOT, 'runtime-playwright.log'),
      JSON.stringify({
        bridge: {
          method: 'readFileText',
          pluginsRoot: bridgeData.pluginsRoot,
          skillPath: bridgeData.skillPath,
          byteSize: bridgeData.byteSize,
        },
        assertions: {
          fixtureFields: ['work_area: Nội dung marketing', 'display_name: Viết bài Facebook'],
          cardLines: [
            'Skill: Viết bài Facebook',
            'Mảng công việc: Nội dung marketing',
            'Nguồn: SKILL.md qua Electron bridge',
          ],
          result: 'passed',
        },
        console: consoleLines,
      }, null, 2),
      'utf8',
    )
  } finally {
    await app?.close().catch(() => undefined)
    sandbox.cleanup()
    removeElectronAlias()
  }
})
