import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { HowThisWorks } from '../components'
import { parsePage, slugOf, plainText } from '../pages/help/markdown'
import { HelpPage } from '../pages/help/HelpPage'
import { Markdown } from '../pages/help/renderMarkdown'
import { topicOf, topics } from '../pages/help/topics'
import { TOPIC_IDS } from '../pages/help/topicIds'

afterEach(() => { cleanup(); window.history.replaceState(null, '', '/') })

function open(to: string) { window.history.replaceState(null, '', to) }
function page(md: string) { return parsePage(`---\ntitle: T\ndescription: D\n---\n${md}`).blocks }

describe('Help lists the guide @SC-919', () => {
  it('a card for each topic, each one link as a whole, to its page', () => {
    open('/help')
    render(<HelpPage />)
    const list = screen.getByRole('list', { name: 'Help topics' })
    const cards = within(list).getAllByRole('listitem')
    expect(cards).toHaveLength(TOPIC_IDS.length)
    for (const [k, id] of TOPIC_IDS.entries()) {
      const links = within(cards[k]).getAllByRole('link')
      expect(links).toHaveLength(1)
      expect(links[0].getAttribute('href')).toBe(`/help?topic=${id}`)
      expect(within(cards[k]).getByRole('heading', { level: 3 }).textContent).toBe(topicOf(id).title)
    }
  })

  it('every topic has a title and a description in its front matter', () => {
    for (const t of topics()) {
      expect(t.title, t.id).not.toBe('')
      expect(t.description, t.id).not.toBe('')
    }
  })
})

describe('every topic renders @SC-919', () => {
  it.each(TOPIC_IDS)('%s opens as a page with its title and its headings', id => {
    open(`/help?topic=${id}`)
    const { container } = render(<HelpPage />)
    const topic = topicOf(id)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(topic.title)
    for (const b of topic.blocks) {
      if (b.t === 'heading' && b.level === 2) expect(container.querySelector<HTMLElement>(`[id="${b.id}"]`)?.textContent).toBe(plainText(b.children))
    }
    expect(container.querySelector('script, style, iframe, img')).toBeNull()
  })

  it('shows the commands of the guide as code, and its tables as tables', () => {
    open('/help?topic=commands')
    render(<HelpPage />)
    expect(screen.getAllByRole('table').length).toBeGreaterThan(2)
    expect(screen.getAllByText('hq fleet-admin [--remove] <user>').length).toBe(1)
  })

  it('the HQ topic draws its diagram as rows of what HQ has', () => {
    open('/help?topic=hq-sites-and-fleet-admins')
    render(<HelpPage />)
    const figure = screen.getByLabelText('Diagram')
    expect(within(figure).getByText('HQ')).toBeTruthy()
    expect(within(figure).getByText('office-server')).toBeTruthy()
  })

  it('the recovery topic gives the fleet admin command', () => {
    open('/help?topic=recover-admin')
    render(<HelpPage />)
    expect(screen.getByText('agenthix hq fleet-admin <username>')).toBeTruthy()
  })
})

describe('links between guide pages work inside Help @SC-919', () => {
  it('a link to a topic opens it in Help, and the way back lists them', () => {
    open('/help?topic=hq-sites-and-fleet-admins')
    render(<HelpPage />)
    const link = screen.getByRole('link', { name: 'When nobody can sign in' })
    expect(link.getAttribute('href')).toBe('/help?topic=recover-admin')
    fireEvent.click(link)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('When nobody can sign in')
    fireEvent.click(screen.getByRole('link', { name: /All help topics/ }))
    expect(screen.getByRole('list', { name: 'Help topics' })).toBeTruthy()
  })

  it('a link to a heading of another page carries the section', () => {
    open('/help?topic=add-a-site')
    render(<HelpPage />)
    const hrefs = screen.getAllByRole('link', { name: 'Address and front door' }).map(l => l.getAttribute('href'))
    expect(hrefs).toContain('/help?topic=domain-and-https&section=what-a-servers-address-needs')
  })

  it('every link in every topic goes to a topic and a heading that exist, or off to an https address', () => {
    const ids = new Set<string>(TOPIC_IDS)
    for (const t of topics()) {
      const text = JSON.stringify(t.blocks)
      for (const m of text.matchAll(/"t":"link","href":"([^"]*)"/g)) {
        const href = m[1]
        if (href.startsWith('https://')) continue
        const [file, anchor] = href.split('#')
        const target = file ? file.replace(/\.md$/, '') : t.id
        if (!ids.has(target)) continue // a page of the guide that Help does not carry shows as plain text
        if (anchor) {
          const headings = topicOf(target as (typeof TOPIC_IDS)[number]).blocks.filter(b => b.t === 'heading').map(b => (b.t === 'heading' ? b.id : ''))
          expect(headings, `${t.id} -> ${href}`).toContain(anchor)
        }
      }
    }
  })

  it('a link to a guide page Help does not carry shows only its words', () => {
    render(<Markdown current="commands" blocks={page('See [Install Agenthix](../getting-started/install.md) first.')} />)
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.getByText(/See Install Agenthix first/)).toBeTruthy()
  })

  it('an https link opens in a new tab without the opener; no other kind of address is a link', () => {
    render(<Markdown current="commands" blocks={page('[a](https://example.com/x) [b](javascript:alert(1)) [c](http://example.com) [d](data:text/html,x)')} />)
    const links = screen.getAllByRole('link')
    expect(links).toHaveLength(1)
    expect(links[0].getAttribute('target')).toBe('_blank')
    expect(links[0].getAttribute('rel')).toBe('noopener noreferrer')
  })
})

describe('nothing raw passes through @SC-919', () => {
  it('HTML in a page is shown as the words it is', () => {
    const { container } = render(<Markdown current="commands" blocks={page('Hello <script>window.x=1</script> <img src=x onerror="y()"> <b>bold</b>\n\n<iframe src="https://e.example"></iframe>\n\n| a | b |\n|---|---|\n| <u>x</u> | `<s>` |')} />)
    expect(container.querySelector('script, img, iframe, b, u, s')).toBeNull()
    expect(container.textContent).toContain('<script>window.x=1</script>')
    expect(container.textContent).toContain('<iframe src="https://e.example"></iframe>')
    expect(container.textContent).toContain('<u>x</u>')
  })

  it('an image is left out: the guide fetches its pictures at a release, and Help makes no request', () => {
    const { container } = render(<Markdown current="commands" blocks={page('![Alt](screenshot:home)\n\n![Pic](https://e.example/a.png)\n\ntext ![inline](https://e.example/b.png)')} />)
    expect(container.querySelector('img')).toBeNull()
  })

  it('the source of Help uses no raw-HTML escape hatch', async () => {
    const { readFileSync, readdirSync } = await import('node:fs')
    const dir = `${process.cwd()}/src/pages/help`
    for (const f of readdirSync(dir)) {
      if (!/\.tsx?$/.test(f)) continue
      expect(readFileSync(`${dir}/${f}`, 'utf8'), f).not.toMatch(/dangerouslySetInnerHTML|innerHTML/)
    }
  })
})

describe('the reader @SC-919', () => {
  it('reads nested lists, steps with code, and tables with a bar inside code', () => {
    const blocks = page('1. First\n\n   ```sh\n   run one\n   ```\n\n2. Second\n   - nested\n\n| Command | Does |\n|---|---|\n| `front-door [on \\| off]` | x |\n')
    const { container } = render(<Markdown current="commands" blocks={blocks} />)
    const steps = container.querySelectorAll('ol > li')
    expect(steps).toHaveLength(2)
    expect(steps[0].querySelector('pre')?.textContent).toBe('run one')
    expect(steps[1].querySelector('ul > li')?.textContent).toBe('nested')
    expect(container.querySelector('td code')?.textContent).toBe('front-door [on | off]')
  })

  it('makes heading ids in GitHub’s form', () => {
    expect(slugOf("What a server's address needs")).toBe('what-a-servers-address-needs')
    expect(slugOf('Change HQ’s address')).toBe('change-hqs-address')
  })
})

describe('HowThisWorks @SC-919', () => {
  it('links to a topic, and to a section of it', () => {
    render(<><HowThisWorks topic="backups-and-restoring" /><HowThisWorks topic="domain-and-https" section="change-hqs-address" /></>)
    const [a, b] = screen.getAllByRole('link', { name: /How this works/ })
    expect(a.getAttribute('href')).toBe('/help?topic=backups-and-restoring')
    expect(b.getAttribute('href')).toBe('/help?topic=domain-and-https&section=change-hqs-address')
  })
})
