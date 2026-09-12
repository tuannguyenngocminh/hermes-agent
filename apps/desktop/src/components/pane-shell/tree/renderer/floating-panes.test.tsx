/**
 * Live-behavior test for FloatingPanes: mounts the REAL component into a real
 * DOM and drives real pointer/resize events. This is the closest thing to
 * "running it" without an Electron main process — it exercises the rendered
 * element's computed geometry, not the pure geometry module (that's
 * floating-rect.test.ts).
 */

import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { registry } from '@/contrib/registry'
import type { ContributionRenderContext } from '@/contrib/types'

import { FloatingPanes } from './floating-panes'
import { anchoredRect } from './floating-rect'

let root: null | Root = null
let container: HTMLDivElement | null = null
let disposers: (() => void)[] = []

function render(ui: ReactNode) {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)

  act(() => {
    root!.render(ui)
  })
}

const card = (id = 'hud') => document.querySelector<HTMLElement>(`[data-floating-pane="${id}"]`)

const grab = () => card()!.querySelector('header')!

/** jsdom has no real pointer events; PointerEvent falls back to MouseEvent. */
function pointer(target: Element, type: string, x: number, y: number) {
  const event = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y })

  Object.defineProperty(event, 'pointerId', { value: 1 })

  act(() => {
    target.dispatchEvent(event)
  })
}

function resizeWindow(width: number, height: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width, writable: true })
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: height, writable: true })

  act(() => {
    window.dispatchEvent(new Event('resize'))
  })
}

function registerHud(data: Record<string, unknown>) {
  disposers.push(
    registry.register({
      area: 'panes',
      data,
      id: 'hud',
      render: () => <p data-testid="hud-body">live</p>,
      title: 'HUD'
    })
  )
}

describe('FloatingPanes (live DOM)', () => {
  beforeEach(() => {
    window.localStorage.clear()
    resizeWindow(1440, 900)
    // setPointerCapture / releasePointerCapture don't exist in jsdom.
    Element.prototype.setPointerCapture = vi.fn()
    Element.prototype.releasePointerCapture = vi.fn()
  })

  afterEach(() => {
    if (root) {
      act(() => root!.unmount())
    }

    container?.remove()
    root = null
    container = null
    disposers.forEach(dispose => dispose())
    disposers = []
  })

  it('mounts a fixed card in the anchored corner with the pane body inside', () => {
    registerHud({ anchor: 'top-right', height: '132px', placement: 'floating', width: '224px' })
    render(<FloatingPanes />)

    const el = card()!

    expect(el).toBeTruthy()
    expect(el.className).toContain('fixed')
    // 1440 - 224 - 12 margin = 1204; titlebar 34 + 12 = 46.
    expect(el.style.left).toBe('1204px')
    expect(el.style.top).toBe('46px')
    expect(el.style.width).toBe('224px')
    expect(document.querySelector('[data-testid="hud-body"]')?.textContent).toBe('live')
  })

  it('renders nothing for a non-floating placement', () => {
    registerHud({ placement: 'right', width: '224px' })
    render(<FloatingPanes />)

    expect(card()).toBeNull()
  })

  it('moves with a real pointer drag on the header', () => {
    registerHud({ anchor: 'top-left', height: '132px', placement: 'floating', width: '224px' })
    render(<FloatingPanes />)

    expect(card()!.style.left).toBe('12px')

    pointer(grab(), 'pointerdown', 100, 100)
    pointer(grab(), 'pointermove', 260, 240)
    pointer(grab(), 'pointerup', 260, 240)

    expect(card()!.style.left).toBe('172px')
    expect(card()!.style.top).toBe('186px')
  })

  it('persists the dragged position across a remount', () => {
    registerHud({ anchor: 'top-left', height: '132px', placement: 'floating', width: '224px' })
    render(<FloatingPanes />)

    pointer(grab(), 'pointerdown', 100, 100)
    pointer(grab(), 'pointermove', 300, 300)
    pointer(grab(), 'pointerup', 300, 300)

    const moved = card()!.style.left

    act(() => root!.unmount())
    container!.remove()
    render(<FloatingPanes />)

    expect(card()!.style.left).toBe(moved)
  })

  it('rides the right edge when the window shrinks', () => {
    registerHud({ anchor: 'top-right', height: '132px', placement: 'floating', width: '224px' })
    render(<FloatingPanes />)

    expect(card()!.style.left).toBe('1204px')

    resizeWindow(1000, 700)

    // Tracks the edge: 1000 - 224 - 12 = 764.
    expect(card()!.style.left).toBe('764px')
  })

  it('never lets a drag push the card under the titlebar', () => {
    registerHud({ anchor: 'top-left', height: '132px', placement: 'floating', width: '224px' })
    render(<FloatingPanes />)

    pointer(grab(), 'pointerdown', 100, 100)
    pointer(grab(), 'pointermove', 100, -900)
    pointer(grab(), 'pointerup', 100, -900)

    expect(Number.parseFloat(card()!.style.top)).toBeGreaterThanOrEqual(34)
  })

  it('collapses to the header and drops the body, and does not drag from the button', () => {
    registerHud({ anchor: 'top-left', height: '132px', placement: 'floating', width: '224px' })
    render(<FloatingPanes />)

    const before = card()!.style.left
    const toggle = card()!.querySelector('button')!
    const chevron = () => toggle.querySelector('i')!

    // Expanded: down chevron (fold). Collapsed: up chevron (restore).
    expect(chevron().className).toContain('codicon-chevron-down')

    // The button is inside the drag handle — [data-floating-no-drag] must
    // stop it starting a drag.
    pointer(toggle, 'pointerdown', 100, 100)
    pointer(grab(), 'pointermove', 400, 400)
    pointer(grab(), 'pointerup', 400, 400)

    expect(card()!.style.left).toBe(before)

    act(() => {
      toggle.click()
    })

    expect(document.querySelector('[data-testid="hud-body"]')).toBeNull()
    expect(card()!.style.height).toBe('')
    expect(chevron().className).toContain('codicon-chevron-up')
  })

  it('renders one card per floating contribution', () => {
    registerHud({ anchor: 'top-left', placement: 'floating', width: '224px' })
    disposers.push(
      registry.register({
        area: 'panes',
        data: { anchor: 'bottom-right', placement: 'floating', width: '200px' },
        id: 'hud2',
        render: () => null,
        title: 'HUD 2'
      })
    )

    render(<FloatingPanes />)

    expect(document.querySelectorAll('[data-floating-pane]').length).toBe(2)
  })

  it('lets a custom-header pane own its chrome while retaining host controls', () => {
    disposers.push(
      registry.register({
        area: 'panes',
        data: { customHeader: true, placement: 'floating', width: '224px' },
        id: 'hud',
        render: (context?: ContributionRenderContext) => {
          const floating = context?.floating

          return (
            <div data-testid="custom-pane">
              <header data-testid="custom-header" {...floating?.dragHandleProps}>
              <span>Custom HUD</span>
              <button data-floating-no-drag onClick={floating?.onClose} type="button">
                Close
              </button>
              <button onClick={floating?.onToggleCollapse} type="button">
                Collapse
              </button>
              </header>
              {!floating?.collapsed && <p data-testid="custom-body">custom body</p>}
            </div>
          )
        },
        title: 'HUD'
      })
    )
    render(<FloatingPanes />)

    expect(card()!.className).not.toContain('rounded-xl')
    expect(card()!.querySelector('[data-testid="custom-header"]')).toBeTruthy()
    expect(card()!.querySelectorAll('header')).toHaveLength(1)
    expect(card()!.querySelector('[data-testid="custom-body"]')).toBeTruthy()

    act(() => {
      card()!.querySelector<HTMLButtonElement>('button:not([data-floating-no-drag])')!.click()
    })
    expect(card()!.style.width).toBe('')
    expect(card()!.style.height).toBe('')
    expect(card()!.querySelector('[data-testid="custom-body"]')).toBeNull()

    act(() => {
      card()!.querySelector<HTMLButtonElement>('[data-floating-no-drag]')!.click()
    })
    expect(card()).toBeNull()
  })

  it('moves a custom-header pane without toggling when its toggle button is dragged', () => {
    disposers.push(
      registry.register({
        area: 'panes',
        data: { anchor: 'top-left', customHeader: true, placement: 'floating', width: '224px' },
        id: 'hud2',
        render: (context?: ContributionRenderContext) => {
          const floating = context?.floating

          return (
            <div data-testid="custom-pane">
              <header data-testid="custom-header" {...floating?.dragHandleProps}>
                <button onClick={floating?.onToggleCollapse} type="button">
                  Toggle
                </button>
              </header>
              {!floating?.collapsed && <p data-testid="custom-body">custom body</p>}
            </div>
          )
        },
        title: 'HUD'
      })
    )
    render(<FloatingPanes />)

    const header = card('hud2')!.querySelector('[data-testid="custom-header"]')!

    pointer(header, 'pointerdown', 100, 100)
    pointer(header, 'pointermove', 260, 240)
    pointer(header, 'pointerup', 260, 240)
    act(() => header.querySelector('button')!.click())

    expect(card('hud2')!.style.left).toBe('172px')
    expect(card('hud2')!.style.top).toBe('186px')
    expect(card('hud2')!.querySelector('[data-testid="custom-body"]')).toBeTruthy()
  })

  it('toggles a custom-header pane after a click-sized pointer session', () => {
    disposers.push(
      registry.register({
        area: 'panes',
        data: { customHeader: true, placement: 'floating', width: '224px' },
        id: 'hud2',
        render: (context?: ContributionRenderContext) => {
          const floating = context?.floating

          return (
            <div data-testid="custom-pane">
              <header data-testid="custom-header" {...floating?.dragHandleProps}>
                <button onClick={floating?.onToggleCollapse} type="button">
                  Toggle
                </button>
              </header>
              {!floating?.collapsed && <p data-testid="custom-body">custom body</p>}
            </div>
          )
        },
        title: 'HUD'
      })
    )
    render(<FloatingPanes />)

    const header = card('hud2')!.querySelector('[data-testid="custom-header"]')!
    const toggle = header.querySelector('button')!

    pointer(header, 'pointerdown', 100, 100)
    pointer(header, 'pointerup', 102, 103)
    act(() => toggle.dispatchEvent(new MouseEvent('click', { bubbles: true })))

    expect(card('hud2')!.querySelector('[data-testid="custom-body"]')).toBeNull()
  })

  it('re-anchors a collapsed custom-header pane when it expands', () => {
    localStorage.setItem(
      'hermes.desktop.floatingPanes.v1',
      JSON.stringify({ hud2: { collapsed: true, x: 20, y: 50 } })
    )
    disposers.push(
      registry.register({
        area: 'panes',
        data: { anchor: 'bottom-right', customHeader: true, placement: 'floating', width: '224px' },
        id: 'hud2',
        render: (context?: ContributionRenderContext) => {
          const floating = context?.floating

          return (
            <div data-testid="custom-pane">
              <header data-testid="custom-header" {...floating?.dragHandleProps}>
                <button onClick={floating?.onToggleCollapse} type="button">
                  Toggle
                </button>
              </header>
              {!floating?.collapsed && <p data-testid="custom-body">custom body</p>}
            </div>
          )
        },
        title: 'HUD'
      })
    )
    render(<FloatingPanes />)

    const header = card('hud2')!.querySelector('[data-testid="custom-header"]')!
    const toggle = header.querySelector('button')!
    const expected = anchoredRect('bottom-right', { height: 180, width: 224 }, { height: 900, top: 34, width: 1440 })

    pointer(header, 'pointerdown', 100, 100)
    pointer(header, 'pointermove', 102, 102)
    pointer(header, 'pointerup', 102, 102)
    act(() => toggle.click())

    expect(card('hud2')!.style.left).toBe(`${expected.x}px`)
    expect(card('hud2')!.style.top).toBe(`${expected.y}px`)
    expect(card('hud2')!.querySelector('[data-testid="custom-body"]')).toBeTruthy()
  })
})
