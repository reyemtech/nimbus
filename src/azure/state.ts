/**
 * Azure Blob state backend implementation with BCDR features.
 *
 * Creates an Azure Storage Account + Blob Container for Pulumi state
 * storage with versioning, encryption, and optional geo-replication.
 *
 * @module azure/state
 */

import * as azure from "@pulumi/azure-native";
import type * as pulumi from "@pulumi/pulumi";
import type { IStateBackend, IStateBackendConfig } from "../state";
import { resolveCloudTarget } from "../types";

/** Max base length for storage account names (leaves room for "state" suffix, total 3-24). */
const STORAGE_ACCOUNT_NAME_MAX_BASE_LENGTH = 18;

/** Azure-specific state backend options. */
export interface IAzureStateBackendOptions {
  /** Resource group name. Required for Azure. */
  readonly resourceGroupName: pulumi.Input<string>;
}

/**
 * Create an Azure Blob state backend with BCDR features.
 *
 * @example
 * ```typescript
 * const state = createAzureStateBackend("prod", {
 *   cloud: "azure",
 *   versioning: true,
 *   encryption: true,
 *   replication: { enabled: true },
 * }, { resourceGroupName: "my-rg" });
 * ```
 */
export function createAzureStateBackend(
  name: string,
  config: IStateBackendConfig,
  options: IAzureStateBackendOptions
): IStateBackend {
  const cloud = Array.isArray(config.cloud) ? (config.cloud[0] ?? "azure") : config.cloud;
  const target = resolveCloudTarget(cloud);

  const tags = config.tags ?? {};
  const versioning = config.versioning ?? true;
  const replication = config.replication ?? { enabled: false };
  const rgName = options.resourceGroupName;

  // Storage account name: lowercase alphanumeric, 3-24 chars
  const accountNameBase = name
    .replace(/[^a-z0-9]/g, "")
    .substring(0, STORAGE_ACCOUNT_NAME_MAX_BASE_LENGTH);

  // GRS for geo-replication, LRS otherwise
  const skuName = replication.enabled ? "Standard_GRS" : "Standard_LRS";

  const storageAccount = new azure.storage.StorageAccount(`${name}-state-sa`, {
    accountName: `${accountNameBase}state`,
    resourceGroupName: rgName,
    kind: "StorageV2",
    sku: { name: skuName },
    enableHttpsTrafficOnly: true,
    minimumTlsVersion: "TLS1_2",
    allowBlobPublicAccess: false,
    tags: { ...tags, Name: `${name}-state` },
  });

  // Blob container for state files
  const containerName = "pulumistate";
  const container = new azure.storage.BlobContainer(`${name}-state-container`, {
    containerName,
    accountName: storageAccount.name,
    resourceGroupName: rgName,
    publicAccess: "None",
  });

  // Enable blob versioning
  if (versioning) {
    new azure.storage.BlobServiceProperties(`${name}-state-blob-props`, {
      accountName: storageAccount.name,
      resourceGroupName: rgName,
      blobServicesName: "default",
      isVersioningEnabled: true,
    });
  }

  return {
    name,
    cloud: target,
    backendType: "azblob",
    backendUrl: container.name.apply((c) => `azblob://${c}`),
    bucketName: container.name,
    storageAccountName: storageAccount.name,
    versioning,
    encryption: true, // Azure encrypts at rest by default
    replicationEnabled: replication.enabled,
    nativeResource: storageAccount,
  };
}
