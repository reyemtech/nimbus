# @reyemtech/nimbus

[![npm version](https://img.shields.io/npm/v/@reyemtech/nimbus.svg)](https://www.npmjs.com/package/@reyemtech/nimbus)
[![CI](https://github.com/reyemtech/nimbus/actions/workflows/ci.yml/badge.svg)](https://github.com/reyemtech/nimbus/actions/workflows/ci.yml)
[![Coverage](https://img.shields.io/badge/coverage-%3E80%25-brightgreen)](https://github.com/reyemtech/nimbus)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![Pulumi](https://img.shields.io/badge/Pulumi-%E2%89%A53.0-blueviolet.svg)](https://www.pulumi.com/)
[![Node.js](https://img.shields.io/badge/Node.js-%E2%89%A520-green.svg)](https://nodejs.org/)

Cloud-agnostic infrastructure abstractions for [Pulumi](https://www.pulumi.com/). Write IaC once, deploy to AWS, Azure, or GCP. Enables full BCDR: any client environment is fully reproducible from code — cloud migration = change one config value.

## Why

Every client environment at ReyemTech follows the same pattern: network + cluster + DNS + secrets + platform components. The only difference is the cloud provider. This package extracts that pattern into reusable, type-safe abstractions.

**Key benefits:**
- **Cloud migration in one line** — change `cloud: "aws"` to `cloud: "azure"` and redeploy
- **Multi-cloud active-active** — deploy to AWS + Azure simultaneously with a Global Load Balancer
- **Factory pattern** — `createNetwork()`, `createCluster()`, `createDns()`, `createSecrets()`, `createStateBackend()` dispatch to the right cloud automatically
- **Dynamic provider loading** — only the targeted cloud SDK loads at runtime; missing providers give helpful install instructions instead of crashes
- **Cost-optimized defaults** — fck-nat (~$3/mo vs $32/mo managed NAT), spot instances, Auto Mode
- **Escape hatches** — every resource exposes its native cloud object via `nativeResource`
- **Type-safe** — full TypeScript interfaces with discriminated unions for provider-specific config

## Install

```bash
npm install @reyemtech/nimbus
```

**Peer dependency:** `@pulumi/pulumi >= 3.0.0`

**Provider SDKs** (install only what you need):
```bash
# Using the nimbus CLI (recommended)
npx @reyemtech/nimbus install aws
npx @reyemtech/nimbus install azure
npx @reyemtech/nimbus install aws azure   # multi-cloud

# Check which providers are installed
npx @reyemtech/nimbus check

# Or manually
npm install @pulumi/aws
npm install @pulumi/azure-native
npm install @pulumi/kubernetes
```

Provider SDKs are **optional peer dependencies** — you only install the ones you target. Importing `@reyemtech/nimbus` without any provider SDK will not crash; the error only surfaces when you call a factory with an uninstalled provider.

### Subpath Imports

For direct access to provider-specific functions (bypasses the factory layer):

```typescript
import { createAwsNetwork } from "@reyemtech/nimbus/aws";
import { createAzureNetwork } from "@reyemtech/nimbus/azure";
```

## Quick Start

### Single Cloud (AWS)

```typescript
import { createNetwork, createCluster, createDns, createPlatformStack } from "@reyemtech/nimbus";
import type { INetwork, ICluster, IDns } from "@reyemtech/nimbus";

// Network with fck-nat (~$3/mo)
const network = await createNetwork("prod", {
  cloud: "aws",
  cidr: "10.0.0.0/16",
  natStrategy: "fck-nat",
}) as INetwork;

// EKS cluster with Auto Mode
const cluster = await createCluster("prod", {
  cloud: "aws",
  nodePools: [
    { name: "system", instanceType: "t4g.small", minNodes: 2, maxNodes: 3 },
    { name: "workers", instanceType: "c6a.large", minNodes: 1, maxNodes: 10, spot: true },
  ],
  providerOptions: { aws: { autoMode: true } },
}, network) as ICluster;

// DNS zone
const dns = await createDns("prod", { cloud: "aws", zoneName: "example.com" }) as IDns;

// Platform stack (Traefik, cert-manager, External DNS, ArgoCD, Vault)
createPlatformStack("prod", {
  cluster,
  domain: "example.com",
  externalDns: { dnsProvider: "route53", domainFilters: ["example.com"] },
  vault: { enabled: true, ingressHost: "vault.example.com" },
});
```

### Single Cloud (Azure)

```typescript
import { createNetwork, createCluster, createDns, createPlatformStack } from "@reyemtech/nimbus";
import type { INetwork, ICluster } from "@reyemtech/nimbus";

const providerOptions = { azure: { resourceGroupName: "rg-prod" } };

const network = await createNetwork("prod", {
  cloud: "azure",
  cidr: "10.1.0.0/16",
  natStrategy: "managed",
  providerOptions,
}) as INetwork;

const cluster = await createCluster("prod", {
  cloud: "azure",
  nodePools: [
    { name: "system", instanceType: "Standard_D2s_v5", minNodes: 2, maxNodes: 3, mode: "system" },
    { name: "workers", instanceType: "Standard_D4s_v5", minNodes: 1, maxNodes: 10, spot: true, mode: "user" },
  ],
  virtualNodes: true,
  providerOptions,
}, network) as ICluster;

createPlatformStack("prod", {
  cluster,
  domain: "example.com",
  externalDns: { dnsProvider: "azure-dns", domainFilters: ["example.com"] },
});
```

### Multi-Cloud (AWS + Azure)

```typescript
import { createNetwork, createCluster, createGlobalLoadBalancer } from "@reyemtech/nimbus";
import type { INetwork, ICluster } from "@reyemtech/nimbus";

const providerOptions = {
  aws: { autoMode: true },
  azure: { resourceGroupName: "rg-prod" },
};

// Auto-offsets CIDRs: AWS gets 10.0.0.0/16, Azure gets 10.1.0.0/16
const networks = await createNetwork("prod", {
  cloud: ["aws", "azure"],
  cidr: "10.0.0.0/16",
  natStrategy: "fck-nat",
  providerOptions,
}) as INetwork[];

// Networks auto-matched by provider
const clusters = await createCluster("prod", {
  cloud: ["aws", "azure"],
  nodePools: [
    { name: "system", instanceType: "t4g.small", minNodes: 2, maxNodes: 3 },
    { name: "workers", instanceType: "c6a.large", minNodes: 2, maxNodes: 8, spot: true },
  ],
  providerOptions,
}, networks) as ICluster[];

// Global Load Balancer — active-active across both clouds
const glb = createGlobalLoadBalancer("prod", {
  strategy: "active-active",
  clusters,
  domain: "app.example.com",
  healthCheck: { path: "/health", port: 443, protocol: "HTTPS" },
  dnsProvider: "route53",
});
```

### Standalone Resources (No Cluster Required)

Every factory function is independent — you don't need a cluster to create a state backend, DNS zone, secrets store, or network. Use any abstraction on its own:

```typescript
import { createStateBackend, createDns, createSecrets, createNetwork } from "@reyemtech/nimbus";
import type { IStateBackend, IDns, ISecrets, INetwork } from "@reyemtech/nimbus";

// Just an S3 bucket for state — no cluster, no platform stack
const state = await createStateBackend("prod", {
  cloud: "aws",
  versioning: true,
  encryption: true,
  locking: { enabled: true },
}) as IStateBackend;

// Just a DNS zone
const dns = await createDns("prod", { cloud: "azure", zoneName: "example.com",
  providerOptions: { azure: { resourceGroupName: "rg-dns" } },
}) as IDns;

// Just a secrets store
const secrets = await createSecrets("prod", { cloud: "aws" }) as ISecrets;

// Just a network (for non-K8s workloads like EC2, Lambda, etc.)
const network = await createNetwork("prod", {
  cloud: "aws",
  cidr: "10.0.0.0/16",
  natStrategy: "managed",
}) as INetwork;
```

### State Backend (BCDR)

```typescript
import { createStateBackend } from "@reyemtech/nimbus";
import type { IStateBackend } from "@reyemtech/nimbus";

// S3 state backend with versioning, encryption, locking, and cross-region replication
const state = await createStateBackend("prod", {
  cloud: "aws",
  versioning: true,
  encryption: true,
  locking: { enabled: true },
  replication: { enabled: true, destinationRegion: "us-west-2" },
}) as IStateBackend;

// Use the backend URL with `pulumi login`
// state.backendUrl => "s3://prod-state-xxxxx"

// Azure state backend
const azureState = await createStateBackend("prod", {
  cloud: "azure",
  versioning: true,
  replication: { enabled: true },  // Uses Standard_GRS SKU
  providerOptions: { azure: { resourceGroupName: "rg-state" } },
}) as IStateBackend;
```

## Architecture

```
@reyemtech/nimbus
├── factories/      # Cloud-agnostic factory functions (primary API, async + dynamic imports)
├── types/          # CloudProvider, CloudTarget, tags, errors, validation
├── network/        # VPC (AWS), VNet (Azure) + NAT + CIDR utilities
├── cluster/        # EKS, AKS (+ Auto Mode, virtual nodes, spot)
├── dns/            # Route 53, Azure DNS
├── secrets/        # AWS Secrets Manager, Azure Key Vault
├── state/          # Pulumi state backend (S3, Azure Blob) with BCDR
├── platform/       # Helm: Traefik, cert-manager, External DNS, ArgoCD, Vault, ESO
├── global-lb/      # DNS-based multi-cloud routing (active-active, failover, geo)
├── utils/          # Provider loader with helpful error messages
├── cli.ts          # CLI helper (nimbus install/check)
├── database/       # (interfaces only — RDS, Azure DB, PXC, CNPG)
├── cache/          # (interfaces only — ElastiCache, Azure Cache, Redis Helm)
├── storage/        # (interfaces only — S3, Blob, GCS)
└── queue/          # (interfaces only — SQS, Service Bus, NATS)
```

### Module Status

| Module | AWS | Azure | GCP |
|--------|-----|-------|-----|
| **Network** | VPC + fck-nat/managed NAT | VNet + NAT Gateway | Planned |
| **Cluster** | EKS + Auto Mode | AKS + virtual nodes | Planned |
| **DNS** | Route 53 | Azure DNS | Planned |
| **Secrets** | Secrets Manager | Key Vault | Planned |
| **State** | S3 + DynamoDB locking + replication | Blob + GRS | Planned |
| **Platform** | Helm (provider-agnostic) | Helm (provider-agnostic) | Helm (provider-agnostic) |
| **Global LB** | Route 53 health-checked routing | Planned | — |

## API Reference

### Factory Functions (Primary API)

The factory functions are the recommended way to use this library. They dispatch to the correct cloud-specific implementation based on the `cloud` parameter. Provider-specific options are passed via `providerOptions`.

All factory functions are **async** and use dynamic imports internally — the provider SDK is only loaded when the function is called with that cloud target.

#### `createNetwork(name, config)`

Creates a VPC (AWS) or VNet (Azure) with subnets and NAT.

| Parameter | Type | Description |
|-----------|------|-------------|
| `name` | `string` | Resource name prefix |
| `config.cloud` | `CloudArg` | `"aws"`, `"azure"`, or `["aws", "azure"]` for multi-cloud |
| `config.cidr` | `string` | CIDR block (auto-offset for multi-cloud) |
| `config.natStrategy` | `NatStrategy` | `"managed"`, `"fck-nat"`, or `"none"` |
| `config.providerOptions` | `IProviderOptions` | Provider-specific options (see below) |

Returns: `Promise<INetwork>` (single cloud) or `Promise<INetwork[]>` (multi-cloud)

#### `createCluster(name, config, networks)`

Creates an EKS (AWS) or AKS (Azure) cluster.

| Parameter | Type | Description |
|-----------|------|-------------|
| `config.nodePools` | `INodePool[]` | Node pool definitions |
| `config.version` | `string` | Kubernetes version |
| `config.providerOptions` | `IProviderOptions` | Provider-specific options |
| `networks` | `INetwork \| INetwork[]` | Network(s) — auto-matched by provider for multi-cloud |

Returns: `Promise<ICluster>` (single cloud) or `Promise<ICluster[]>` (multi-cloud)

#### `createDns(name, config)`

Creates a Route 53 (AWS) or Azure DNS zone.

Returns: `Promise<IDns>` (single cloud) or `Promise<IDns[]>` (multi-cloud)

#### `createSecrets(name, config)`

Creates an AWS Secrets Manager or Azure Key Vault store.

```typescript
const secrets = await createSecrets("prod", { cloud: "aws" }) as ISecrets;
secrets.putSecret("database", { host: "db.example.com", password: dbPassword });
const pw = secrets.getSecretRef({ path: "database", key: "password" });
```

Returns: `Promise<ISecrets>` (single cloud) or `Promise<ISecrets[]>` (multi-cloud)

#### `createStateBackend(name, config)`

Creates an S3 bucket (AWS) or Azure Storage Account for Pulumi state with BCDR features.

| Parameter | Type | Description |
|-----------|------|-------------|
| `config.versioning` | `boolean` | Enable bucket/container versioning. Default: `true` |
| `config.encryption` | `boolean` | Enable server-side encryption. Default: `true` |
| `config.locking` | `IStateLockConfig` | State locking config (DynamoDB on AWS). Default: enabled |
| `config.replication` | `IReplicationConfig` | Cross-region replication. Default: disabled |

Returns: `Promise<IStateBackend>` (single cloud) or `Promise<IStateBackend[]>` (multi-cloud)

**AWS features:** S3 BucketV2, public access block, versioning, SSE (AES256 or KMS), DynamoDB locking, cross-region replication with IAM.

**Azure features:** StorageAccount (StorageV2, HTTPS-only, TLS 1.2), BlobContainer, versioning, GRS for geo-replication. Azure blob leases handle locking natively.

#### Provider Options

```typescript
providerOptions: {
  aws: {
    // Network
    fckNatInstanceType: "t4g.nano",
    availabilityZoneCount: 2,
    // Cluster
    autoMode: true,
    addons: ["vpc-cni", "coredns"],
    endpointAccess: "both",
    // State backend
    stateKmsKeyArn: "arn:aws:kms:...",
    stateForceDestroy: false,
  },
  azure: {
    resourceGroupName: "my-rg",  // Required for all Azure resources
    // Network
    subnetCount: 2,
    // Cluster
    azureCni: true,
    virtualNodes: false,
    aadTenantId: "...",
    dnsPrefix: "...",
    // Secrets
    tenantId: "...",             // Required for Key Vault
    objectId: "...",
    sku: "standard",
  },
}
```

### Direct Cloud Functions (Escape Hatch)

For maximum control, use cloud-specific functions directly via subpath imports:

```typescript
import { createAwsNetwork, createEksCluster } from "@reyemtech/nimbus/aws";
import { createAzureNetwork, createAksCluster } from "@reyemtech/nimbus/azure";
```

Available functions:
- `createAwsNetwork(name, config, options?)` / `createAzureNetwork(name, config, options)`
- `createEksCluster(name, config, network, options?)` / `createAksCluster(name, config, network, options)`
- `createRoute53Dns(name, config)` / `createAzureDns(name, config, options)`
- `createAwsSecrets(name, config)` / `createAzureSecrets(name, config, options)`
- `createAwsStateBackend(name, config, options?)` / `createAzureStateBackend(name, config, options)`

### Platform Stack

#### `createPlatformStack(name, config)`

Deploys Helm-based platform components to one or more clusters.

| Component | Default | Chart |
|-----------|---------|-------|
| Traefik | Enabled | `traefik/traefik` v34.3.0 |
| cert-manager | Enabled | `jetstack/cert-manager` v1.17.2 |
| External DNS | If configured | `kubernetes-sigs/external-dns` v1.16.1 |
| ArgoCD | Disabled | `argoproj/argo-cd` v7.8.26 |
| Vault | Disabled | `hashicorp/vault` v0.29.1 |
| External Secrets | Disabled | `external-secrets/external-secrets` v0.14.4 |

### Global Load Balancer

#### `createGlobalLoadBalancer(name, config)`

Routes traffic across clusters using DNS-based health checks.

| Strategy | Behavior |
|----------|----------|
| `active-active` | Weighted routing — equal traffic to all healthy clusters |
| `active-passive` | Failover — primary cluster, secondary on failure |
| `geo` | Geolocation — route by client continent |

### CLI

The nimbus CLI helps manage provider dependencies:

```bash
# Install provider SDKs
npx @reyemtech/nimbus install aws
npx @reyemtech/nimbus install azure
npx @reyemtech/nimbus install aws azure kubernetes

# Check installed providers
npx @reyemtech/nimbus check
```

### CIDR Utilities

```typescript
import { parseCidr, cidrsOverlap, buildCidrMap, autoOffsetCidrs } from "@reyemtech/nimbus";

// Parse CIDR to numeric range
parseCidr("10.0.0.0/16"); // { network, prefix, size, start, end }

// Check overlap
cidrsOverlap("10.0.0.0/16", "10.0.5.0/24"); // true

// Auto-generate non-overlapping CIDRs
autoOffsetCidrs(3); // ["10.0.0.0/16", "10.1.0.0/16", "10.2.0.0/16"]

// Build a cloud-to-CIDR map with conflict detection
buildCidrMap(["aws", "azure"], { aws: "10.0.0.0/16" });
// => { aws: "10.0.0.0/16", azure: "10.1.0.0/16" }
```

### Cross-Cloud Validation

```typescript
import { validateMultiCloud, validateResourceName, isFeatureSupported } from "@reyemtech/nimbus";

// Validate multi-cloud config (checks duplicates + naming)
validateMultiCloud([
  { provider: "aws", region: "us-east-1" },
  { provider: "azure", region: "canadacentral" },
], "my-cluster"); // { valid: true, errors: [], warnings: [] }

// Check feature availability
isFeatureSupported("fck-nat", "aws"); // true
isFeatureSupported("fck-nat", "azure"); // false

// Validate resource names per provider
validateResourceName("MyCluster", "gcp"); // warns about uppercase
```

### Tags

```typescript
import { normalizeTags, mergeWithRequiredTags } from "@reyemtech/nimbus";

// GCP label normalization (lowercase, no special chars, max 63)
normalizeTags({ "Cost Center": "R&D" }, "gcp"); // { "cost-center": "r-d" }

// Merge required tags (environment, client, costCenter, managedBy)
mergeWithRequiredTags(
  { environment: "prod", client: "acme", costCenter: "eng" },
  { custom: "value" },
); // { environment: "prod", client: "acme", costCenter: "eng", managedBy: "nimbus", custom: "value" }
```

## Escape Hatches

Every resource exposes its cloud-native object via `nativeResource`:

```typescript
import * as aws from "@pulumi/aws";

const cluster = await createCluster("prod", { cloud: "aws", ... }, network) as ICluster;
const eksCluster = cluster.nativeResource as aws.eks.Cluster;
eksCluster.arn.apply(arn => console.log("EKS ARN:", arn));
```

## Cloud Target Flexibility

All factory functions accept flexible cloud arguments:

```typescript
// String shorthand (uses DEFAULT_REGIONS)
await createNetwork("prod", { cloud: "aws", ... });

// Explicit target
await createNetwork("prod", { cloud: { provider: "aws", region: "eu-west-1" }, ... });

// Multi-cloud array
await createNetwork("prod", { cloud: ["aws", "azure"], ... });
```

## Error Handling

All errors extend `AnyCloudError` with typed error codes:

| Error | Code | When |
|-------|------|------|
| `CloudValidationError` | `CLOUD_VALIDATION` | Invalid provider or target |
| `CidrError` | `CIDR_OVERLAP` / `CIDR_INVALID` | CIDR conflicts or malformed |
| `UnsupportedFeatureError` | `UNSUPPORTED_FEATURE` | Feature not available on provider |
| `ConfigError` | `CONFIG_MISSING` / `CONFIG_INVALID` | Missing or invalid configuration |

Missing provider SDKs produce a clear error with install instructions:

```
Cloud provider "aws" requires: @pulumi/aws
Run: npm install @pulumi/aws
Or:  npx @reyemtech/nimbus install aws
```

## Development

```bash
npm install
npm run typecheck   # Type checking
npm run lint        # ESLint
npm run format      # Prettier
npm test            # Vitest (unit tests)
npm run test:coverage  # With coverage thresholds (80%)
npm run build       # ESM + CJS dual build
npm run docs:api    # TypeDoc API docs
```

## License

MIT
