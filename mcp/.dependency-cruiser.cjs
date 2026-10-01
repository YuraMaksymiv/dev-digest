/**
 * Onion architecture rules for @devdigest/mcp (Decision 9).
 * Run: `pnpm --dir mcp arch`
 *
 *   tools/     transport: parse -> service -> result    (the only SDK users besides server.ts/index.ts)
 *   services/  orchestration over the DevDigestApi port
 *   domain/    pure formatting / sorting / cursor logic
 *   ports.ts   DevDigestApi interface (+ ApiError, Logger)
 *   adapters/  concrete HTTP client; implements the port
 *   server.ts / index.ts  composition root: the only files that may name concretes
 */

const COMPOSITION_ROOT = '^src/(server|index)\\.ts$';

module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'Cycles make layering unreadable. Extract the shared piece inward.',
      from: {},
      to: { circular: true },
    },
    {
      name: 'tools-not-adapters',
      severity: 'error',
      comment: 'Tools are transport; they reach the backend only through services.',
      from: { path: '^src/tools/' },
      to: { path: '^src/adapters/' },
    },
    {
      name: 'inner-layers-not-adapters',
      severity: 'error',
      comment: 'services/ and domain/ depend on the DevDigestApi port, never on a concrete adapter.',
      from: { path: '^src/(services|domain)/' },
      to: { path: '^src/adapters/' },
    },
    {
      name: 'only-composition-root-names-concretes',
      severity: 'error',
      comment: 'Only server.ts / index.ts may import src/adapters/*.',
      from: { path: '^src/', pathNot: [COMPOSITION_ROOT, '^src/adapters/', '\\.test\\.ts$'] },
      to: { path: '^src/adapters/' },
    },
    {
      name: 'sdk-only-in-transport',
      severity: 'error',
      comment: 'The MCP SDK belongs to tools/ and the composition root; services/domain/adapters stay SDK-free.',
      from: { path: '^src/', pathNot: ['^src/tools/', COMPOSITION_ROOT, '\\.test\\.ts$'] },
      to: { path: '^node_modules/@modelcontextprotocol/' },
    },
    {
      name: 'domain-is-pure',
      severity: 'error',
      comment: 'domain/ imports only domain/: no I/O, no node: modules, no packages, no outer layers.',
      from: { path: '^src/domain/', pathNot: '\\.test\\.ts$' },
      to: { pathNot: '^src/domain/' },
    },
    {
      name: 'services-not-outward',
      severity: 'error',
      comment: 'services/ may use domain/ and ports.ts only.',
      from: { path: '^src/services/', pathNot: '\\.test\\.ts$' },
      to: { path: '^src/(tools|server|index|config|logger)' },
    },
    {
      name: 'ports-not-outward',
      severity: 'error',
      comment: 'ports.ts may depend on domain/ only.',
      from: { path: '^src/ports\\.ts$' },
      to: { path: '^src/', pathNot: ['^src/domain/', '^src/ports\\.ts$'] },
    },
    {
      name: 'adapters-not-outward',
      severity: 'error',
      comment: 'adapters/ implement ports; they never reach into tools, services or the composition root.',
      from: { path: '^src/adapters/', pathNot: '\\.test\\.ts$' },
      to: { path: '^src/(tools|services|server|index)' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    exclude: { path: '^src/test-support/' },
    enhancedResolveOptions: { exportsFields: ['exports'], conditionNames: ['import', 'require', 'node', 'default', 'types'] },
  },
};
