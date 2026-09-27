// check-shared-imports.cjs — flag RUNTIME (value) imports/re-exports from
// @devdigest/shared in client files. A value import pulls vendor/shared/index.ts
// into the webpack bundle, whose ./contracts/*.js re-exports Next cannot resolve:
// the build breaks. Type-only imports are erased and are fine.
//
// Usage: node check-shared-imports.cjs <file> [<file> …]   exit 1 if any found.
const fs = require('fs');
// The clause may not span another `from` or a `;`, or the match runs across
// neighbouring import statements.
const re = /(?:^|\n)[ \t]*(import|export)\s+((?:(?!\bfrom\b|;)[\s\S])*?)\s*from\s*['"]@devdigest\/shared['"]/g;
const bad = [];
for (const f of process.argv.slice(2)) {
  let src; try { src = fs.readFileSync(f, 'utf8'); } catch { continue; }
  for (const m of src.matchAll(re)) {
    const clause = m[2].trim();
    if (/^type\b/.test(clause)) continue;
    const braces = clause.match(/\{([\s\S]*)\}/);
    if (braces) {
      const specs = braces[1].split(',').map(s => s.trim()).filter(Boolean);
      if (specs.length && specs.every(s => /^type\s/.test(s))) continue;
    }
    bad.push(`${f}:${src.slice(0, m.index).split('\n').length + 1}: ${m[1]} ${clause.replace(/\s+/g,' ').slice(0,50)}`);
  }
}
if (bad.length) { console.log(bad.join('\n')); process.exit(1); }
