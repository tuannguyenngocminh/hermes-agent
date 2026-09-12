import { type HermesPlugin, PANES_AREA } from '@hermes/plugin-sdk'
import { computed } from 'nanostores'

// eslint-disable-next-line no-restricted-imports -- bundled plugin shares the host-owned persisted pane mode store.
import { $assistantPaneMode, setAssistantPaneMode } from '@/store/assistant-pane'
import { $activeGatewayProfile } from '@/store/profile'
import { $gatewayState } from '@/store/session'
import { isSecondaryWindow } from '@/store/windows'

import { AssistantPane } from './assistant-pane'
import { ensureDailyReviewJob } from './ensure-daily-review-job'

const plugin: HermesPlugin = {
  id: 'super-agent-assistant-pane',
  name: 'Super Agent Assistant Pane',
  defaultEnabled: true,
  register(ctx) {
    const ensureForOpenGateway = () => {
      if (isSecondaryWindow() || $gatewayState.get() !== 'open') {
        return
      }

      void ensureDailyReviewJob($activeGatewayProfile.get())
    }

    const stopGatewaySubscription = $gatewayState.listen(ensureForOpenGateway)
    const stopProfileSubscription = $activeGatewayProfile.listen(ensureForOpenGateway)

    ctx.onDispose(stopGatewaySubscription)
    ctx.onDispose(stopProfileSubscription)
    ensureForOpenGateway()

    const $floatingOpen = computed($assistantPaneMode, mode => mode === 'floating')
    const $dockedOpen = computed($assistantPaneMode, mode => mode === 'docked')

    ctx.registerMany([
      {
        id: 'assistant-pane-floating',
        area: PANES_AREA,
        title: 'Siêu trợ lý',
        data: {
          placement: 'floating',
          anchor: 'bottom-right',
          customHeader: true,
          width: '380px',
          height: '520px'
        },
        render: context => <AssistantPane renderContext={context} />
      },
      {
        id: 'assistant-pane-docked',
        area: PANES_AREA,
        title: 'Siêu trợ lý',
        data: {
          placement: 'right',
          dock: { pane: 'review', pos: 'left' },
          customHeader: true,
          width: 'clamp(18rem, 30vw, 38rem)',
          minWidth: '18rem',
          maxWidth: '38rem',
          height: '100%'
        },
        render: context => <AssistantPane renderContext={context} />
      }
    ])

    ctx.bindVisibility(
      'assistant-pane-floating',
      $floatingOpen,
      () => setAssistantPaneMode('docked'),
      () => setAssistantPaneMode('floating')
    )
    ctx.bindVisibility(
      'assistant-pane-docked',
      $dockedOpen,
      () => setAssistantPaneMode('floating'),
      () => setAssistantPaneMode('docked')
    )
  }
}

export default plugin
