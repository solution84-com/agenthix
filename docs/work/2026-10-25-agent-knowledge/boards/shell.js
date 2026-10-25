// Shared frame for every board: the boards on the left, this page's sections on the right, the theme switch, diagrams.
import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11.4.1/dist/mermaid.esm.min.mjs'

const ROOT = [{ f: 'decisions.html', k: '?', t: 'Questions and decisions' }]
const GROUPS = [
  { name: 'Architecture', items: [
    { f: 'today.html', k: '1', t: 'Today: how agents reach knowledge' },
    { f: 'overview.html', k: '2', t: 'The design at a glance' },
    { f: 'platform.html', k: '3', t: 'Platform knowledge: from the guide to the agent' },
    { f: 'convention.html', k: '4', t: 'Knowledge: a place\'s own guide' },
    { f: 'tools.html', k: '5', t: 'How agents find, read and change knowledge' },
    { f: 'boundaries.html', k: '6', t: 'Who reaches what' },
    { f: 'limits.html', k: '7', t: 'What it stops, what it does not, what waits' },
  ]},
  { name: 'UI · The Knowledge tool', items: [
    { f: 'ui-today.html', k: 'U1', t: 'The Knowledge tool today, numbered' },
    { f: 'ui-list.html', k: 'U2', t: 'Browsing knowledge' },
    { f: 'ui-topic.html', k: 'U3', t: 'A page: reading and editing' },
    { f: 'ui-history.html', k: 'U4', t: 'History and recently deleted' },
    { f: 'ui-org.html', k: 'U5', t: 'Organisation knowledge' },
  ]},
  { name: 'UI · In a conversation', items: [
    { f: 'ui-correct.html', k: 'C1', t: 'Correcting a page by asking' },
    { f: 'ui-ask.html', k: 'C2', t: 'Asking about Agenthix itself' },
    { f: 'ui-places.html', k: 'C3', t: 'Places in a conversation' },
  ]},
]

export const OPEN = [
]

const here = () => document.body.dataset.board || location.pathname.split('/').pop()
const href = f => '/files/' + f

function buildBoards() {
  const nav = document.createElement('nav'); nav.className = 'boards'
  const cur = here()
  let html = '<div class="title">Agent Knowledge</div><div class="root">'
  for (const r of ROOT) html += `<a class="${r.f === cur ? 'on' : ''}" href="${href(r.f)}"><span class="k">${r.k}</span>${r.t}</a>`
  html += '</div>'
  for (const g of GROUPS) {
    const open = g.items.some(i => i.f === cur) || !GROUPS.some(x => x.items.some(i => i.f === cur))
    html += `<details ${open ? 'open' : ''}><summary>${g.name} · ${g.items.length}</summary>`
    for (const i of g.items) html += `<a class="${i.f === cur ? 'on' : ''}" href="${href(i.f)}"><span class="k">${i.k}</span>${i.t}</a>`
    html += '</details>'
  }
  nav.innerHTML = html
  return nav
}

function buildToc(main) {
  const nav = document.createElement('nav'); nav.className = 'toc'
  const heads = [...main.querySelectorAll('h2, h3')]
  heads.forEach((h, n) => { if (!h.id) h.id = 's' + n })
  let html = '<div class="h">On this page</div>'
  for (const h of heads) html += `<a class="${h.tagName === 'H3' ? 'l3' : ''}" href="#${h.id}">${h.textContent}</a>`
  const cur = here()
  const mine = OPEN.filter(q => q.boards.includes(cur))
  if (mine.length && cur !== 'decisions.html') {
    html += '<div class="items"><div class="h">This board\'s open questions</div>'
    for (const m of mine) html += `<a href="${href('decisions.html')}#${m.id}"><b>${m.id.toUpperCase()}</b>${m.q}</a>`
    html += '</div>'
  }
  nav.innerHTML = html
  const links = [...nav.querySelectorAll('a[href^="#"]')]
  const spy = () => {
    let at = heads[0]
    for (const h of heads) if (h.getBoundingClientRect().top < 120) at = h
    links.forEach(a => a.classList.toggle('on', at && a.getAttribute('href') === '#' + at.id))
  }
  addEventListener('scroll', spy, { passive: true }); spy()
  return nav
}

// A place's left panel in hq: a project's, as useProjectPlace.tsx builds it, or Your space's (data-space), as
// chatPlace.tsx does. data-on: the section shown.
function placePanel(el) {
  const on = el.dataset.on || ''
  const row = (id, label, count) => `<a class="${id === on ? 'on' : ''}">${label}${count ? `<span class="cnt">${count}</span>` : ''}</a>`
  el.classList.add('mnav')
  el.innerHTML = el.dataset.space !== undefined
    ? `<div class="logo"><i></i>Your space</div>${row('chat', 'Chat')}${row('tasks', 'My tasks', '4')}
  <div class="sec">Files</div>${row('files', 'Files')}${row('artefacts', 'Artefacts')}${row('knowledge', 'Knowledge', el.dataset.count)}${row('workspaces', 'Workspaces')}`
    : `<div class="logo"><i></i>${el.dataset.name || 'Website rebuild'}</div>${row('overview', 'Overview')}
  <div class="sec">Work</div>${row('tasks', 'Tasks', '12')}${row('boards', 'Boards', '2')}${row('timeline', 'Timeline')}
  <div class="sec">Agents at work</div>${row('runs', 'Runs', '1')}${row('automation', 'Automation', 'On')}${row('memory', 'Memory')}
  <div class="sec">Files</div>${row('files', 'Files')}${row('artefacts', 'Artefacts')}${row('knowledge', 'Knowledge', el.dataset.count)}${row('workspaces', 'Workspaces', '1')}
  <div class="sec">&nbsp;</div>${row('members', 'Members', '3')}${row('settings', 'Settings')}`
}

let n = 0
async function draw(t) {
  mermaid.initialize({ startOnLoad: false, theme: t === 'light' ? 'default' : 'dark', flowchart: { curve: 'basis', htmlLabels: true }, securityLevel: 'strict' })
  for (const el of document.querySelectorAll('.mmd')) {
    try { const { svg } = await mermaid.render('m' + (n++), (window.SRC || {})[el.dataset.src]); el.innerHTML = svg
      const s = el.querySelector('svg'); if (s) { s.style.maxWidth = '100%'; s.style.height = 'auto' } } catch (e) { el.textContent = 'Diagram error: ' + e.message }
  }
}
function theme(t) {
  document.documentElement.dataset.theme = t
  document.querySelectorAll('.toggle button').forEach(b => b.classList.toggle('on', b.dataset.t === t))
  try { localStorage.setItem('ak-theme', t) } catch (e) {}
  draw(t)
}

const main = document.querySelector('main')
const layout = document.createElement('div'); layout.className = 'layout'
main.replaceWith(layout)
const top = main.querySelector('.top')
if (top) { const tg = document.createElement('div'); tg.className = 'toggle'
  tg.innerHTML = '<button data-t="light">Light</button><button data-t="dark">Dark</button>'
  tg.querySelectorAll('button').forEach(b => b.onclick = () => theme(b.dataset.t)); top.appendChild(tg) }
layout.append(main)
document.querySelectorAll('.pnav').forEach(placePanel)
layout.prepend(buildBoards()); layout.append(buildToc(main))
let t = 'light'; try { t = localStorage.getItem('ak-theme') || 'light' } catch (e) {}
theme(t)
if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView()
