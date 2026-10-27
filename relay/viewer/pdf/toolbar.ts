/** The viewer's controls: zoom out and in, fit to width, the page number and the page count. */
export type Toolbar = {
  setCount(count: number): void
  setPage(page: number): void
  setZoom(scale: number): void
  onZoom(handler: (direction: 'in' | 'out') => void): void
  onFit(handler: () => void): void
  onPage(handler: (page: number) => void): void
}

function button(label: string, text: string): HTMLButtonElement {
  const b = document.createElement('button')
  b.type = 'button'
  b.textContent = text
  b.setAttribute('aria-label', label)
  b.title = label
  return b
}

export function buildToolbar(parent: HTMLElement): Toolbar {
  const bar = document.createElement('div')
  bar.className = 'toolbar'
  bar.setAttribute('role', 'toolbar')
  bar.setAttribute('aria-label', 'PDF controls')

  const page = document.createElement('input')
  page.type = 'number'
  page.min = '1'
  page.value = '1'
  page.setAttribute('aria-label', 'Page number')
  const count = document.createElement('span')
  count.className = 'count'
  const out = button('Zoom out', '−')
  const zoom = document.createElement('span')
  zoom.className = 'zoom'
  const into = button('Zoom in', '+')
  const fit = button('Fit to width', 'Fit width')

  const pageGroup = document.createElement('span')
  pageGroup.className = 'group'
  pageGroup.append(page, count)
  const zoomGroup = document.createElement('span')
  zoomGroup.className = 'group'
  zoomGroup.append(out, zoom, into, fit)
  bar.append(pageGroup, zoomGroup)
  parent.append(bar)

  let pages = 1
  return {
    setCount(n) {
      pages = n
      page.max = String(n)
      count.textContent = `of ${n.toLocaleString('en-GB')}`
    },
    setPage(n) {
      if (document.activeElement !== page) page.value = String(n)
    },
    setZoom(scale) { zoom.textContent = `${Math.round(scale * 100)}%` },
    onZoom(handler) {
      out.addEventListener('click', () => handler('out'))
      into.addEventListener('click', () => handler('in'))
    },
    onFit(handler) { fit.addEventListener('click', handler) },
    onPage(handler) {
      page.addEventListener('change', () => {
        const n = Math.min(pages, Math.max(1, Math.round(Number(page.value)) || 1))
        page.value = String(n)
        handler(n)
      })
    },
  }
}
