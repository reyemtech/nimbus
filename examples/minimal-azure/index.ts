/**
 * Minimal Azure example — state backend + secrets, no cluster.
 *
 * Demonstrates: Azure Blob state backend + Key Vault
 * Ideal for: CTO vault analysis, lightweight infra, or pre-cluster setup.
 *
 * Usage:
 *   pulumi new typescript
 *   npm install @reyemtech/nimbus @pulumi/azure-native
 *   # Copy this file to index.ts
 *   pulumi up
 */

import { createStateBackend, createSecrets } from "@reyemtech/nimbus";
import type { IStateBackend, ISecrets } from "@reyemtech/nimbus";

const resourceGroupName = "rg-prod-canadacentral";

const azureOptions = {
  azure: { resourceGroupName },
};

// 1. State Backend — Azure Blob Storage with versioning and encryption
const backend = createStateBackend("prod", {
  cloud: "azure",
  versioning: true,
  encryption: true,
  tags: { environment: "production" },
  providerOptions: azureOptions,
}) as IStateBackend;

// 2. Secrets — Azure Key Vault
const secrets = createSecrets("prod", {
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
