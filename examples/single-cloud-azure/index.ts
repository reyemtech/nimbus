/**
 * Single-cloud Azure example — deploys a full stack on Azure.
 *
 * Demonstrates: VNet + AKS + Azure DNS + Key Vault + Platform Stack
 *
 * Usage:
 *   pulumi new typescript
 *   npm install @reyemtech/pulumi-any-cloud
 *   # Copy this file to index.ts
 *   pulumi up
 */

import {
  createAzureNetwork,
  createAksCluster,
  createAzureDns,
  createAzureSecrets,
  createPlatformStack,
} from "@reyemtech/pulumi-any-cloud";

const resourceGroupName = "rg-prod-canadacentral";

// 1. Network — VNet with NAT Gateway
const network = createAzureNetwork(
  "prod",
  {
    cloud: "azure",
    cidr: "10.1.0.0/16",
    natStrategy: "managed",
    tags: { environment: "production", client: "acme" },
  },
  { resourceGroupName }
);

// 2. Cluster — AKS with system + user node pools
const cluster = createAksCluster(
  "prod",
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
  },
  network,
  { resourceGroupName }
);

// 3. DNS — Azure DNS Zone
const dns = createAzureDns(
  "prod",
  {
    cloud: "azure",
    zoneName: "example.com",
    records: [
      { name: "app", type: "A", values: ["1.2.3.4"], ttl: 300 },
      { name: "www", type: "CNAME", values: ["app.example.com"], ttl: 300 },
    ],
  },
  { resourceGroupName }
);

// 4. Secrets — Azure Key Vault
const secrets = createAzureSecrets(
  "prod",
  {
    cloud: "azure",
    backend: "azure-key-vault",
    tags: { environment: "production" },
  },
  { resourceGroupName, tenantId: "your-tenant-id" }
);

secrets.putSecret("database", {
  host: "db.internal.example.com",
  password: "change-me-in-pulumi-config",
});

// 5. Platform — Helm components on the cluster
const platform = createPlatformStack("prod", {
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
