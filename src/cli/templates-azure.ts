/**
 * Azure project templates for `nimbus new`.
 *
 * Contains the minimal-azure, azure, and multi-cloud template generators,
 * split from templates.ts to keep files under the 500-line limit.
 *
 * @module cli/templates-azure
 */

import { OPERATIONS_SECTION } from "./templates.js";
import type { ITemplateFiles, ITemplateOptions } from "./templates.js";

/** Default Azure region used when no options are provided. */
const DEFAULT_AZURE_REGION = "canadacentral";

/**
 * Minimal Azure template — state backend + Key Vault, no cluster.
 *
 * @param name - Project name substituted into resource names
 * @param options - Optional template options with Azure configuration
 * @returns Template files
 */
export function minimalAzureTemplate(name: string, options?: ITemplateOptions): ITemplateFiles {
  const region = options?.azure?.region ?? DEFAULT_AZURE_REGION;
  const resourceGroupName = options?.azure?.resourceGroupName ?? `rg-${name}-${region}`;

  const indexTs = `/**
 * ${name} — Minimal Azure infrastructure.
 *
 * Deploys: Azure Blob state backend + Key Vault
 *
 * Usage:
 *   pulumi up
 */

import { createStateBackend, createSecrets, ensureResourceGroup } from "@reyemtech/nimbus";
import type { IStateBackend, ISecrets } from "@reyemtech/nimbus";

const tags = { environment: "production" };

// Resource group is declared automatically — created if new, no-op if exists
const resourceGroupName = ensureResourceGroup("${resourceGroupName}", { tags });

const azureOptions = {
  azure: {
    resourceGroupName,
  },
};

// 1. State Backend — Azure Blob Storage with versioning and encryption
const backend = createStateBackend("${name}", {
  cloud: "azure",
  versioning: true,
  encryption: true,
  tags,
  providerOptions: azureOptions,
}) as IStateBackend;

// 2. Secrets — Azure Key Vault (tenant ID auto-detected)
const secrets = createSecrets("${name}", {
  cloud: "azure",
  backend: "azure-key-vault",
  tags,
  providerOptions: azureOptions,
}) as ISecrets;

secrets.putSecret("database", {
  host: "db.internal.example.com",
  password: "change-me-in-pulumi-config",
});

// Stack outputs
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
 * Full Azure stack — VNet + AKS + Azure DNS + Key Vault + Platform.
 *
 * @param name - Project name substituted into resource names
 * @param options - Optional template options with Azure configuration
 * @returns Template files
 */
export function azureTemplate(name: string, options?: ITemplateOptions): ITemplateFiles {
  const region = options?.azure?.region ?? DEFAULT_AZURE_REGION;
  const resourceGroupName = options?.azure?.resourceGroupName ?? `rg-${name}-${region}`;

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
  ensureResourceGroup,
} from "@reyemtech/nimbus";
import type { INetwork, ICluster, IDns, ISecrets } from "@reyemtech/nimbus";

const tags = { environment: "production", client: "acme" };

// Resource group is declared automatically — created if new, no-op if exists
const resourceGroupName = ensureResourceGroup("${resourceGroupName}", { tags });

const azureOptions = {
  azure: {
    resourceGroupName,
  },
};

// 1. Network — VNet with NAT Gateway
const network = createNetwork("${name}", {
  cloud: "azure",
  cidr: "10.1.0.0/16",
  natStrategy: "managed",
  tags,
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
    tags,
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

// 4. Secrets — Azure Key Vault (tenant ID auto-detected)
const secrets = createSecrets("${name}", {
  cloud: "azure",
  backend: "azure-key-vault",
  tags,
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

// Stack outputs
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
 * @param options - Optional template options with Azure configuration
 * @returns Template files
 */
export function multiCloudTemplate(name: string, options?: ITemplateOptions): ITemplateFiles {
  const region = options?.azure?.region ?? DEFAULT_AZURE_REGION;
  const resourceGroupName = options?.azure?.resourceGroupName ?? `rg-${name}-${region}`;

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
  ensureResourceGroup,
} from "@reyemtech/nimbus";
import type { INetwork, ICluster, IDns } from "@reyemtech/nimbus";

// Resource group is declared automatically — created if new, no-op if exists
const resourceGroupName = ensureResourceGroup("${resourceGroupName}");

// Shared provider options
const providerOptions = {
  aws: { autoMode: true },
  azure: { resourceGroupName },
};

// 1. Networks — Auto-offset CIDRs: AWS gets 10.0.0.0/16, Azure gets 10.1.0.0/16
const networks = createNetwork("${name}", {
  cloud: [
    { provider: "aws", region: "us-east-1" },
    { provider: "azure", region: "${region}" },
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
      { provider: "azure", region: "${region}" },
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

// Stack outputs
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

  subgraph AZ["Azure (${region})"]
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
