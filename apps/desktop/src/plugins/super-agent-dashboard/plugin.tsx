import { DASHBOARD_AREA, type HermesPlugin, SIDEBAR_NAV_AREA, type SidebarNavContribution } from '@hermes/plugin-sdk'

import { DashboardView } from './dashboard'

const DASHBOARD_PATH = '/'

const plugin: HermesPlugin = {
  id: 'super-agent-dashboard',
  name: 'Super Agent Dashboard',
  defaultEnabled: true,
  register(ctx) {
    ctx.registerMany([
      {
        area: DASHBOARD_AREA,
        id: 'super-agent-dashboard',
        order: 0,
        render: () => <DashboardView />
      },
      {
        area: SIDEBAR_NAV_AREA,
        id: 'dashboard-nav',
        order: 40,
        data: { codicon: 'home', label: 'Dashboard', path: DASHBOARD_PATH } satisfies SidebarNavContribution
      }
    ])
  }
}

export default plugin
