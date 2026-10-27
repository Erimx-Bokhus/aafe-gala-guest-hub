// The secret scan's target and its verdict, apart from ci-local.mjs so scripts/test-secret-scan.mjs can test them.
//
// A git worktree's .git is a file that names its real folder by a Windows path (D:/…/.git/worktrees/<name>), which the
// gitleaks container can't see. Mounted alone, a worktree gave "not a git repository" and "0 commits scanned", and the
// scan passed anyway (Oct 26). So the scan mounts the repository that holds the commits (the git common dir's folder)
// and names both ends of the range by commit: inside that folder, HEAD is the main checkout's, not the worktree's.

/**
 * Where to mount and what to scan, from `git rev-parse` answers. Paths are absolute (--path-format=absolute).
 * base and head are commit ids; base is null for a full scan.
 */
export function scanTarget({ toplevel, gitDir, commonDir, head, base }) {
  const worktree = gitDir !== commonDir
  // ".../repo/.git" -> ".../repo"; a bare repository has no checkout around it and is mounted as it is.
  const repo = worktree ? commonDir.replace(/[\\/]\.git[\\/]?$/, '') : toplevel
  // gitleaks.yml: your commits not yet on main, merge commits included (-m --first-parent). A full scan reads everything
  // behind your commit; in your own checkout that is gitleaks' default (its HEAD), in a worktree it must be named.
  const logOpts = base ? `-m --first-parent ${base}..${head}` : worktree ? head : null
  return { repo, worktree, logOpts }
}

/** Why a gitleaks run can't be trusted, or null: it couldn't read the repository, or read nothing though there were commits. */
export function scanProblem(output, expected) {
  const text = output.replace(/\x1b\[[0-9;]*m/g, '')   // gitleaks colors its log lines
  if (/not a git repository/i.test(text)) return 'gitleaks could not read the repository'
  const m = text.match(/(\d+) commits? scanned/)
  if (!m) return 'gitleaks did not say how many commits it scanned'
  if (expected > 0 && Number(m[1]) === 0) return `gitleaks scanned 0 commits, but ${expected} are in the range`
  return null
}
