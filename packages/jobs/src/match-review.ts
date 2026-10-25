import type { EvalSet } from './match-eval.ts'

export interface LabelGroup {
  id: string
  title: string
  reason?: string
  confidence?: 'high' | 'medium' | 'low'
  articleIds: string[]
}

export interface Labels {
  set: string
  guide: string
  groups: LabelGroup[]
}

/**
 * A self-contained review page: groups as cards, articles movable between them with a select
 * (keyboard-friendly), groups renamable and mergeable. Progress is kept in localStorage;
 * "Export" downloads the labels JSON to commit. No server, no network.
 */
export function reviewHtml(set: EvalSet, labels: Labels): string {
  // </script> inside the data would end the script tag early.
  const data = JSON.stringify({ set, labels }).replaceAll('<', '\\u003c')
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Review ${set.name} · Domino match labels</title>
<style>
  :root { color-scheme: light; --bg:#f6f5f4; --surface:#fff; --text:#2e3436; --b:#d0cfcc; --dim:#5e5c64; --accent:#3584e4; --ok:#2ec27e; font: 15px/1.5 system-ui, sans-serif; }
  body { margin: 0; color:var(--text); background:var(--bg); }
  header { position: sticky; top: 0; z-index: 2; display: flex; gap: 10px; align-items: center; flex-wrap: wrap;
    padding: 12px 20px; background: var(--surface); border-bottom: 1px solid var(--b); }
  header h1 { font-size: 16px; margin: 0 8px 0 0; }
  main { max-width: 1320px; margin:0 auto; padding: 24px; display:grid; grid-template-columns: 260px minmax(0, 1fr); gap:20px; align-items:start; }
  #queue { position:sticky; top:82px; background:var(--surface); border:1px solid var(--b); border-radius:10px; padding:12px; max-height:calc(100vh - 110px); overflow:auto; }
  #queue h2 { font-size:13px; margin:0 0 8px; } .queue-item { width:100%; text-align:left; border:0; border-left:3px solid transparent; background:transparent; padding:8px; border-radius:5px; color:var(--text); cursor:pointer; } .queue-item:hover { background:#f2f2f2; } .queue-item.active { background:#e7f0fd; border-left-color:var(--accent); } .queue-item.done { color:var(--dim); } .queue-count { color:var(--dim); font-size:12px; }
  #groups { min-width:0; } .card { background:var(--surface); border: 1px solid var(--b); border-radius:10px; padding:18px 20px; box-shadow:0 1px 2px #0000000d; }
  .card.low { border-left: 4px solid #d33; } .card.medium { border-left: 4px solid #e90; }
  .card.done { opacity: .72; }
  .card h2 { font-size: 14px; margin: 0; display: flex; gap: 8px; align-items: center; }
  .card h2 input { flex: 1; font: inherit; font-weight: 600; border: 1px solid transparent; background: none; padding: 2px; }
  .card h2 input:focus { border-color: var(--b); }
  .reason { color: var(--dim); font-size: 12px; margin: 4px 0 8px; }
  .tools { display: flex; gap: 8px; flex-wrap: wrap; font-size: 13px; margin:12px 0; } button { min-height:32px; cursor:pointer; } button.primary { background:var(--accent); color:white; border-color:var(--accent); }
  ol { margin: 0; padding-left: 18px; } li { margin: 6px 0; }
  .t { font-weight: 600; } .m { color: var(--dim); font-size: 12px; }
  .d { color: var(--dim); font-size: 12px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  li:focus-within .d, li:hover .d { -webkit-line-clamp: unset; }
  select, button, input[type=search] { font: inherit; font-size: 12px; }
  .hidden { display: none; }
  .grip { cursor: grab; color: var(--dim); padding: 0 2px; user-select: none; }
  li[draggable] { cursor: grab; }
  .card.over { outline: 3px dashed Highlight; outline-offset: 2px; }
  .card.dragging, li.dragging { opacity: .4; }
  #undo:disabled { opacity: .4; } .hidden { display:none; } @media (max-width:800px) { main { grid-template-columns:1fr; padding:12px; } #queue { position:static; max-height:220px; } }
</style>
</head>
<body>
<header>
  <h1>Review ${set.name}</h1>
  <span id="stats" aria-live="polite"></span>
  <button id="prev" type="button">Previous</button><button id="next" type="button">Next</button>
  <input type="search" id="q" placeholder="Filter titles…" aria-label="Filter titles">
  <label><input type="checkbox" id="hideDone"> Hide reviewed</label>
  <button id="export">Export labels.json</button>
  <button id="import" title="Load a labels.json you exported earlier">Import…</button>
  <input type="file" id="importFile" accept="application/json,.json" hidden>
  <button id="keepNext" class="primary" type="button">Keep group & next</button>
  <button id="undo" disabled title="Undo the last change (⌘Z / Ctrl+Z)">Undo</button>
  <button id="reset" title="Discard local edits and reload the draft">Reset</button>
  <span class="m">Drag a story's ⠿ onto another to merge; drag an article onto a story to move it.</span>
  <a href="https://github.com/ndom91/domino-news/blob/main/docs/story-granularity.md" target="_blank" rel="noreferrer">Rules</a>
</header>
<main id="content" tabindex="-1"><aside id="queue" aria-label="Review queue"></aside><section id="groups" aria-label="Current story group"></section></main>
<script id="data" type="application/json">${data}</script>
<script>
const { set, labels: initial } = JSON.parse(document.getElementById('data').textContent)
const KEY = 'dn-match-review:' + set.name
const byId = new Map(set.articles.map(a => [a.id, a]))
let state = JSON.parse(localStorage.getItem(KEY) || 'null') || structuredClone(initial)
state.groups.forEach(g => { g.done ??= false })
const save = () => { localStorage.setItem(KEY, JSON.stringify(state)); render() }
// Snapshots before each change, for Undo. Kept in memory only.
const history = []
const remember = () => { history.push(structuredClone(state)); if (history.length > 100) history.shift() }
function undo() {
  const prev = history.pop()
  if (!prev) return
  state = prev
  save()
}
const order = { low: 0, medium: 1, high: 2 }
const fmt = iso => new Date(iso).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) + ' UTC'
let seq = Date.now()

function moveArticle(articleId, to) {
  remember()
  const from = state.groups.find(g => g.articleIds.includes(articleId))
  from.articleIds = from.articleIds.filter(id => id !== articleId)
  if (to === '__new') {
    const a = byId.get(articleId)
    state.groups.push({ id: 'n' + (seq++), title: a.title, confidence: 'low', articleIds: [articleId], done: false })
  } else state.groups.find(g => g.id === to).articleIds.push(articleId)
  state.groups = state.groups.filter(g => g.articleIds.length)
  save()
}
function mergeInto(fromId, toId) {
  if (fromId === toId) return
  remember()
  const from = state.groups.find(g => g.id === fromId), to = state.groups.find(g => g.id === toId)
  to.articleIds.push(...from.articleIds); state.groups = state.groups.filter(g => g !== from); save()
}
function options(exclude) {
  return state.groups.filter(g => g.id !== exclude)
    .map(g => '<option value="' + esc(g.id) + '">' + esc(g.title).slice(0, 70) + ' (' + g.articleIds.length + ')</option>').join('')
}
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

function render() {
  document.getElementById('undo').disabled = history.length === 0
  const q = document.getElementById('q').value.toLowerCase()
  const hideDone = document.getElementById('hideDone').checked
  const groups = [...state.groups].sort((a, b) =>
    (a.done - b.done) || (order[a.confidence ?? 'high'] - order[b.confidence ?? 'high']) || b.articleIds.length - a.articleIds.length)
  const done = state.groups.filter(g => g.done).length
  if (!groups.some(g => g.id === state.active)) state.active = (groups.find(g => !g.done) ?? groups[0])?.id
  const activeIndex = groups.findIndex(g => g.id === state.active)
  const active = groups[activeIndex]
  document.getElementById('stats').textContent = (activeIndex + 1) + ' of ' + groups.length + ' · ' + done + ' reviewed'
  document.getElementById('prev').disabled = activeIndex <= 0
  document.getElementById('next').disabled = activeIndex >= groups.length - 1
  document.getElementById('queue').innerHTML = '<h2>Review queue <span class="queue-count">' + done + '/' + groups.length + '</span></h2>' + groups.map((g, i) => '<button type="button" class="queue-item ' + (g.id === state.active ? 'active ' : '') + (g.done ? 'done' : '') + '" data-select-group="' + esc(g.id) + '"><span class="queue-count">' + (i + 1) + ' · ' + g.articleIds.length + '</span><br>' + esc(g.title).slice(0, 80) + '</button>').join('')
  document.getElementById('groups').innerHTML = [active].filter(Boolean).map(g => {
    const arts = g.articleIds.map(id => byId.get(id)).sort((a, b) => a.publishedAt.localeCompare(b.publishedAt))
    const visible = !q || g.title.toLowerCase().includes(q) || arts.some(a => a.title.toLowerCase().includes(q))
    const hidden = !visible || (hideDone && g.done)
    return '<section class="card ' + esc(g.confidence ?? '') + (g.done ? ' done' : '') + (hidden ? ' hidden' : '') + '" data-g="' + esc(g.id) + '">' +
      '<h2><span class="grip" draggable="true" data-drag-group="' + esc(g.id) + '" title="Drag onto another story to merge">⠿</span>' +
      '<input value="' + esc(g.title) + '" data-rename="' + esc(g.id) + '" aria-label="Story title"> <span class="m">' + arts.length + '</span></h2>' +
      (g.reason ? '<p class="reason">' + esc(g.reason) + '</p>' : '') +
      '<div class="tools"><label><input type="checkbox" data-done="' + esc(g.id) + '"' + (g.done ? ' checked' : '') + '> Reviewed</label>' +
      '<select data-merge="' + esc(g.id) + '" aria-label="Merge this group into"><option value="">Merge into…</option>' + options(g.id) + '</select></div>' +
      '<ol>' + arts.map(a => '<li draggable="true" data-drag-article="' + esc(a.id) + '"><div class="t">' + esc(a.title) + '</div>' +
        '<div class="m">' + esc(a.publisher) + (a.publisherKind === 'official' ? ' (official)' : '') + ' · ' + fmt(a.publishedAt) + '</div>' +
        (a.description ? '<div class="d">' + esc(a.description) + '</div>' : '') +
        '<select data-move="' + esc(a.id) + '" aria-label="Move this article to"><option value="">Move to…</option><option value="__new">New group</option>' + options(g.id) + '</select></li>').join('') +
      '</ol></section>'
  }).join('')
}

document.addEventListener('change', e => {
  const t = e.target
  if (t.dataset.move && t.value) moveArticle(t.dataset.move, t.value)
  else if (t.dataset.merge && t.value) mergeInto(t.dataset.merge, t.value)
  else if (t.dataset.done) { remember(); state.groups.find(g => g.id === t.dataset.done).done = t.checked; if (t.checked) state.active = ([...state.groups].find(g => !g.done && g.id !== t.dataset.done) ?? state.groups.find(g => g.id === t.dataset.done))?.id; save() }
  else if (t.dataset.rename) { remember(); state.groups.find(g => g.id === t.dataset.rename).title = t.value; save() }
  else if (t.id === 'hideDone') render()
})
document.getElementById('q').addEventListener('input', render)

// Drag and drop: a story's grip onto another story merges it; an article onto a story moves it.
let dragged = null
document.addEventListener('dragstart', e => {
  const t = e.target.closest?.('[data-drag-group], [data-drag-article]')
  if (!t) return
  dragged = t.dataset.dragGroup ? { group: t.dataset.dragGroup } : { article: t.dataset.dragArticle }
  e.dataTransfer.effectAllowed = 'move'
  e.dataTransfer.setData('text/plain', dragged.group ?? dragged.article)
  const card = t.closest('section.card')
  // Drag the whole card's image when grabbing a story's grip.
  if (dragged.group && card) e.dataTransfer.setDragImage(card, 20, 20)
  ;(dragged.group ? card : t).classList.add('dragging')
})
document.addEventListener('dragend', () => {
  dragged = null
  document.querySelectorAll('.dragging, .over').forEach(el => el.classList.remove('dragging', 'over'))
})
document.addEventListener('dragover', e => {
  const card = e.target.closest?.('section.card')
  if (!dragged || !card) return
  const from = dragged.group ?? state.groups.find(g => g.articleIds.includes(dragged.article))?.id
  if (card.dataset.g === from) return
  e.preventDefault()
  e.dataTransfer.dropEffect = 'move'
  document.querySelectorAll('.over').forEach(el => el !== card && el.classList.remove('over'))
  card.classList.add('over')
})
document.addEventListener('dragleave', e => {
  const card = e.target.closest?.('section.card')
  if (card && !card.contains(e.relatedTarget)) card.classList.remove('over')
})
document.addEventListener('drop', e => {
  const card = e.target.closest?.('section.card')
  if (!dragged || !card) return
  e.preventDefault()
  const d = dragged
  dragged = null
  if (d.group) mergeInto(d.group, card.dataset.g)
  else moveArticle(d.article, card.dataset.g)
})
document.getElementById('prev').addEventListener('click', () => { const groups=[...state.groups].sort((a,b)=>(a.done-b.done)||(order[a.confidence ?? 'high']-order[b.confidence ?? 'high'])||b.articleIds.length-a.articleIds.length); const i=groups.findIndex(g=>g.id===state.active); state.active=groups[Math.max(0,i-1)]?.id; save() })
document.getElementById('next').addEventListener('click', () => { const groups=[...state.groups].sort((a,b)=>(a.done-b.done)||(order[a.confidence ?? 'high']-order[b.confidence ?? 'high'])||b.articleIds.length-a.articleIds.length); const i=groups.findIndex(g=>g.id===state.active); state.active=groups[Math.min(groups.length-1,i+1)]?.id; save() })
document.getElementById('keepNext').addEventListener('click', () => { const group=state.groups.find(g=>g.id===state.active); if (!group) return; remember(); group.done=true; const next=[...state.groups].find(g=>!g.done); state.active=(next ?? group).id; save() })
document.addEventListener('click', e => { const id=e.target.closest?.('[data-select-group]')?.dataset.selectGroup; if (id) { state.active=id; save() } })
document.getElementById('undo').addEventListener('click', undo)
document.getElementById('import').addEventListener('click', () => document.getElementById('importFile').click())
document.getElementById('importFile').addEventListener('change', async e => {
  const file = e.target.files[0]
  e.target.value = ''
  if (!file) return
  const loaded = JSON.parse(await file.text())
  const ids = (loaded.groups ?? []).flatMap(g => g.articleIds)
  const known = ids.filter(id => byId.has(id))
  if (loaded.set !== set.name || known.length !== set.articles.length || new Set(ids).size !== ids.length) {
    alert('That file doesn\u2019t match ' + set.name + ' (wrong set, or articles missing or repeated).')
    return
  }
  remember()
  state = { set: loaded.set, guide: loaded.guide, groups: loaded.groups.map(({ reviewed, ...g }) => ({ ...g, done: reviewed ?? g.done ?? false })) }
  save()
})
document.addEventListener('keydown', e => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey && e.target.tagName !== 'INPUT') {
    e.preventDefault()
    undo()
  }
})
document.getElementById('reset').addEventListener('click', () => {
  if (confirm('Discard your edits and reload the draft?')) { localStorage.removeItem(KEY); state = structuredClone(initial); render() }
})
document.getElementById('export').addEventListener('click', () => {
  const out = { set: state.set, guide: state.guide, groups: state.groups.map(({ done, ...g }) => ({ ...g, reviewed: done })) }
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([JSON.stringify(out, null, 2) + '\\n'], { type: 'application/json' }))
  a.download = set.name + '.labels.json'; a.click()
})
render()
</script>
</body>
</html>
`
}
