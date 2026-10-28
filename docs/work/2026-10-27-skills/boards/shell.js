// Shared frame for every Skills board: the boards on the left, this page's sections on the right, the theme switch, diagrams.
// Boards not drawn yet are listed without a link, so the whole map shows from the start.
import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11.4.1/dist/mermaid.esm.min.mjs'

const ROOT = [{ f: 'decisions.html', k: '?', t: 'Questions and decisions' }]
const GROUPS = [
  { name: 'Architecture', items: [
    { f: 'today.html', k: '1', t: 'Today: where skills live, how they reach a run' },
    { f: 'locations.html', k: '2', t: 'Where a skill can live: L1a–L6' },
    { f: 'shipped.html', k: '2b', t: 'What Agenthix ships: every skill, sorted' },
    { f: 'identity.html', k: '2c', t: 'Identity and dependencies' },
    { f: 'trust.html', k: '2d', t: 'Install from anywhere: signatures and trust' },
    { f: 'install.html', k: '3', t: 'Installing: how a skill gets into each level' },
    { f: 'model.html', k: '4', t: 'The model: everything decided, in one picture' },
    { f: 'data.html', k: '5', t: 'Data: skills, versions, grants, proposals' },
    { f: 'delivery.html', k: '6', t: 'Delivery: hq to site to runtime, per turn' },
    { f: 'invoke.html', k: '7', t: 'In a conversation: pick, invoke, record' },
    { f: 'proposals.html', k: '8', t: 'Proposals and the files gate' },
    { f: 'roles.html', k: '9', t: 'Who does what: roles, maintainers, history' },
    { f: 'cost.html', k: '10', t: 'Cost: what the model reads per request' },
  ]},
  { name: 'UI · The Library', items: [
    { f: 'ui-today.html', k: 'U1', t: 'Skills in hq today, numbered' },
    { f: 'ui-library.html', k: 'U2', t: 'The Library in the sidebar: every asset' },
    { f: 'ui-asset.html', k: 'U3', t: 'An asset: versions, history, who edits, credit' },
    { f: 'ui-edit.html', k: 'U3b', t: 'Making and editing a skill: files, view, edit, changes' },
    { f: 'ui-add.html', k: 'U4', t: 'Add from anywhere: the install check' },
    { f: 'ui-update.html', k: 'U5', t: 'Update, roll back, edit makes your copy' },
  ]},
  { name: 'UI · Places and agents', items: [
    { f: 'ui-place.html', k: 'P1', t: 'A place\'s Skills page: switches' },
    { f: 'ui-yours.html', k: 'P2', t: 'Your space: your skills that follow you' },
    { f: 'ui-agent.html', k: 'A1', t: 'An agent\'s page: everything it will see' },
  ]},
  { name: 'UI · Conversations', items: [
    { f: 'ui-pick.html', k: 'C1', t: 'The / picker in the message box' },
    { f: 'ui-used.html', k: 'C2', t: 'A skill used: the step and the panel' },
    { f: 'ui-propose.html', k: 'C3', t: '"Make this a skill": proposing' },
  ]},
  { name: 'UI · Review and settings', items: [
    { f: 'ui-review.html', k: 'R1', t: 'Proposals waiting for review' },
    { f: 'ui-settings.html', k: 'R2', t: 'The organisation\'s settings' },
  ]},
]

// Open questions, each tied to the boards it concerns; decisions.html lists them in full.
export const OPEN = [
]

const here = () => document.body.dataset.board || location.pathname.split('/').pop()
const href = f => '/files/' + f

function buildBoards() {
  const nav = document.createElement('nav'); nav.className = 'boards'
  const cur = here()
  let html = '<div class="title">Skills</div><div class="root">'
  for (const r of ROOT) html += `<a class="${r.f === cur ? 'on' : ''}" href="${href(r.f)}"><span class="k">${r.k}</span>${r.t}</a>`
  html += '</div>'
  for (const g of GROUPS) {
    const open = g.items.some(i => i.f === cur) || !GROUPS.some(x => x.items.some(i => i.f === cur)) || g.name === 'Architecture' || cur === 'decisions.html'
    const drawn = g.items.filter(i => !i.todo).length
    html += `<details ${open ? 'open' : ''}><summary>${g.name} · ${drawn}/${g.items.length}</summary>`
    for (const i of g.items) html += i.todo
      ? `<span class="todo" title="Not drawn yet"><span class="k">${i.k}</span>${i.t}</span>`
      : `<a class="${i.f === cur ? 'on' : ''}" href="${href(i.f)}"><span class="k">${i.k}</span>${i.t}</a>`
    html += '</details>'
  }
  if (GROUPS.some(g => g.items.some(i => i.todo))) html += '<div class="nav-pending">Grey: not drawn yet</div>'
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

// hq's main navigation, as AppSidebar.tsx builds it. data-on: the entry shown.
function appPanel(el) {
  const on = el.dataset.on || ''
  const row = (id, label) => `<a class="${id === on ? 'on' : ''}">${label}</a>`
  el.classList.add('mnav')
  el.innerHTML = `<div class="logo"><i></i>Fernhill</div>${row('home', 'Home')}${row('chat', 'Chat')}${row('space', 'Your space')}${row('projects', 'Projects')}${row('tasks', 'Tasks')}${row('agents', 'Agents')}<a class="${on === 'library' ? 'on' : ''} new">Library<span class="neu">new</span></a>`
}

let n = 0
async function draw(t) {
  if (!document.querySelector('.mmd')) return
  mermaid.initialize({ startOnLoad: false, theme: t === 'light' ? 'default' : 'dark', flowchart: { curve: 'basis', htmlLabels: true }, securityLevel: 'strict' })
  for (const el of document.querySelectorAll('.mmd')) {
    try { const { svg } = await mermaid.render('m' + (n++), (window.SRC || {})[el.dataset.src]); el.innerHTML = svg
      const s = el.querySelector('svg'); if (s) { s.style.maxWidth = '100%'; s.style.height = 'auto' } } catch (e) { el.textContent = 'Diagram error: ' + e.message }
  }
}
function theme(t) {
  document.documentElement.dataset.theme = t
  document.querySelectorAll('.toggle button').forEach(b => b.classList.toggle('on', b.dataset.t === t))
  try { localStorage.setItem('sk-theme', t) } catch (e) {}
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
document.querySelectorAll('.anav').forEach(appPanel)
const boards = buildBoards(); layout.prepend(boards); layout.append(buildToc(main))
// The whole left panel folds away to a thin strip, remembered across boards.
const fold = document.createElement('button'); fold.className = 'fold'; fold.title = 'Hide or show the boards'
const setFold = f => { layout.classList.toggle('folded', f); fold.textContent = f ? '»' : '«'; try { localStorage.setItem('sk-fold', f ? '1' : '') } catch (e) {} }
fold.onclick = () => setFold(!layout.classList.contains('folded'))
layout.prepend(fold)
let f0 = false; try { f0 = !!localStorage.getItem('sk-fold') } catch (e) {}
setFold(f0)
let t = 'light'; try { t = localStorage.getItem('sk-theme') || 'light' } catch (e) {}
theme(t)
if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView()
