/**
 * The PDF viewer page (spec part 2): pdf.js draws a file's pages onto canvases, reading it by range from the ticket in
 * the address's fragment (and then from each renewed ticket hq's page hands it), and reports to hq's page that framed it. Pages are drawn as they scroll into view and
 * dropped as they leave it. Nothing here builds HTML from text: every element is made and filled through the DOM.
 */
import { GlobalWorkerOptions, getDocument, type PDFDocumentProxy, type RenderTask } from 'pdfjs-dist'
import type { RendererReport } from '@agenthix/core'
import { readAddress } from './address'
import { RANGE_CHUNK_SIZE, VIEWER_ROOT, documentOptions, failureOfError } from './documentOptions'
import { fitWidthScale, nextZoom, pageAt } from './layout'
import { readHostMessage, viewerMessage } from './messages'
import { TicketSource, rangeTransport } from './ticketSource'
import { buildToolbar, type Toolbar } from './toolbar'

GlobalWorkerOptions.workerSrc = `${VIEWER_ROOT}/pdf.worker.mjs`

const GUTTER = 16
const GAP = 12
/** Past this a canvas costs more memory than it shows; the scale is lowered to stay under it. */
const MAX_CANVAS_PIXELS = 16 * 1024 * 1024

const reportTo = document.querySelector('meta[name="report-to-origin"]')?.getAttribute('content') ?? null

function send(body: { report?: RendererReport; pages?: number }): void {
  if (reportTo && window.parent !== window) window.parent.postMessage(viewerMessage(body), reportTo)
}

let failed = false
function fail(error: unknown): void {
  if (failed || (error as { name?: string } | null)?.name === 'RenderingCancelledException') return
  failed = true
  send({ report: { state: 'failed', reason: failureOfError(error) } })
}

type Slot = { box: HTMLDivElement; width: number; height: number; canvas: HTMLCanvasElement | null; task: RenderTask | null }

class Viewer {
  private scale = 1
  private fitting = true
  private readonly slots: Slot[] = []
  private readonly visible = new Set<number>()
  private readyReported = false
  private readonly observer: IntersectionObserver

  constructor(private readonly doc: PDFDocumentProxy, private readonly pages: HTMLElement, private readonly toolbar: Toolbar,
    first: { width: number; height: number }) {
    this.observer = new IntersectionObserver(entries => this.onSeen(entries), { root: pages, rootMargin: '100% 0px' })
    for (let i = 0; i < doc.numPages; i++) {
      const box = document.createElement('div')
      box.className = 'page'
      box.dataset.index = String(i)
      box.setAttribute('aria-label', `Page ${i + 1}`)
      pages.append(box)
      this.slots.push({ box, width: first.width, height: first.height, canvas: null, task: null })
      this.observer.observe(box)
    }
    toolbar.setCount(doc.numPages)
    toolbar.onZoom(direction => this.zoomTo(nextZoom(this.scale, direction), false))
    toolbar.onFit(() => this.zoomTo(this.fitScale(), true))
    toolbar.onPage(page => this.slots[page - 1]?.box.scrollIntoView())
    pages.addEventListener('scroll', () => this.toolbar.setPage(this.currentPage()), { passive: true })
    new ResizeObserver(() => { if (this.fitting) this.zoomTo(this.fitScale(), true) }).observe(pages)
    this.zoomTo(this.fitScale(), true)
  }

  private fitScale(): number {
    return fitWidthScale(this.slots[0].width, this.pages.clientWidth, GUTTER)
  }

  private currentPage(): number {
    return pageAt(this.slots.map(s => s.box.offsetTop - this.pages.offsetTop), this.pages.scrollTop)
  }

  private zoomTo(scale: number, fitting: boolean): void {
    this.fitting = fitting
    if (Math.abs(scale - this.scale) < 0.001 && this.slots[0].box.style.width) return
    const page = this.currentPage()
    this.scale = scale
    this.toolbar.setZoom(scale)
    for (const slot of this.slots) {
      this.drop(slot)
      this.size(slot)
    }
    this.slots[page - 1]?.box.scrollIntoView()
    for (const i of this.visible) void this.draw(i)
  }

  private size(slot: Slot): void {
    slot.box.style.width = `${Math.floor(slot.width * this.scale)}px`
    slot.box.style.height = `${Math.floor(slot.height * this.scale)}px`
    slot.box.style.marginBottom = `${GAP}px`
  }

  private onSeen(entries: IntersectionObserverEntry[]): void {
    for (const entry of entries) {
      const i = Number((entry.target as HTMLElement).dataset.index)
      if (entry.isIntersecting) {
        this.visible.add(i)
        void this.draw(i)
      } else {
        this.visible.delete(i)
        this.drop(this.slots[i])
      }
    }
  }

  private drop(slot: Slot): void {
    slot.task?.cancel()
    slot.task = null
    if (slot.canvas) {
      slot.canvas.width = 0
      slot.canvas.height = 0
      slot.canvas.remove()
      slot.canvas = null
    }
  }

  private async draw(i: number): Promise<void> {
    const slot = this.slots[i]
    if (slot.canvas || failed) return
    const canvas = document.createElement('canvas')
    slot.canvas = canvas
    try {
      const page = await this.doc.getPage(i + 1)
      const base = page.getViewport({ scale: 1 })
      if (base.width !== slot.width || base.height !== slot.height) {
        slot.width = base.width
        slot.height = base.height
        this.size(slot)
      }
      if (slot.canvas !== canvas) return
      const wanted = this.scale * (window.devicePixelRatio || 1)
      const fits = Math.sqrt(MAX_CANVAS_PIXELS / (base.width * base.height))
      const viewport = page.getViewport({ scale: Math.min(wanted, fits) })
      canvas.width = Math.floor(viewport.width)
      canvas.height = Math.floor(viewport.height)
      canvas.style.width = '100%'
      canvas.style.height = '100%'
      slot.box.append(canvas)
      slot.task = page.render({ canvas, viewport })
      await slot.task.promise
      slot.task = null
      if (!this.readyReported) {
        this.readyReported = true
        send({ report: { state: 'ready' } })
      }
    } catch (error) {
      if (slot.canvas === canvas) this.drop(slot)
      fail(error)
    }
  }
}

async function start(): Promise<void> {
  const address = readAddress(location.hash)
  if (!address) {
    fail(new Error('no ticket'))
    return
  }
  const source = new TicketSource(address.ticketPath, location.origin)
  // A renewed ticket, only from the page that framed this one and only from hq's origin.
  window.addEventListener('message', event => {
    if (!reportTo || event.source !== window.parent || event.origin !== reportTo) return
    const path = readHostMessage(event.data)
    if (path) source.renew(path)
  })
  document.documentElement.dataset.theme = address.theme
  const toolbar = buildToolbar(document.body)
  const pages = document.createElement('main')
  pages.className = 'pages'
  document.body.append(pages)
  try {
    const opened = await source.open(RANGE_CHUNK_SIZE)
    const doc = await getDocument({ ...documentOptions(location.origin), range: rangeTransport(source, opened, fail) }).promise
    send({ pages: doc.numPages })
    const first = (await doc.getPage(1)).getViewport({ scale: 1 })
    new Viewer(doc, pages, toolbar, { width: first.width, height: first.height })
  } catch (error) {
    fail(error)
  }
}

void start()
