import {
  type HermesPlugin,
  type RouteContribution,
  ROUTES_AREA,
  SIDEBAR_NAV_AREA,
  type SidebarNavContribution
} from '@hermes/plugin-sdk'

import { MemoryView } from './memory'

export const MEMORY_PATH = '/ve-toi'
export const memoryRoute: RouteContribution = { path: MEMORY_PATH }
export const memoryNav: SidebarNavContribution = { codicon: 'account', label: 'Siêu trợ lý của tôi', path: MEMORY_PATH }

export const memoryPlugin: HermesPlugin = {
  id: 'super-agent-memory',
  name: 'Super Agent Memory',
  defaultEnabled: true,
  register(ctx) {
    ctx.registerMany([
      { id: 'page', area: ROUTES_AREA, data: memoryRoute, render: () => <MemoryView /> },
      { id: 'nav', area: SIDEBAR_NAV_AREA, order: 46, data: memoryNav }
    ])
  }
}

export default memoryPlugin
