// Builds hub/docs/history.json for the hub's History page from git:
// every line changed in hub/docs (with the removed text kept) and every merged pull request.
// Run from the repo root before publishing the hub:  node hub/scripts/build-history.mjs
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const WHO = { 'nessaisling-lab': 'Aisling', 'Aisling Leiva-Davila': 'Aisling', 'aislingld-pursuit': 'Aisling', Claude: 'Aisling',
  wsvdesign: 'Natalie', 'Natalie Walker': 'Natalie', CodeToTheCore: 'Cornell', 'Cornell Robertson': 'Cornell',
  antoninlesov: 'Antonin', 'Antonin Lesov': 'Antonin' };
const who = name => WHO[name] || name.split(' ')[0];

// New York wall-clock time, "YYYY-MM-DD HH:MM"
const NY = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const nyTime = epoch => { const p = Object.fromEntries(NY.formatToParts(new Date(epoch * 1000)).map(x => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`; };

const clean = l => l.replace(/<!--[\s\S]*?-->/g, '').replace(/\s+/g, ' ').trim();   // markers and spacing don't count as edits
const skip = l => !l || /^```/.test(l) || /^\|[\s:|-]+\|$/.test(l) || /^-{3,}$/.test(l);
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const cut = s => (s.length > 280 ? s.slice(0, 277) + '…' : s);

function sectionsOf(sha, path) {           // nearest "## " heading for each line (1-based), or '' before the first
  let text = '';
  try { text = git('show', `${sha}:${path}`); } catch { return null; }
  let cur = ''; return [''].concat(text.split('\n').map(l => (/^## /.test(l) ? (cur = slug(l.slice(3).replace(/<!--[\s\S]*?-->/g, ''))) : cur)));
}

// ---- hub edits ----
const commits = [];
for (const row of git('log', '--no-merges', '--format=%H%x09%at%x09%an%x09%s', '--', 'hub/docs').trim().split('\n').filter(Boolean)) {
  const [sha, at, author, msg] = row.split('\t');
  const changes = [];
  const diff = git('show', '-U0', '--ignore-cr-at-eol', '--format=', sha, '--', 'hub/docs');   // a line-ending-only change isn't an edit
  for (const file of diff.split(/^diff --git /m).slice(1)) {
    const path = (file.match(/^a\/(\S+)/) || [])[1]; if (!path || !path.endsWith('.md')) continue;
    const page = path.split('/').pop().replace(/\.md$/, '');
    if (page === 'changes') continue;          // What's new is itself a log
    const created = /^new file mode/m.test(file);
    if (created) {   // a new page is one entry, not every line
      const n = file.split('\n').filter(l => l.startsWith('+') && !l.startsWith('+++') && !skip(clean(l.slice(1)))).length;
      changes.push({ page, sec: '', kind: 'new', after: `Page created (${n} lines)` }); continue;
    }
    const after = sectionsOf(sha, path), before = created ? null : sectionsOf(`${sha}^`, path);
    for (const h of file.split(/^(?=@@ )/m).slice(1)) {
      const m = h.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/); if (!m) continue;
      const lines = h.split('\n').slice(1);
      const minus = [], plus = [];
      let a = +m[1], b = +m[3];
      for (const l of lines) {
        if (l.startsWith('-')) minus.push({ text: clean(l.slice(1)), sec: before ? before[a++] || '' : '' });
        else if (l.startsWith('+')) plus.push({ text: clean(l.slice(1)), sec: after ? after[b++] || '' : '' });
      }
      const hasHeading = lines.some(l => /^\+## /.test(l));
      const n = Math.max(minus.length, plus.length);
      for (let i = 0; i < n; i++) {
        const o = minus[i], p = plus[i];
        if (o && p) { if (o.text === p.text || (skip(o.text) && skip(p.text))) continue;   // marker-only edits
          changes.push({ page, sec: p.sec, kind: 'modified', before: cut(o.text), after: cut(p.text) }); }
        else if (p) { if (skip(p.text)) continue; changes.push({ page, sec: p.sec, kind: created || hasHeading ? 'new' : 'updated', after: cut(p.text) }); }
        else if (o) { if (skip(o.text)) continue; changes.push({ page, sec: o.sec, kind: 'removed', before: cut(o.text) }); }
      }
    }
  }
  if (changes.length) commits.push({ sha: sha.slice(0, 7), t: nyTime(+at), who: who(author), msg, changes });
}

// ---- merged pull requests (merge commits on main's first-parent line) ----
const prs = [];
for (const row of git('log', '--merges', '--first-parent', '--format=%H%x09%at%x09%s%x09%b%x1e').split('\x1e').map(s => s.trim()).filter(Boolean)) {
  const [sha, at, subject, body = ''] = row.split('\t');
  const m = subject.match(/^Merge pull request #(\d+) from [^/]+\/(\S+)/); if (!m) continue;
  let author = '';
  try { author = git('log', '--no-merges', '--format=%an', `${sha}^1..${sha}^2`).trim().split('\n').pop(); } catch {}
  prs.push({ n: +m[1], branch: m[2], title: body.split('\n')[0].trim() || m[2], t: nyTime(+at), who: author ? who(author) : '' });
}

writeFileSync('hub/docs/history.json', JSON.stringify({ generated: nyTime(Date.now() / 1000), repo: 'Erimx-Bokhus/aafe-gala-guest-hub', commits, prs }));
console.log(`history.json: ${commits.length} hub edits (${commits.reduce((s, c) => s + c.changes.length, 0)} line changes), ${prs.length} merged PRs`);
