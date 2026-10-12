// Genera mis estadísticas de GitHub como SVG con mi marca (claro y oscuro).
// Corre en la GitHub Action una vez al día; no depende de servicios externos.
// Uso: GITHUB_TOKEN=... node .github/scripts/stats.mjs <usuario> <carpeta-salida>   (o --demo para probar)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const [login = 'alizz3', out = 'dist'] = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const demo = process.argv.includes('--demo')

async function gql(query, variables) {
  const r = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { Authorization: `bearer ${process.env.GITHUB_TOKEN}`, 'Content-Type': 'application/json', 'User-Agent': 'alizz3-stats' },
    body: JSON.stringify({ query, variables }),
  })
  const j = await r.json()
  if (j.errors) throw new Error(JSON.stringify(j.errors))
  return j.data
}

async function load() {
  if (demo) return { repos: 24, commitsYear: 812, contribYear: 1340, streak: 9, best: 31, langs: [['Vue', 41], ['JavaScript', 27], ['CSS', 12], ['HTML', 9], ['Python', 6], ['PHP', 5]] }
  const year = new Date().getUTCFullYear()
  const d = await gql(`query($login:String!,$from:DateTime!){ user(login:$login){
    repositories(ownerAffiliations:OWNER, isFork:false, privacy:PUBLIC, first:100){ totalCount nodes{ name languages(first:15, orderBy:{field:SIZE, direction:DESC}){ edges{ size node{ name } } } } }
    anio: contributionsCollection(from:$from){ totalCommitContributions restrictedContributionsCount }
    ultimo: contributionsCollection{ contributionCalendar{ totalContributions weeks{ contributionDays{ date contributionCount } } } }
  } }`, { login, from: `${year}-01-01T00:00:00Z` })
  const u = d.user
  // Estilos y marcado no cuentan como lenguajes de programación
  const IGNORAR = new Set(['CSS', 'SCSS', 'Sass', 'Less', 'Stylus', 'HTML'])
  const bytes = {}
  for (const r of u.repositories.nodes) {
    if (r.name.toLowerCase() === login.toLowerCase()) continue // el README no cuenta
    for (const e of r.languages.edges) if (!IGNORAR.has(e.node.name)) bytes[e.node.name] = (bytes[e.node.name] || 0) + e.size
  }
  const total = Object.values(bytes).reduce((a, b) => a + b, 0) || 1
  let langs = Object.entries(bytes).sort((a, b) => b[1] - a[1]).map(([n, s]) => [n, (s / total) * 100])
  if (langs.length > 6) { const rest = langs.slice(5).reduce((a, l) => a + l[1], 0); langs = [...langs.slice(0, 5), ['Otros', rest]] }
  const days = u.ultimo.contributionCalendar.weeks.flatMap((w) => w.contributionDays)
  // Racha actual (si hoy aún no hay, cuenta desde ayer) y mejor racha del último año
  let streak = 0, i = days.length - 1
  if (days[i] && days[i].contributionCount === 0) i--
  for (; i >= 0 && days[i].contributionCount > 0; i--) streak++
  let best = 0, run = 0
  for (const x of days) { run = x.contributionCount > 0 ? run + 1 : 0; best = Math.max(best, run) }
  return { repos: u.repositories.totalCount, commitsYear: u.anio.totalCommitContributions + u.anio.restrictedContributionsCount, contribYear: u.ultimo.contributionCalendar.totalContributions, streak, best, langs }
}

const font = (f) => readFileSync(join(here, 'fonts', f)).toString('base64')
const FONTS = `@font-face{font-family:'M';font-weight:500;src:url(data:font/woff2;base64,${font('montserrat-latin-500-normal.woff2')}) format('woff2')}
@font-face{font-family:'M';font-weight:600;src:url(data:font/woff2;base64,${font('montserrat-latin-600-normal.woff2')}) format('woff2')}
@font-face{font-family:'P';font-weight:600;src:url(data:font/woff2;base64,${font('playfair-display-latin-600-normal.woff2')}) format('woff2')}`

const THEMES = {
  claro: { bg: '#FFFDFC', line: '#E3D6EE', ink: '#2E2236', muted: '#7A6B83', accent: '#6E5398', tile: '#F7F2FA', track: '#F3EEF6', bars: ['#6E5398', '#A28AC4', '#C3B3D4', '#F7B6C2', '#FAD9A8', '#A89CA6'] },
  oscuro: { bg: '#1F1926', line: '#3B2E4A', ink: '#F4E9F7', muted: '#B6A6C2', accent: '#F7B6C2', tile: '#271F30', track: '#2E2539', bars: ['#F7B6C2', '#C9B9DD', '#A28AC4', '#FAD9A8', '#8E79B0', '#A89CA6'] },
}
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
const num = (n) => Math.round(n).toLocaleString('es-CO')

function svg(s, t) {
  const W = 900, H = 322
  const tiles = [['Repos públicos', s.repos], [`Contribuciones en ${new Date().getUTCFullYear()}`, s.commitsYear], ['Racha actual', `${s.streak} ${s.streak === 1 ? 'día' : 'días'}`], ['Mejor racha', `${s.best} días`]]
  const tw = 196, th = 92, gap = 14, x0 = 32, y0 = 92
  const tileSvg = tiles.map(([l, v], k) => {
    const x = x0 + (k % 2) * (tw + gap), y = y0 + Math.floor(k / 2) * (th + gap)
    return `<g transform="translate(${x},${y})"><rect width="${tw}" height="${th}" rx="16" fill="${t.tile}" stroke="${t.line}"/>
<text x="18" y="50" font-family="P" font-weight="600" font-size="30" fill="${t.ink}">${esc(typeof v === 'number' ? num(v) : v)}</text>
<text x="18" y="74" font-family="M" font-weight="500" font-size="13" fill="${t.muted}">${esc(l)}</text></g>`
  }).join('')
  // Lenguajes: barra apilada + leyenda
  const lx = 470, lw = W - lx - 32
  let acc = 0
  const bar = s.langs.map(([n, p], k) => { const w = (p / 100) * lw; const r = `<rect x="${lx + acc}" y="104" width="${Math.max(0, w - 2)}" height="14" fill="${t.bars[k % t.bars.length]}"/>`; acc += w; return r }).join('')
  const legend = s.langs.map(([n, p], k) => {
    const x = lx + (k % 2) * (lw / 2), y = 156 + Math.floor(k / 2) * 34
    return `<circle cx="${x + 6}" cy="${y - 5}" r="6" fill="${t.bars[k % t.bars.length]}"/><text x="${x + 20}" y="${y}" font-family="M" font-weight="600" font-size="14" fill="${t.ink}">${esc(n)}<tspan font-weight="500" fill="${t.muted}">  ${p.toFixed(1)}%</tspan></text>`
  }).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Estadísticas de GitHub de Aliz: ${s.repos} repos públicos, ${s.commitsYear} contribuciones este año, racha de ${s.streak} días. Lenguajes: ${s.langs.map(([n, p]) => `${n} ${p.toFixed(0)}%`).join(', ')}">
<defs><style>${FONTS}</style><clipPath id="b"><rect x="${lx}" y="104" width="${lw}" height="14" rx="7"/></clipPath></defs>
<rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="24" fill="${t.bg}" stroke="${t.line}" stroke-width="2"/>
<text x="32" y="58" font-family="P" font-weight="600" font-size="26" fill="${t.ink}">Mi GitHub en números</text>
<text x="${W - 32}" y="58" text-anchor="end" font-family="M" font-weight="500" font-size="13" fill="${t.muted}">${num(s.contribYear)} contribuciones en el último año</text>
${tileSvg}
<text x="${lx}" y="86" font-family="M" font-weight="600" font-size="14" fill="${t.accent}">Lenguajes que más uso</text>
<rect x="${lx}" y="104" width="${lw}" height="14" rx="7" fill="${t.track}"/>
<g clip-path="url(#b)">${bar}</g>
${legend}
</svg>`
}

const s = await load()
mkdirSync(out, { recursive: true })
for (const [k, t] of Object.entries(THEMES)) writeFileSync(join(out, `stats-${k}.svg`), svg(s, t))
console.log('Estadísticas listas:', JSON.stringify({ ...s, langs: s.langs.map(([n, p]) => `${n} ${p.toFixed(1)}%`) }))
