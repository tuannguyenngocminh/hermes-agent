import { afterEach, describe, expect, it } from 'vitest'

import { DASHBOARD_AREA } from './routes'
import { registry } from '@/contrib/registry'

const ids = ['dashboard-area-test-low', 'dashboard-area-test-high']

afterEach(() => {
  registry.registerMany(ids.map(id => ({ area: DASHBOARD_AREA, id, enabled: false })))()
})

describe('DASHBOARD_AREA', () => {
  it('uses the existing registry order when selecting the first contribution', () => {
    const dispose = registry.registerMany([
      { area: DASHBOARD_AREA, id: ids[1], order: 20, render: () => null },
      { area: DASHBOARD_AREA, id: ids[0], order: 10, render: () => null }
    ])

    expect(registry.getArea(DASHBOARD_AREA).map(contribution => contribution.id)).toEqual(ids)
    dispose()
  })
})
