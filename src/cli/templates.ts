/**
 * Embedded project templates for `nimbus new`.
 *
 * Each template function returns the contents for `index.ts` and `README.md`
 * with the project name substituted into resource names.
 *
 * Azure templates are in `templates-azure.ts` (split to stay under 500 lines).
 *
 * @module cli/templates
 */

import { minimalAzureTemplate, azureTemplate, multiCloudTemplate } from "./templates-azure.js";

/** Shape returned by every template function. */
export interface ITemplateFiles {
  readonly indexTs: string;
  readonly readmeMd: string;
}

/** Optional configuration passed to template generators. */
export interface ITemplateOptions {
  readonly azure?: {
    readonly region: string;
    readonly resourceGroupName: string;
  };
}

/** Template metadata including provider dependencies. */
export interface ITemplateInfo {
  readonly description: string;
  readonly providers: ReadonlyArray<string>;
  readonly generate: (name: string, options?: ITemplateOptions) => ITemplateFiles;
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
export const OPERATIONS_SECTION = `## Operations

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
//
// // TODO: Define your cloud target
// const cloud = "aws";
//
// // TODO: Create resources
// const network = createNetwork("${name}", { cloud, cidr: "10.0.0.0/16" }) as INetwork;
//
// // Stack outputs
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

// Stack outputs
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

// Stack outputs
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
