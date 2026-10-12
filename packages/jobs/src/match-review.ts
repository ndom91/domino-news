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
  :root { color-scheme: light dark; --b: #8884; --dim: #888; font: 14px/1.45 system-ui, sans-serif; }
  body { margin: 0; }
  header { position: sticky; top: 0; z-index: 2; display: flex; gap: 12px; align-items: center; flex-wrap: wrap;
    padding: 10px 16px; background: Canvas; border-bottom: 1px solid var(--b); }
  header h1 { font-size: 16px; margin: 0 8px 0 0; }
  main { padding: 16px; display: grid; gap: 14px; grid-template-columns: repeat(auto-fill, minmax(460px, 1fr)); align-items: start; }
  .card { border: 1px solid var(--b); border-radius: 6px; padding: 10px 12px; }
  .card.low { border-left: 4px solid #d33; } .card.medium { border-left: 4px solid #e90; }
  .card.done { opacity: .55; }
  .card h2 { font-size: 14px; margin: 0; display: flex; gap: 8px; align-items: center; }
  .card h2 input { flex: 1; font: inherit; font-weight: 600; border: 1px solid transparent; background: none; padding: 2px; }
  .card h2 input:focus { border-color: var(--b); }
  .reason { color: var(--dim); font-size: 12px; margin: 4px 0 8px; }
  .tools { display: flex; gap: 8px; flex-wrap: wrap; font-size: 12px; margin-bottom: 6px; }
  ol { margin: 0; padding-left: 18px; } li { margin: 6px 0; }
  .t { font-weight: 600; } .m { color: var(--dim); font-size: 12px; }
  .d { color: var(--dim); font-size: 12px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  li:focus-within .d, li:hover .d { -webkit-line-clamp: unset; }
  select, button, input[type=search] { font: inherit; font-size: 12px; }
  .hidden { display: none; }
</style>
</head>
<body>
<header>
  <h1>Review ${set.name}</h1>
  <span id="stats"></span>
  <input type="search" id="q" placeholder="Filter titles…" aria-label="Filter titles">
  <label><input type="checkbox" id="hideDone"> Hide reviewed</label>
  <button id="export">Export labels.json</button>
  <button id="reset" title="Discard local edits and reload the draft">Reset</button>
  <a href="https://github.com/ndom91/domino-news/blob/main/docs/story-granularity.md" target="_blank" rel="noreferrer">Rules</a>
</header>
<main id="groups"></main>
<script id="data" type="application/json">${data}</script>
<script>
const { set, labels: initial } = JSON.parse(document.getElementById('data').textContent)
const KEY = 'dn-match-review:' + set.name
const byId = new Map(set.articles.map(a => [a.id, a]))
let state = JSON.parse(localStorage.getItem(KEY) || 'null') || structuredClone(initial)
state.groups.forEach(g => { g.done ??= false })
const save = () => { localStorage.setItem(KEY, JSON.stringify(state)); render() }
const order = { low: 0, medium: 1, high: 2 }
const fmt = iso => new Date(iso).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) + ' UTC'
let seq = Date.now()

function moveArticle(articleId, to) {
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
  const from = state.groups.find(g => g.id === fromId), to = state.groups.find(g => g.id === toId)
  to.articleIds.push(...from.articleIds); state.groups = state.groups.filter(g => g !== from); save()
}
function options(exclude) {
  return state.groups.filter(g => g.id !== exclude)
    .map(g => '<option value="' + esc(g.id) + '">' + esc(g.title).slice(0, 70) + ' (' + g.articleIds.length + ')</option>').join('')
}
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

function render() {
  const q = document.getElementById('q').value.toLowerCase()
  const hideDone = document.getElementById('hideDone').checked
  const groups = [...state.groups].sort((a, b) =>
    (a.done - b.done) || (order[a.confidence ?? 'high'] - order[b.confidence ?? 'high']) || b.articleIds.length - a.articleIds.length)
  const done = state.groups.filter(g => g.done).length
  document.getElementById('stats').textContent = state.groups.length + ' groups · ' + done + ' reviewed · ' +
    state.groups.filter(g => g.articleIds.length === 1).length + ' singletons'
  document.getElementById('groups').innerHTML = groups.map(g => {
    const arts = g.articleIds.map(id => byId.get(id)).sort((a, b) => a.publishedAt.localeCompare(b.publishedAt))
    const visible = !q || g.title.toLowerCase().includes(q) || arts.some(a => a.title.toLowerCase().includes(q))
    const hidden = !visible || (hideDone && g.done)
    return '<section class="card ' + esc(g.confidence ?? '') + (g.done ? ' done' : '') + (hidden ? ' hidden' : '') + '" data-g="' + esc(g.id) + '">' +
      '<h2><input value="' + esc(g.title) + '" data-rename="' + esc(g.id) + '" aria-label="Story title"> <span class="m">' + arts.length + '</span></h2>' +
      (g.reason ? '<p class="reason">' + esc(g.reason) + '</p>' : '') +
      '<div class="tools"><label><input type="checkbox" data-done="' + esc(g.id) + '"' + (g.done ? ' checked' : '') + '> Reviewed</label>' +
      '<select data-merge="' + esc(g.id) + '" aria-label="Merge this group into"><option value="">Merge into…</option>' + options(g.id) + '</select></div>' +
      '<ol>' + arts.map(a => '<li><div class="t">' + esc(a.title) + '</div>' +
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
  else if (t.dataset.done) { state.groups.find(g => g.id === t.dataset.done).done = t.checked; save() }
  else if (t.dataset.rename) { state.groups.find(g => g.id === t.dataset.rename).title = t.value; save() }
  else if (t.id === 'hideDone') render()
})
document.getElementById('q').addEventListener('input', render)
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
