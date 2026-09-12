import { host, PALETTE_AREA, type HermesPlugin } from '@hermes/plugin-sdk'

import { setAdvancedMode } from '@/app/advanced-mode'

export const ADVANCED_PLUGIN_ID = 'super-agent-advanced'

export const advancedPlugin: HermesPlugin = {
  id: ADVANCED_PLUGIN_ID,
  name: 'Chế độ nâng cao',
  defaultEnabled: false,
  register(ctx) {
    setAdvancedMode(true)

    // PluginContext tracks this registration and removes it with the plugin.
    ctx.register({
      id: 'advanced.openSkills',
      area: PALETTE_AREA,
      data: {
        id: 'advanced.openSkills',
        keywords: ['skills', 'capabilities', 'advanced', 'nâng cao'],
        label: 'Mở Skills nâng cao',
        run: () => host.navigate('/skills')
      }
    })

    ctx.onDispose(() => setAdvancedMode(false))
  }
}

export default advancedPlugin
