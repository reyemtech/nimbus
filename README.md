# @reyemtech/pulumi-any-cloud

Cloud-agnostic infrastructure abstractions for [Pulumi](https://www.pulumi.com/). Write IaC once, deploy to AWS, Azure, or GCP. Enables full BCDR: any client environment is fully reproducible from code — cloud migration = change one config value.

## Why

Every client environment at ReyemTech follows the same pattern: network + cluster + DNS + secrets + platform components. The only difference is the cloud provider. This package extracts that pattern into reusable, type-safe abstractions.

**Key benefits:**
- **Cloud migration in one line** — change `cloud: "aws"` to `cloud: "azure"` and redeploy
- **Multi-cloud active-active** — deploy to AWS + Azure simultaneously with a Global Load Balancer
- **Cost-optimized defaults** — fck-nat (~$3/mo vs $32/mo managed NAT), spot instances, Auto Mode
- **Escape hatches** — every resource exposes its native cloud object via `nativeResource`
- **Type-safe** — full TypeScript interfaces with discriminated unions for provider-specific config

## Install

```bash
npm install @reyemtech/pulumi-any-cloud
```

**Peer dependency:** `@pulumi/pulumi >= 3.0.0`

**Provider SDKs** (install only what you need):
```bash
# AWS
npm install @pulumi/aws @pulumi/eks

# Azure
npm install @pulumi/azure-native

# Both (for multi-cloud)
npm install @pulumi/aws @pulumi/eks @pulumi/azure-native

# Platform layer (Helm)
npm install @pulumi/kubernetes
```

## Quick Start

### Single Cloud (AWS)

```typescript
import {
  createAwsNetwork,
  createEksCluster,
  createRoute53Dns,
  createPlatformStack,
} from "@reyemtech/pulumi-any-cloud";

// Network with fck-nat (~$3/mo)
const network = createAwsNetwork("prod", {
  cloud: "aws",
  cidr: "10.0.0.0/16",
  natStrategy: "fck-nat",
});

// EKS cluster with Auto Mode
const cluster = createEksCluster(
  "prod",
  {
    cloud: "aws",
    nodePools: [
      { name: "system", instanceType: "t4g.small", minNodes: 2, maxNodes: 3 },
      { name: "workers", instanceType: "c6a.large", minNodes: 1, maxNodes: 10, spot: true },
    ],
  },
  network,
  { autoMode: true },
);

// DNS zone
const dns = createRoute53Dns("prod", {
  cloud: "aws",
  zoneName: "example.com",
});

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
import {
  createAzureNetwork,
  createAksCluster,
  createAzureDns,
  createPlatformStack,
} from "@reyemtech/pulumi-any-cloud";

const network = createAzureNetwork("prod", {
  cloud: "azure",
  cidr: "10.1.0.0/16",
  natStrategy: "managed",
}, { resourceGroupName: "rg-prod" });

const cluster = createAksCluster("prod", {
  cloud: "azure",
  nodePools: [
    { name: "system", instanceType: "Standard_D2s_v5", minNodes: 2, maxNodes: 3, mode: "system" },
    { name: "workers", instanceType: "Standard_D4s_v5", minNodes: 1, maxNodes: 10, spot: true, mode: "user" },
  ],
  virtualNodes: true,
}, network, { resourceGroupName: "rg-prod" });

createPlatformStack("prod", {
  cluster,
  domain: "example.com",
  externalDns: { dnsProvider: "azure-dns", domainFilters: ["example.com"] },
});
```

### Multi-Cloud (AWS + Azure)

```typescript
import {
  createAwsNetwork,
  createEksCluster,
  createAzureNetwork,
  createAksCluster,
  createGlobalLoadBalancer,
  buildCidrMap,
} from "@reyemtech/pulumi-any-cloud";

// Auto-generate non-overlapping CIDRs
const cidrs = buildCidrMap(["aws", "azure"]);
// => { aws: "10.0.0.0/16", azure: "10.1.0.0/16" }

const awsNet = createAwsNetwork("prod", { cloud: "aws", cidr: cidrs["aws"], natStrategy: "fck-nat" });
const awsCluster = createEksCluster("prod", { cloud: "aws", nodePools: [...] }, awsNet, { autoMode: true });

const azNet = createAzureNetwork("prod", { cloud: "azure", cidr: cidrs["azure"] }, { resourceGroupName: "rg-prod" });
const azCluster = createAksCluster("prod", { cloud: "azure", nodePools: [...] }, azNet, { resourceGroupName: "rg-prod" });

// Global Load Balancer — active-active across both clouds
const glb = createGlobalLoadBalancer("prod", {
  strategy: "active-active",
  clusters: [awsCluster, azCluster],
  domain: "app.example.com",
  healthCheck: { path: "/health", port: 443, protocol: "HTTPS" },
  dnsProvider: "route53",
});
```

## Architecture

```
@reyemtech/pulumi-any-cloud
├── types/          # CloudProvider, CloudTarget, tags, errors, validation
├── network/        # VPC (AWS), VNet (Azure) + NAT + CIDR utilities
├── cluster/        # EKS, AKS (+ Auto Mode, virtual nodes, spot)
├── dns/            # Route 53, Azure DNS
├── secrets/        # AWS Secrets Manager, Azure Key Vault
├── platform/       # Helm: Traefik, cert-manager, External DNS, ArgoCD, Vault, ESO
├── global-lb/      # DNS-based multi-cloud routing (active-active, failover, geo)
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
| **Platform** | Helm (provider-agnostic) | Helm (provider-agnostic) | Helm (provider-agnostic) |
| **Global LB** | Route 53 health-checked routing | Planned | — |

## API Reference

### Network

#### `createAwsNetwork(name, config, options?)`

Creates a VPC with public/private subnets and NAT.

| Parameter | Type | Description |
|-----------|------|-------------|
| `name` | `string` | Resource name prefix |
| `config.cloud` | `CloudArg` | `"aws"` or `{ provider: "aws", region: "..." }` |
| `config.cidr` | `string` | VPC CIDR block (default: `"10.0.0.0/16"`) |
| `config.natStrategy` | `NatStrategy` | `"managed"`, `"fck-nat"`, or `"none"` |
| `options.fckNatInstanceType` | `string` | fck-nat instance type (default: `"t4g.nano"`) |
| `options.availabilityZoneCount` | `number` | Number of AZs (default: `2`) |

Returns: `INetwork` — `{ vpcId, publicSubnetIds, privateSubnetIds, natGatewayId, nativeResource }`

#### `createAzureNetwork(name, config, options)`

Creates a VNet with subnets, NSG, and optional NAT Gateway.

| Parameter | Type | Description |
|-----------|------|-------------|
| `config.cloud` | `CloudArg` | `"azure"` or `{ provider: "azure", region: "..." }` |
| `config.cidr` | `string` | VNet address space |
| `options.resourceGroupName` | `string` | Azure resource group (required) |
| `options.subnetCount` | `number` | Subnet pairs per type (default: `2`) |

Returns: `INetwork`

### Cluster

#### `createEksCluster(name, config, network, options?)`

Creates an EKS cluster with managed node groups or Auto Mode.

| Parameter | Type | Description |
|-----------|------|-------------|
| `config.nodePools` | `INodePool[]` | Node pool definitions |
| `config.version` | `string` | Kubernetes version |
| `options.autoMode` | `boolean` | Enable EKS Auto Mode (no explicit node groups) |
| `options.endpointAccess` | `string` | `"public"`, `"private"`, or `"both"` |

Returns: `ICluster` — `{ endpoint, kubeconfig, provider, nativeResource }`

#### `createAksCluster(name, config, network, options)`

Creates an AKS cluster with system/user node pools.

| Parameter | Type | Description |
|-----------|------|-------------|
| `config.virtualNodes` | `boolean` | Enable ACI virtual node |
| `config.nodePools[].mode` | `string` | `"system"` or `"user"` |
| `options.resourceGroupName` | `string` | Azure resource group (required) |

Returns: `ICluster`

### DNS

#### `createRoute53Dns(name, config)` / `createAzureDns(name, config, options)`

Creates a DNS hosted zone with optional initial records.

Returns: `IDns` — `{ zoneId, zoneName, nameServers, addRecord() }`

### Secrets

#### `createAwsSecrets(name, config)` / `createAzureSecrets(name, config, options)`

Creates a secrets store with `putSecret()` and `getSecretRef()` methods.

```typescript
const secrets = createAwsSecrets("prod", { cloud: "aws" });
secrets.putSecret("database", { host: "db.example.com", password: dbPassword });
const pw = secrets.getSecretRef({ path: "database", key: "password" });
```

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

### CIDR Utilities

```typescript
import { parseCidr, cidrsOverlap, buildCidrMap, autoOffsetCidrs } from "@reyemtech/pulumi-any-cloud";

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
import { validateMultiCloud, validateResourceName, isFeatureSupported } from "@reyemtech/pulumi-any-cloud";

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
import { normalizeTags, mergeWithRequiredTags } from "@reyemtech/pulumi-any-cloud";

// GCP label normalization (lowercase, no special chars, max 63)
normalizeTags({ "Cost Center": "R&D" }, "gcp"); // { "cost-center": "r-d" }

// Merge required tags (environment, client, costCenter, managedBy)
mergeWithRequiredTags(
  { environment: "prod", client: "acme", costCenter: "eng" },
  { custom: "value" },
); // { environment: "prod", client: "acme", costCenter: "eng", managedBy: "pulumi-any-cloud", custom: "value" }
```

## Escape Hatches

Every resource exposes its cloud-native object via `nativeResource`:

```typescript
import * as aws from "@pulumi/aws";

const cluster = createEksCluster("prod", { ... }, network);
const eksCluster = cluster.nativeResource as aws.eks.Cluster;
eksCluster.arn.apply(arn => console.log("EKS ARN:", arn));
```

## Cloud Target Flexibility

All factory functions accept flexible cloud arguments:

```typescript
// String shorthand (uses DEFAULT_REGIONS)
createAwsNetwork("prod", { cloud: "aws", ... });

// Explicit target
createAwsNetwork("prod", { cloud: { provider: "aws", region: "eu-west-1" }, ... });

// Multi-cloud array
createPlatformStack("prod", {
  cluster: [awsCluster, azureCluster],
  ...
});
```

## Error Handling

All errors extend `AnyCloudError` with typed error codes:

| Error | Code | When |
|-------|------|------|
| `CloudValidationError` | `CLOUD_VALIDATION` | Invalid provider or target |
| `CidrError` | `CIDR_OVERLAP` / `CIDR_INVALID` | CIDR conflicts or malformed |
| `UnsupportedFeatureError` | `UNSUPPORTED_FEATURE` | Feature not available on provider |
| `ConfigError` | `CONFIG_MISSING` / `CONFIG_INVALID` | Missing or invalid configuration |

## Development

```bash
npm install
npm run typecheck   # Type checking
npm run lint        # ESLint
npm run format      # Prettier
npm test            # Vitest (unit tests)
npm run test:coverage  # With coverage thresholds
npm run build       # ESM + CJS dual build
```

## License

MIT
