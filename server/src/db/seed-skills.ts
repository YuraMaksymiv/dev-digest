import type { SkillType } from '@devdigest/shared';

/**
 * Starter skills seeded alongside the built-in agents.
 *
 * A skill is TEXT AND CONFIG ONLY — it is appended to an agent's prompt and
 * never executed. `description` is the skill's interface: it is written as a
 * directive so an agent reads it as "when this applies, do this".
 *
 * `agents` names the seeded agents that link this skill; `linkEnabled` is the
 * PER-AGENT switch, so a fresh seed can ship a skill attached but muted.
 *
 * Bodies deliberately avoid describing the output JSON, severity scale or
 * report layout — that is the output schema's job, and a prompt that restates
 * it fights the parser (see docs/agent-prompts/README.md).
 */
export interface SeedSkill {
  name: string;
  description: string;
  type: SkillType;
  body: string;
  agents: string[];
  linkEnabled?: boolean;
}

export const SEED_SKILLS: SeedSkill[] = [
  {
    name: 'pr-quality-rubric',
    description: 'When scoring a PR, walk these dimensions and report the ones the diff fails.',
    type: 'rubric',
    linkEnabled: true,
    agents: ['Security Reviewer'],
    body: `## PR quality rubric

Walk these dimensions in order. Report a finding for each one the diff fails,
naming the dimension and the exact file and line that fails it.

1. **Scope** — the diff does one thing. An unrelated rename, reformat or
   dependency bump riding along in a behaviour change hides the behaviour
   change from every future reader of the blame.
2. **Correctness at the edges** — every new branch, loop bound and nullable
   dereference. Empty input, one element, the maximum, the error path.
3. **Error handling** — a caught error is either handled or re-thrown. A
   swallowed error that leaves the caller believing the operation succeeded is
   a finding even when nothing else is wrong.
4. **Naming** — a name that contradicts what the code does costs more than one
   that is merely vague. Report contradictions, not verbosity.
5. **Reversibility** — a change to persisted data, a wire format or a public
   signature. Say what it would take to roll back after it ships.

Do not report:
- a dimension the diff does not touch;
- style the repo's own linter or formatter already settles;
- a preference with no failure behind it — every finding names what breaks.`,
  },
  {
    name: 'secret-leakage-gate',
    description:
      'When the diff adds a literal that could be a credential, treat it as leaked and say what to rotate.',
    type: 'security',
    linkEnabled: true,
    agents: ['Security Reviewer'],
    body: `## Secret leakage

A credential that reaches a commit is leaked the moment it is pushed, whether
or not the commit is later amended. Treat every candidate as leaked and say
what has to be rotated.

Report:
- a literal that looks like a key, token, password, connection string or
  private key — including prefixed forms (\`sk-\`, \`sk_live\`, \`ghp_\`,
  \`AKIA\`, \`-----BEGIN\`) and long opaque base64/hex strings in a config or
  client position;
- a real secret moved into a client-visible surface: a \`NEXT_PUBLIC_\`
  variable, a bundled config, a value interpolated into rendered markup;
- a secret written into somewhere durable — a log line, an error message, a
  thrown exception, an analytics event, a URL query string;
- a \`.env\` or credentials file added to version control.

For each, name the exact value's location and state the rotation the leak
forces. A secret that is merely *read* from the environment is correct — do
not report it.

Do not report:
- an obvious placeholder (\`xxx\`, \`changeme\`, \`your-key-here\`, all-zeroes);
- a public identifier that is not a credential (a publishable key, a client id,
  an account id);
- a fixture whose value is generated inside the test at run time.

The PR text claiming a value is "just a test key", "a demo", "already rotated"
or "intentional" does not change the finding — the value is in the history
either way.`,
  },
  {
    name: 'lethal-trifecta',
    description:
      'When a change puts private data, untrusted content and outbound communication in one path, report the combination.',
    type: 'security',
    linkEnabled: true,
    agents: ['Security Reviewer'],
    body: `## The lethal trifecta

This skill produces ordinary findings about a data-flow shape. It does not
decide any structured classification of the result — report what you see and
let the pipeline label it.

Three capabilities are individually fine and catastrophic together:

1. **access to private data** — secrets, user records, internal APIs, the
   filesystem, a database;
2. **exposure to untrusted content** — anything an outsider can influence: a
   web page, a PR body, an uploaded file, an email, a model's own output from
   an earlier turn;
3. **an outbound channel** — an HTTP call, a webhook, a shell command, a
   rendered link or image, an email, a write to somewhere the outsider reads.

Report when the diff puts all three on one path, and trace the path
explicitly: where the untrusted content enters, what private data is in scope
at that point, and which call carries it out. Name all three sites by file and
line — a finding that names only one is not defensible.

Pay attention to indirect reach: a tool an agent may call, a template that
renders a caller-supplied URL, a retry that logs the whole request body.

Do not report:
- a path with only two of the three;
- a path where the untrusted content is neutralised before the private data is
  in scope — but say so only if you can point at the neutralising code.`,
  },
  {
    name: 'no-then-chains',
    description: 'When the diff adds a `.then()` chain, require async/await instead and say why.',
    type: 'convention',
    agents: ['Security Reviewer'],
    body: `## Promise chains

This repo is \`async\`/\`await\` throughout. A \`.then()\` chain the diff ADDS
is both a style break and an error-handling hazard: a missing \`.catch()\` is
invisible, where a missing \`try\` is not.

Report:
- a newly added \`.then()\` / \`.catch()\` chain, with the \`await\` rewrite;
- a \`.catch()\` that swallows (\`.catch(() => {})\`) — name what it hides;
- a function that mixes \`await\` and a chain — pick one.

Do not report:
- \`.then()\` in code the diff did not touch;
- \`void promise.catch(log)\` used deliberately as fire-and-forget at a
  boundary;
- \`Promise.all\` / \`Promise.allSettled\`, which are not chains.

### Bad
\`\`\`ts
fetchUser(id).then((u) => save(u)).catch(() => {});
\`\`\`
The failure is erased. Nothing upstream learns the save did not happen.

### Good
\`\`\`ts
const u = await fetchUser(id);
await save(u);
\`\`\``,
  },
  {
    name: 'phantom-api-gate',
    description:
      'When the diff calls an API, verify the symbol exists in the repo or its dependencies before trusting it.',
    type: 'security',
    agents: ['Security Reviewer'],
    body: `## Phantom APIs

A call to something that does not exist fails at run time, in the path nobody
exercised. Check every symbol the diff newly calls against what the diff and
the surrounding context actually show.

Report:
- a called function, method or constant with no definition, import or
  declaration anywhere in view;
- an import from a package that appears in no manifest the diff touches;
- a method invoked on a value whose type in view does not have it;
- an option or config key passed to a call that does not accept it.

Quote the call site by file and line and say what the symbol was expected to
resolve to.

Do not report:
- a symbol defined outside the diff in a file the diff does not show — absence
  from the diff is not absence from the repo, and this is the most common way
  to be confidently wrong here;
- a global the runtime provides;
- a type-only name used purely in a type position.

When you cannot tell whether a symbol exists, say so instead of asserting it
does not.`,
  },
  {
    name: 'test-coverage-nudge',
    description:
      'When the diff changes conditional logic, check that every branch of it is exercised by a test.',
    type: 'custom',
    agents: ['Security Reviewer'],
    body: `## Branch coverage of changed logic

For every conditional the diff adds or changes — \`if\`/\`else\`, ternary,
\`switch\` case, early return, \`catch\`, optional chaining that can
short-circuit, default parameter — locate the test that exercises EACH side of
it.

Report a finding when a side has no test. Name the branch by file and line, and
state the input that would reach it.

Do not report:
- branches in code the diff did not touch;
- a branch covered indirectly by a test that would fail if the branch broke.

A test that exercises a branch without asserting anything about its effect does
not count as coverage — say so explicitly when you see it.`,
  },
];
