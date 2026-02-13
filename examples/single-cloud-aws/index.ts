/**
 * Single-cloud AWS example — deploys a full stack on AWS.
 *
 * Demonstrates: VPC + EKS + Route 53 + Secrets Manager + Platform Stack
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
  createRoute53Dns,
  createAwsSecrets,
  createPlatformStack,
} from "@reyemtech/pulumi-any-cloud";

// 1. Network — VPC with fck-nat (~$3/mo vs $32/mo managed NAT)
const network = createAwsNetwork("prod", {
  cloud: "aws",
  cidr: "10.0.0.0/16",
  natStrategy: "fck-nat",
  tags: { environment: "production", client: "acme" },
});

// 2. Cluster — EKS with Auto Mode
const cluster = createEksCluster(
  "prod",
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
  },
  network,
  { autoMode: true }
);

// 3. DNS — Route 53 hosted zone
const dns = createRoute53Dns("prod", {
  cloud: "aws",
  zoneName: "example.com",
  records: [
    { name: "app", type: "A", values: ["1.2.3.4"], ttl: 300 },
    { name: "www", type: "CNAME", values: ["app.example.com"], ttl: 300 },
  ],
});

// 4. Secrets — AWS Secrets Manager
const secrets = createAwsSecrets("prod", {
  cloud: "aws",
  backend: "aws-secrets-manager",
  tags: { environment: "production" },
});

secrets.putSecret("database", {
  host: "db.internal.example.com",
  password: "change-me-in-pulumi-config",
});

// 5. Platform — Helm components on the cluster
const platform = createPlatformStack("prod", {
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
