/**
 * Multi-cloud example — AWS + Azure active-active deployment.
 *
 * Demonstrates: CIDR planning, dual-cloud provisioning, Global Load Balancer
 *
 * Usage:
 *   pulumi new typescript
 *   npm install @reyemtech/pulumi-any-cloud
 *   # Copy this file to index.ts
 *   pulumi up
 */

import {
  createAwsNetwork,
  createEksCluster,
  createAzureNetwork,
  createAksCluster,
  createRoute53Dns,
  createPlatformStack,
  createGlobalLoadBalancer,
  buildCidrMap,
  validateNoOverlaps,
} from "@reyemtech/pulumi-any-cloud";

const resourceGroupName = "rg-prod-canadacentral";

// ── CIDR Planning ──────────────────────────────────────────────────
// Auto-generate non-overlapping CIDRs for VPC peering / mesh
const cidrs = buildCidrMap(["aws", "azure"]);
// => { aws: "10.0.0.0/16", azure: "10.1.0.0/16" }

// Validate no overlaps (throws CidrError if any conflict)
validateNoOverlaps(Object.values(cidrs));

// ── AWS ────────────────────────────────────────────────────────────
const awsNetwork = createAwsNetwork("prod", {
  cloud: { provider: "aws", region: "us-east-1" },
  cidr: cidrs["aws"],
  natStrategy: "fck-nat",
  tags: { environment: "production" },
});

const awsCluster = createEksCluster(
  "prod",
  {
    cloud: { provider: "aws", region: "us-east-1" },
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
  },
  awsNetwork,
  { autoMode: true }
);

// ── Azure ──────────────────────────────────────────────────────────
const azureNetwork = createAzureNetwork(
  "prod",
  {
    cloud: { provider: "azure", region: "canadacentral" },
    cidr: cidrs["azure"],
    natStrategy: "managed",
    tags: { environment: "production" },
  },
  { resourceGroupName }
);

const azureCluster = createAksCluster(
  "prod",
  {
    cloud: { provider: "azure", region: "canadacentral" },
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
        minNodes: 2,
        maxNodes: 8,
        spot: true,
        mode: "user",
      },
    ],
  },
  azureNetwork,
  { resourceGroupName }
);

// ── DNS ────────────────────────────────────────────────────────────
const dns = createRoute53Dns("prod", {
  cloud: "aws",
  zoneName: "example.com",
});

// ── Platform Stack ─────────────────────────────────────────────────
// Deploy to both clusters
createPlatformStack("prod", {
  cluster: [awsCluster, azureCluster],
  domain: "example.com",
  externalDns: {
    dnsProvider: "route53",
    domainFilters: ["example.com"],
  },
});

// ── Global Load Balancer ───────────────────────────────────────────
const glb = createGlobalLoadBalancer("prod", {
  strategy: "active-active",
  clusters: [awsCluster, azureCluster],
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
export const awsVpcId = awsNetwork.vpcId;
export const azureVnetId = azureNetwork.vpcId;
export const awsEndpoint = awsCluster.endpoint;
export const azureEndpoint = azureCluster.endpoint;
export const glbEndpoint = glb.endpoint;
export const glbStrategy = glb.strategy;
export const dnsZoneId = dns.zoneId;
