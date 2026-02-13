/**
 * Embedded project templates for `nimbus new`.
 *
 * Each template function returns the contents for `index.ts` and `README.md`
 * with the project name substituted into resource names.
 *
 * @module cli/templates
 */

/** Shape returned by every template function. */
export interface ITemplateFiles {
  readonly indexTs: string;
  readonly readmeMd: string;
}

/** Template metadata including provider dependencies. */
export interface ITemplateInfo {
  readonly description: string;
  readonly providers: ReadonlyArray<string>;
  readonly generate: (name: string) => ITemplateFiles;
}

/**
 * Generate a Pulumi.yaml project file.
 *
 * @param name - Project name
 * @returns Pulumi.yaml contents
 */
export function generatePulumiYaml(name: string): string {
  return `name: ${name}
runtime:
  name: nodejs
  options:
    typescript: true
description: ${name} — Nimbus infrastructure project
`;
}

/**
 * Generate a package.json for a new project.
 *
 * @param name - Project name
 * @returns package.json contents
 */
export function generatePackageJson(name: string): string {
  return JSON.stringify(
    {
      name,
      version: "0.0.1",
      main: "index.ts",
      devDependencies: {
        "@types/node": "^22",
      },
    },
    null,
    2
  );
}

/** Shared tsconfig for scaffolded projects. */
export const PROJECT_TSCONFIG = JSON.stringify(
  {
    compilerOptions: {
      strict: true,
      outDir: "bin",
      target: "es2020",
      module: "commonjs",
      moduleResolution: "node",
      sourceMap: true,
      experimentalDecorators: true,
      forceConsistentCasingInFileNames: true,
      skipLibCheck: true,
    },
    include: ["."],
  },
  null,
  2
);

/** Valid template names accepted by the CLI. */
export const TEMPLATE_NAMES = [
  "empty",
  "minimal-aws",
  "minimal-azure",
  "aws",
  "azure",
  "multi-cloud",
] as const;

export type TemplateName = (typeof TEMPLATE_NAMES)[number];

/** Common operations section included in every generated README. */
const OPERATIONS_SECTION = `## Operations

\`\`\`bash
pulumi preview                    # Preview changes before deploying
pulumi up                         # Deploy infrastructure
pulumi refresh                    # Sync state with actual cloud resources
pulumi destroy                    # Tear down all resources
pulumi config set <key> <value>   # Set stack configuration (e.g. secrets)
pulumi stack output               # View stack outputs
pulumi logs                       # View cloud resource logs (if supported)
\`\`\`
`;

/** Template registry with metadata and provider dependencies. */
export const TEMPLATES: Readonly<Record<TemplateName, ITemplateInfo>> = {
  empty: {
    description: "Blank scaffold with TODO placeholders",
    providers: [],
    generate: emptyTemplate,
  },
  "minimal-aws": {
    description: "State backend + Secrets Manager (no cluster)",
    providers: ["aws"],
    generate: minimalAwsTemplate,
  },
  "minimal-azure": {
    description: "State backend + Key Vault (no cluster)",
    providers: ["azure"],
    generate: minimalAzureTemplate,
  },
  aws: {
    description: "Full stack: VPC + EKS + Route 53 + Secrets + Platform",
    providers: ["aws", "kubernetes"],
    generate: awsTemplate,
  },
  azure: {
    description: "Full stack: VNet + AKS + Azure DNS + Key Vault + Platform",
    providers: ["azure", "kubernetes"],
    generate: azureTemplate,
  },
  "multi-cloud": {
    description: "AWS + Azure active-active with Global Load Balancer",
    providers: ["aws", "azure", "kubernetes"],
    generate: multiCloudTemplate,
  },
};

/**
 * Empty scaffold with imports and TODO placeholders.
 *
 * @param name - Project name used in comments
 * @returns Template files
 */
export function emptyTemplate(name: string): ITemplateFiles {
  const indexTs = `/**
 * ${name} — Nimbus infrastructure project.
 *
 * Usage:
 *   pulumi up
 */

// import {
//   createNetwork,
//   createCluster,
//   createDns,
//   createSecrets,
//   createStateBackend,
//   createPlatformStack,
// } from "@reyemtech/nimbus";
// import type { INetwork, ICluster, IDns, ISecrets, IStateBackend } from "@reyemtech/nimbus";

// TODO: Define your cloud target
// const cloud = "aws";

// TODO: Create resources
// const network = createNetwork("${name}", { cloud, cidr: "10.0.0.0/16" });

// TODO: Export outputs
// export const output = "replace-me";
`;

  const readmeMd = `# ${name}

Nimbus infrastructure project.

## Getting Started

Edit \`index.ts\` to define your cloud resources, then deploy.

${OPERATIONS_SECTION}
## Resources

- [Nimbus Documentation](https://github.com/reyemtech/nimbus)
- [Pulumi Documentation](https://www.pulumi.com/docs/)
`;

  return { indexTs, readmeMd };
}

/**
 * Minimal AWS template — state backend + Secrets Manager, no cluster.
 *
 * @param name - Project name substituted into resource names
 * @returns Template files
 */
export function minimalAwsTemplate(name: string): ITemplateFiles {
  const indexTs = `/**
 * ${name} — Minimal AWS infrastructure.
 *
 * Deploys: S3 state backend + AWS Secrets Manager
 *
 * Usage:
 *   pulumi up
 */

import { createStateBackend, createSecrets } from "@reyemtech/nimbus";
import type { IStateBackend, ISecrets } from "@reyemtech/nimbus";

// 1. State Backend — S3 with versioning, encryption, and DynamoDB locking
const backend = createStateBackend("${name}", {
  cloud: "aws",
  versioning: true,
  encryption: true,
  locking: { enabled: true },
  tags: { environment: "production" },
}) as IStateBackend;

// 2. Secrets — AWS Secrets Manager
const secrets = createSecrets("${name}", {
  cloud: "aws",
  backend: "aws-secrets-manager",
  tags: { environment: "production" },
}) as ISecrets;

secrets.putSecret("database", {
  host: "db.internal.example.com",
  password: "change-me-in-pulumi-config",
});

// Exports
export const backendUrl = backend.backendUrl;
export const bucketName = backend.bucketName;
`;

  const readmeMd = `# ${name}

Minimal AWS infrastructure — state backend + secrets, no cluster required.

## Components

- **State Backend** — S3 bucket with versioning, encryption, and DynamoDB locking
- **Secrets** — AWS Secrets Manager for sensitive configuration

## Architecture

\`\`\`mermaid
graph LR
  subgraph AWS["AWS"]
    S3[S3 State Backend]
    DDB[DynamoDB Lock Table]
    SM[Secrets Manager]
  end

  S3 --> DDB
\`\`\`

${OPERATIONS_SECTION}
`;

  return { indexTs, readmeMd };
}

/**
 * Minimal Azure template — state backend + Key Vault, no cluster.
 *
 * @param name - Project name substituted into resource names
 * @returns Template files
 */
export function minimalAzureTemplate(name: string): ITemplateFiles {
  const indexTs = `/**
 * ${name} — Minimal Azure infrastructure.
 *
 * Deploys: Azure Blob state backend + Key Vault
 *
 * Usage:
 *   pulumi up
 */

import { createStateBackend, createSecrets } from "@reyemtech/nimbus";
import type { IStateBackend, ISecrets } from "@reyemtech/nimbus";

const resourceGroupName = "rg-${name}-canadacentral";

const azureOptions = {
  azure: { resourceGroupName },
};

// 1. State Backend — Azure Blob Storage with versioning and encryption
const backend = createStateBackend("${name}", {
  cloud: "azure",
  versioning: true,
  encryption: true,
  tags: { environment: "production" },
  providerOptions: azureOptions,
}) as IStateBackend;

// 2. Secrets — Azure Key Vault
const secrets = createSecrets("${name}", {
  cloud: "azure",
  backend: "azure-key-vault",
  tags: { environment: "production" },
  providerOptions: azureOptions,
}) as ISecrets;

secrets.putSecret("database", {
  host: "db.internal.example.com",
  password: "change-me-in-pulumi-config",
});

// Exports
export const backendUrl = backend.backendUrl;
export const storageAccountName = backend.storageAccountName;
`;

  const readmeMd = `# ${name}

Minimal Azure infrastructure — state backend + secrets, no cluster required.

## Components

- **State Backend** — Azure Blob Storage with versioning and encryption
- **Secrets** — Azure Key Vault for sensitive configuration

## Architecture

\`\`\`mermaid
graph LR
  subgraph Azure["Azure"]
    SA[Storage Account]
    BC[Blob Container]
    KV[Key Vault]
  end

  SA --> BC
\`\`\`

${OPERATIONS_SECTION}
`;

  return { indexTs, readmeMd };
}

/**
 * Full AWS stack — VPC + EKS + Route 53 + Secrets + Platform.
 *
 * @param name - Project name substituted into resource names
 * @returns Template files
 */
export function awsTemplate(name: string): ITemplateFiles {
  const indexTs = `/**
 * ${name} — Full AWS infrastructure stack.
 *
 * Deploys: VPC + EKS + Route 53 + Secrets Manager + Platform Stack
 *
 * Usage:
 *   pulumi up
 */

import {
  createNetwork,
  createCluster,
  createDns,
  createSecrets,
  createPlatformStack,
} from "@reyemtech/nimbus";
import type { INetwork, ICluster, IDns, ISecrets } from "@reyemtech/nimbus";

// 1. Network — VPC with fck-nat (~$3/mo vs $32/mo managed NAT)
const network = createNetwork("${name}", {
  cloud: "aws",
  cidr: "10.0.0.0/16",
  natStrategy: "fck-nat",
  tags: { environment: "production", client: "acme" },
  providerOptions: {
    aws: { fckNatInstanceType: "t4g.nano", availabilityZoneCount: 2 },
  },
}) as INetwork;

// 2. Cluster — EKS with Auto Mode
const cluster = createCluster(
  "${name}",
  {
    cloud: "aws",
    version: "1.32",
    nodePools: [
      { name: "system", instanceType: "t4g.small", minNodes: 2, maxNodes: 3 },
      {
        name: "workers",
        instanceType: "c6a.large",
        minNodes: 1,
        maxNodes: 10,
        spot: true,
      },
    ],
    tags: { environment: "production", client: "acme" },
    providerOptions: { aws: { autoMode: true } },
  },
  network,
) as ICluster;

// 3. DNS — Route 53 hosted zone
const dns = createDns("${name}", {
  cloud: "aws",
  zoneName: "example.com",
  records: [
    { name: "app", type: "A", values: ["1.2.3.4"], ttl: 300 },
    { name: "www", type: "CNAME", values: ["app.example.com"], ttl: 300 },
  ],
}) as IDns;

// 4. Secrets — AWS Secrets Manager
const secrets = createSecrets("${name}", {
  cloud: "aws",
  backend: "aws-secrets-manager",
  tags: { environment: "production" },
}) as ISecrets;

secrets.putSecret("database", {
  host: "db.internal.example.com",
  password: "change-me-in-pulumi-config",
});

// 5. Platform — Helm components on the cluster
const platform = createPlatformStack("${name}", {
  cluster,
  domain: "example.com",
  externalDns: {
    dnsProvider: "route53",
    domainFilters: ["example.com"],
  },
  vault: { enabled: true, ingressHost: "vault.example.com" },
});

// Exports
export const vpcId = network.vpcId;
export const clusterEndpoint = cluster.endpoint;
export const zoneId = dns.zoneId;
export const nameServers = dns.nameServers;
export const platformName = Array.isArray(platform) ? platform[0]?.name : platform.name;
`;

  const readmeMd = `# ${name}

Full AWS infrastructure stack using the nimbus factory API.

## Components

- **Network** — VPC with public/private subnets and fck-nat (~$3/mo)
- **Cluster** — EKS with Auto Mode, system + spot worker pools
- **DNS** — Route 53 hosted zone with A and CNAME records
- **Secrets** — AWS Secrets Manager for database credentials
- **Platform** — Traefik, cert-manager, External DNS, Vault via Helm

## Architecture

\`\`\`mermaid
graph LR
  Internet((Internet))

  subgraph AWS["AWS"]
    R53[Route 53]
    SM[Secrets Manager]

    subgraph VPC["VPC 10.0.0.0/16"]
      NAT[fck-nat]

      subgraph EKS["EKS v1.32"]
        SYS[System Pool]
        WORK[Worker Pool spot]

        subgraph Platform["Platform Stack"]
          TRF[Traefik]
          CM[cert-manager]
          EDNS[External DNS]
          VLT[Vault]
        end
      end
    end
  end

  Internet --> TRF --> WORK
  EDNS --> R53
  VLT --> SM
  VPC --> NAT --> Internet
\`\`\`

${OPERATIONS_SECTION}
`;

  return { indexTs, readmeMd };
}

/**
 * Full Azure stack — VNet + AKS + Azure DNS + Key Vault + Platform.
 *
 * @param name - Project name substituted into resource names
 * @returns Template files
 */
export function azureTemplate(name: string): ITemplateFiles {
  const indexTs = `/**
 * ${name} — Full Azure infrastructure stack.
 *
 * Deploys: VNet + AKS + Azure DNS + Key Vault + Platform Stack
 *
 * Usage:
 *   pulumi up
 */

import {
  createNetwork,
  createCluster,
  createDns,
  createSecrets,
  createPlatformStack,
} from "@reyemtech/nimbus";
import type { INetwork, ICluster, IDns, ISecrets } from "@reyemtech/nimbus";

const resourceGroupName = "rg-${name}-canadacentral";

const azureOptions = {
  azure: {
    resourceGroupName,
    tenantId: "your-tenant-id",
  },
};

// 1. Network — VNet with NAT Gateway
const network = createNetwork("${name}", {
  cloud: "azure",
  cidr: "10.1.0.0/16",
  natStrategy: "managed",
  tags: { environment: "production", client: "acme" },
  providerOptions: azureOptions,
}) as INetwork;

// 2. Cluster — AKS with system + user node pools
const cluster = createCluster(
  "${name}",
  {
    cloud: "azure",
    version: "1.32",
    nodePools: [
      {
        name: "system",
        instanceType: "Standard_D2s_v5",
        minNodes: 2,
        maxNodes: 3,
        mode: "system",
      },
      {
        name: "workers",
        instanceType: "Standard_D4s_v5",
        minNodes: 1,
        maxNodes: 10,
        spot: true,
        mode: "user",
      },
    ],
    virtualNodes: true,
    tags: { environment: "production", client: "acme" },
    providerOptions: azureOptions,
  },
  network,
) as ICluster;

// 3. DNS — Azure DNS Zone
const dns = createDns("${name}", {
  cloud: "azure",
  zoneName: "example.com",
  records: [
    { name: "app", type: "A", values: ["1.2.3.4"], ttl: 300 },
    { name: "www", type: "CNAME", values: ["app.example.com"], ttl: 300 },
  ],
  providerOptions: azureOptions,
}) as IDns;

// 4. Secrets — Azure Key Vault
const secrets = createSecrets("${name}", {
  cloud: "azure",
  backend: "azure-key-vault",
  tags: { environment: "production" },
  providerOptions: azureOptions,
}) as ISecrets;

secrets.putSecret("database", {
  host: "db.internal.example.com",
  password: "change-me-in-pulumi-config",
});

// 5. Platform — Helm components on the cluster
const platform = createPlatformStack("${name}", {
  cluster,
  domain: "example.com",
  externalDns: {
    dnsProvider: "azure-dns",
    domainFilters: ["example.com"],
  },
  vault: { enabled: true, ingressHost: "vault.example.com" },
});

// Exports
export const vnetId = network.vpcId;
export const clusterEndpoint = cluster.endpoint;
export const zoneId = dns.zoneId;
export const nameServers = dns.nameServers;
export const platformName = Array.isArray(platform) ? platform[0]?.name : platform.name;
`;

  const readmeMd = `# ${name}

Full Azure infrastructure stack using the nimbus factory API.

## Components

- **Network** — VNet with NAT Gateway
- **Cluster** — AKS with system + spot user node pools and virtual nodes
- **DNS** — Azure DNS zone with A and CNAME records
- **Secrets** — Azure Key Vault for database credentials
- **Platform** — Traefik, cert-manager, External DNS, Vault via Helm

## Architecture

\`\`\`mermaid
graph LR
  Internet((Internet))

  subgraph Azure["Azure"]
    ADNS[Azure DNS]
    KV[Key Vault]

    subgraph VNet["VNet 10.1.0.0/16"]
      NAT[NAT Gateway]

      subgraph AKS["AKS v1.32"]
        SYS[System Pool]
        WORK[Worker Pool spot]

        subgraph Platform["Platform Stack"]
          TRF[Traefik]
          CM[cert-manager]
          EDNS[External DNS]
          VLT[Vault]
        end
      end
    end
  end

  Internet --> TRF --> WORK
  EDNS --> ADNS
  VLT --> KV
  VNet --> NAT --> Internet
\`\`\`

${OPERATIONS_SECTION}
`;

  return { indexTs, readmeMd };
}

/**
 * Multi-cloud template — AWS + Azure active-active with GLB.
 *
 * @param name - Project name substituted into resource names
 * @returns Template files
 */
export function multiCloudTemplate(name: string): ITemplateFiles {
  const indexTs = `/**
 * ${name} — Multi-cloud AWS + Azure active-active deployment.
 *
 * Deploys: Dual VPC/VNet + EKS/AKS + DNS + Platform + Global Load Balancer
 *
 * Usage:
 *   pulumi up
 */

import {
  createNetwork,
  createCluster,
  createDns,
  createPlatformStack,
  createGlobalLoadBalancer,
} from "@reyemtech/nimbus";
import type { INetwork, ICluster, IDns } from "@reyemtech/nimbus";

const resourceGroupName = "rg-${name}-canadacentral";

// Shared provider options
const providerOptions = {
  aws: { autoMode: true },
  azure: { resourceGroupName },
};

// 1. Networks — Auto-offset CIDRs: AWS gets 10.0.0.0/16, Azure gets 10.1.0.0/16
const networks = createNetwork("${name}", {
  cloud: [
    { provider: "aws", region: "us-east-1" },
    { provider: "azure", region: "canadacentral" },
  ],
  cidr: "10.0.0.0/16",
  natStrategy: "fck-nat",
  providerOptions,
}) as INetwork[];

// 2. Clusters — EKS + AKS, auto-matched to networks by provider
const clusters = createCluster(
  "${name}",
  {
    cloud: [
      { provider: "aws", region: "us-east-1" },
      { provider: "azure", region: "canadacentral" },
    ],
    version: "1.32",
    nodePools: [
      { name: "system", instanceType: "t4g.small", minNodes: 2, maxNodes: 3 },
      {
        name: "workers",
        instanceType: "c6a.large",
        minNodes: 2,
        maxNodes: 8,
        spot: true,
      },
    ],
    providerOptions,
  },
  networks,
) as ICluster[];

// 3. DNS — Route 53 hosted zone
const dns = createDns("${name}", {
  cloud: "aws",
  zoneName: "example.com",
}) as IDns;

// 4. Platform — Deploy to both clusters
createPlatformStack("${name}", {
  cluster: clusters,
  domain: "example.com",
  externalDns: {
    dnsProvider: "route53",
    domainFilters: ["example.com"],
  },
});

// 5. Global Load Balancer — Active-active across both clouds
const glb = createGlobalLoadBalancer("${name}", {
  strategy: "active-active",
  clusters,
  domain: "app.example.com",
  healthCheck: {
    path: "/health",
    port: 443,
    protocol: "HTTPS",
    intervalSeconds: 30,
    unhealthyThreshold: 3,
  },
  dnsProvider: "route53",
});

// Exports
export const awsVpcId = networks[0]?.vpcId;
export const azureVnetId = networks[1]?.vpcId;
export const awsEndpoint = clusters[0]?.endpoint;
export const azureEndpoint = clusters[1]?.endpoint;
export const glbEndpoint = glb.endpoint;
export const glbStrategy = glb.strategy;
export const dnsZoneId = dns.zoneId;
`;

  const readmeMd = `# ${name}

Multi-cloud AWS + Azure active-active deployment with Global Load Balancer.

## Components

- **Networks** — Auto-offset CIDRs (AWS: 10.0.0.0/16, Azure: 10.1.0.0/16)
- **Clusters** — EKS + AKS, same config, auto-matched to networks by provider
- **DNS** — Route 53 hosted zone
- **Platform** — Identical Helm stack deployed to both clusters
- **GLB** — Route 53 weighted routing with health checks across both clusters

## Architecture

\`\`\`mermaid
graph LR
  Internet((Internet))

  subgraph GLB["Global Load Balancer"]
    R53GLB[Route 53 GLB]
    HC1[Health Check AWS]
    HC2[Health Check Azure]
  end

  subgraph AWS["AWS (us-east-1)"]
    subgraph AWSVPC["VPC 10.0.0.0/16"]
      subgraph AWSEKS["EKS v1.32"]
        AWSTRF[Traefik]
        AWSWORK[Workers spot]
        AWSEDNS[External DNS]
      end
    end
  end

  subgraph AZ["Azure (canadacentral)"]
    subgraph AZVN["VNet 10.1.0.0/16"]
      subgraph AZAKS["AKS v1.32"]
        AZTRF[Traefik]
        AZWORK[Workers spot]
        AZEDNS[External DNS]
      end
    end
  end

  DNS[Route 53 DNS]

  Internet --> R53GLB
  R53GLB --> HC1 --> AWSTRF --> AWSWORK
  R53GLB --> HC2 --> AZTRF --> AZWORK
  AWSEDNS --> DNS
  AZEDNS --> DNS
\`\`\`

## How It Works

1. **Factory dispatch** — \`createNetwork("${name}", { cloud: ["aws", "azure"] })\` creates both VPC and VNet
2. **CIDR auto-offset** — Second cloud auto-increments to \`10.1.0.0/16\` to avoid overlaps
3. **Provider matching** — \`createCluster(...)\` matches each cluster to its network by provider
4. **GLB** — Route 53 weighted records distribute traffic 50/50, health checks failover automatically

${OPERATIONS_SECTION}
`;

  return { indexTs, readmeMd };
}
