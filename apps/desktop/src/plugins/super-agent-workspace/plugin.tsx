import { type HermesPlugin, type RouteContribution, ROUTES_AREA, SIDEBAR_NAV_AREA, type SidebarNavContribution } from '@hermes/plugin-sdk'

import { WorkspaceView } from './workspace'

export const WORKSPACE_PATH = '/kho'
export const workspaceRoute: RouteContribution = { path: WORKSPACE_PATH }
export const workspaceNav: SidebarNavContribution = { codicon: 'folder-library', label: 'Thư mục làm việc', path: WORKSPACE_PATH }

const workspacePlugin: HermesPlugin = {
  id: 'super-agent-workspace',
  name: 'Super Agent Workspace',
  defaultEnabled: true,
  register(ctx) {
    ctx.registerMany([
      { id: 'page', area: ROUTES_AREA, data: workspaceRoute, render: () => <WorkspaceView /> },
      { id: 'nav', area: SIDEBAR_NAV_AREA, order: 44, data: workspaceNav }
    ])
  }
}

export default workspacePlugin
