/**
 * Onion architecture rules for @devdigest/api.
 *
 * Owned by the `onion-architecture` skill (.claude/skills/onion-architecture/).
 * Run: `pnpm --dir server arch`
 *
 * One rule underpins all of them: dependencies point INWARD only. Transport
 * knows the application layer; the application layer knows ports; nothing inner
 * ever names a concrete outer thing. The composition root
 * (platform/container.ts + app.ts) is the single exception — naming concretes
 * is its entire job.
 *
 * `severity: 'error'` = blocks. `'warn'` = report, don't block: those are rules
 * we believe in but whose current violations are judgement calls.
 */

/** The transport edge: the only files allowed to see Fastify. */
const TRANSPORT = '^src/(app|server)\\.ts$|^src/modules/index\\.ts$|^src/modules/[^/]+/routes\\.ts$|^src/modules/_shared/context\\.ts$';

/** The composition root: the only place concrete adapters may be named. */
const COMPOSITION_ROOT = '^src/(app|server)\\.ts$|^src/platform/container\\.ts$';

/** Data access: the only files allowed to know the persistence model. */
const PERSISTENCE = '^src/modules/[^/]+/repository(\\.ts$|/)|^src/db/|^src/platform/jobs\\.ts$';

module.exports = {
  forbidden: [
    {
      name: 'only-repositories-touch-db',
      severity: 'error',
      comment:
        'Only repository.ts / repository/*.repo.ts may know the persistence model. ' +
        'Routes and services go through a repository so the Drizzle schema never ' +
        'reaches the application layer. Fix: move the query into the module\'s ' +
        'repository and return a contract type, not a $inferSelect row.',
      from: { path: '^src/modules/', pathNot: PERSISTENCE },
      to: { path: '^src/db/(schema|rows|client)|^node_modules/drizzle-orm' },
    },
    {
      name: 'modules-use-ports-not-adapters',
      severity: 'error',
      comment:
        'Application code depends on port interfaces (@devdigest/shared, or a ' +
        'module facade in modules/<m>/types.ts) resolved through the Container — ' +
        'never on a concrete src/adapters/* implementation. Fix: add the ' +
        'capability to a port and resolve it from the container.',
      from: { path: '^src/modules/' },
      to: { path: '^src/adapters/' },
    },
    {
      name: 'fastify-stays-at-the-edge',
      severity: 'error',
      comment:
        'Fastify is transport. Services, helpers and repositories must not import ' +
        'it, or they cannot be tested or reused without an HTTP server. Allowed: ' +
        'app.ts, server.ts, modules/index.ts, modules/<m>/routes.ts, _shared/context.ts.',
      from: { path: '^src/', pathNot: TRANSPORT },
      to: { path: '^node_modules/(fastify|@fastify/)' },
    },
    {
      name: 'concretes-only-in-composition-root',
      severity: 'error',
      comment:
        'Only the composition root (platform/container.ts, app.ts) may name a ' +
        'concrete adapter. Everything else receives it through a port.',
      from: { path: '^src/platform/', pathNot: COMPOSITION_ROOT },
      to: { path: '^src/adapters/' },
    },
    {
      name: 'helpers-are-pure',
      severity: 'error',
      comment:
        'modules/<m>/helpers.ts is the domain slice: pure functions only. No DB, ' +
        'no adapters, no container, no node builtins. Fix: if it needs I/O it is ' +
        'not a helper — move it to the service.',
      from: { path: '^src/modules/[^/]+/helpers\\.ts$' },
      to: {
        path: '^src/(db|adapters)/|^src/platform/container\\.ts$|^node_modules/drizzle-orm',
        dependencyTypes: ['local', 'npm'],
      },
    },
    {
      name: 'helpers-have-no-io',
      severity: 'error',
      comment: 'modules/<m>/helpers.ts must not touch the filesystem, network or process.',
      from: { path: '^src/modules/[^/]+/helpers\\.ts$' },
      to: { dependencyTypes: ['core'] },
    },
    {
      name: 'adapters-do-not-depend-on-features',
      severity: 'warn',
      comment:
        'An adapter implements a port; it should not import a feature module, or ' +
        'it stops being swappable and reusable. Fix: move the shared constant to ' +
        'the adapter, or pass it in as an option.',
      from: { path: '^src/adapters/' },
      to: { path: '^src/modules/' },
    },
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'A dependency cycle means the layer boundary is not real.',
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '^src/db/migrations/' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: { exportsFields: ['exports'], conditionNames: ['import', 'require', 'node', 'default'] },
  },
};
