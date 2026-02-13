# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run build              # ESM + CJS dual build
npm run lint               # eslint src/ tests/
npm run lint:fix           # eslint --fix
npm run format             # prettier --write
npm run format:check       # prettier --check (CI runs this)
npm run typecheck          # tsc --noEmit
npm test                   # vitest run
npm run test:watch         # vitest (watch mode)
npm run test:coverage      # vitest with 80% coverage thresholds
```

Run a single test file: `npx vitest run tests/unit/factories.test.ts`

## Architecture

This is a cloud-agnostic Pulumi infrastructure library. The primary API is **async factory functions** that dispatch to AWS/Azure implementations via dynamic imports.

### Flow: User → Factory → Provider

```
createNetwork("prod", { cloud: "aws", ... })
  → factories/network.ts (async, resolves cloud target)
    → await import("../aws/index.js")
      → aws/network.ts (creates VPC, subnets, NAT)
        → returns INetwork
```

### Key directories

- **`src/factories/`** — Cloud-agnostic entry points. Each factory is async, uses `isMultiCloud()` to branch between single and array dispatch, and dynamically imports the provider module.
- **`src/aws/`**, **`src/azure/`** — Provider implementations. Loaded dynamically at runtime so missing SDKs don't crash imports.
- **`src/types/`** — `CloudArg` resolution (`"aws"` | `{provider, region}` | array), error classes with codes, validation, tag normalization.
- **`src/platform/`** — Helm-based components (Traefik, cert-manager, ArgoCD, etc.) deployed to any `ICluster`.

### Multi-cloud pattern

All factories accept `CloudArg` which can be a single target or an array. When an array is passed:
1. `isMultiCloud()` returns true
2. `resolveCloudTarget()` returns `ResolvedCloudTarget[]`
3. Factory runs `Promise.all()` over targets, prefixing names with provider (`prod-aws`, `prod-azure`)
4. For networks, CIDRs are auto-offset (`10.0.0.0/16`, `10.1.0.0/16`, etc.)

### Provider options

Cloud-specific config flows through `providerOptions: { aws?: IAwsProviderOptions, azure?: IAzureProviderOptions }` on factory configs. Azure always requires `resourceGroupName`.

### Interface contracts

Every resource output has: `name`, `cloud: ResolvedCloudTarget`, `nativeResource: pulumi.Resource` (escape hatch). Interfaces live in `<module>/interfaces.ts`, implementations in `aws/` and `azure/`.

## Conventions

- Dynamic import paths must use `.js` extensions (`await import("../aws/index.js")`) for Node16 module resolution.
- Use `import type` for type-only imports (enforced by eslint).
- Prefix interface names with `I` (INetwork, ICluster). Types use plain PascalCase. Constants use UPPER_SNAKE_CASE.
- Errors extend `AnyCloudError` with a machine-readable `code` field.
- `readonly` on all interface properties.
- Double quotes, semicolons, 100-char print width, es5 trailing commas (Prettier).
- No `any` — eslint `@typescript-eslint/no-explicit-any: error`.

## Testing

Tests use vitest with `vi.mock()` to intercept dynamic imports of `../../src/aws` and `../../src/azure`. Factory tests verify dispatch logic, multi-cloud naming, CIDR offsets, and error paths without needing actual cloud SDKs.

Coverage excludes: index barrels, interface-only files, aws/azure implementations (integration-tested separately), cli.ts, platform stack.

## Build

Dual ESM/CJS output via separate tsconfig files (`tsconfig.esm.json` → `dist/esm/`, `tsconfig.cjs.json` → `dist/cjs/`). Package exports field routes `import`/`require` to correct variant. Subpath exports (`@reyemtech/nimbus/aws`, `./azure`) give direct provider access.

## CI

GitHub Actions runs: lint → format:check → typecheck → test:coverage → build on Node 20 + 22. Releases via semantic-release on main. `[skip release]` in commit message skips publishing.

## Branching

Feature branches follow `feature/REY-<number>-<description>`. Always branch off main, PR back to main.
