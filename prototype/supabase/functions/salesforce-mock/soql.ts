// DEMO ONLY: reads the SOQL salesforce-push sends (_shared/salesforce.ts), for the stand-in org.
//   SELECT f, ... FROM <sObject> WHERE <field> IN ('a', ...) OR <field> = 'b' ...   (all OR, or all AND)
// Anything else is refused, as Salesforce refuses a malformed query. Tested in scripts/test-salesforce.mts.

export interface Soql { sobject: string; fields: string[]; any: boolean; conds: { field: string; values: string[] }[] }

const TOKEN = /\s*(?:'((?:[^'\\]|\\.)*)'|([(),=])|([A-Za-z_][\w.]*))/y
const unescape = (s: string) => s.replace(/\\(.)/g, (_, c: string) => ({ n: '\n', r: '\r', t: '\t' } as Record<string, string>)[c] ?? c)

export function parseSoql(q: string): Soql {
  const tokens: { text?: string; word?: string }[] = []
  let end = 0   // a sticky regex that stops matching resets lastIndex, so keep where the last token ended
  TOKEN.lastIndex = 0
  for (let m = TOKEN.exec(q); m; m = TOKEN.exec(q)) {
    tokens.push(m[1] !== undefined ? { text: unescape(m[1]) } : { word: m[2] ?? m[3] })
    end = TOKEN.lastIndex
  }
  if (q.slice(end).trim()) throw new Error(`MALFORMED_QUERY: unexpected "${q.slice(end, end + 20).trim()}"`)
  let i = 0
  const word = (w?: string) => {
    const t = tokens[i++]
    if (!t?.word || (w && t.word.toUpperCase() !== w)) throw new Error(`MALFORMED_QUERY: expected ${w ?? 'a name'}`)
    return t.word
  }
  const text = () => { const t = tokens[i++]; if (t?.text === undefined) throw new Error('MALFORMED_QUERY: expected a quoted value'); return t.text }
  const peek = () => tokens[i]?.word?.toUpperCase()

  word('SELECT')
  const fields = [word()]
  while (peek() === ',') { i++; fields.push(word()) }
  word('FROM')
  const sobject = word()
  word('WHERE')
  const conds: Soql['conds'] = []
  const joins = new Set<string>()
  for (;;) {
    const field = word()
    if (peek() === '=') { i++; conds.push({ field, values: [text()] }) } else {
      word('IN'); word('(')
      const values = [text()]
      while (peek() === ',') { i++; values.push(text()) }
      word(')')
      conds.push({ field, values })
    }
    if (i === tokens.length) break
    joins.add(word())
  }
  if (joins.size > 1 || [...joins].some((j) => j.toUpperCase() !== 'AND' && j.toUpperCase() !== 'OR')) throw new Error('MALFORMED_QUERY: use only AND, or only OR')
  return { sobject, fields, any: [...joins][0]?.toUpperCase() === 'OR', conds }
}
