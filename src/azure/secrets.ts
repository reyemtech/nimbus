/**
 * Azure Key Vault implementation.
 *
 * @module azure/secrets
 */

import * as azure from "@pulumi/azure-native";
import * as pulumi from "@pulumi/pulumi";
import type { ISecretRef, ISecrets, ISecretsConfig } from "../secrets";
import { resolveCloudTarget } from "../types";

/** Azure-specific secrets options. */
export interface IAzureSecretsOptions {
  /** Resource group name. Required for Azure. */
  readonly resourceGroupName: pulumi.Input<string>;
  /** Azure AD tenant ID. Required for Key Vault access policies. */
  readonly tenantId: pulumi.Input<string>;
  /** Object ID of the principal that should have access to secrets. */
  readonly objectId?: pulumi.Input<string>;
  /** Key Vault SKU. Default: "standard". */
  readonly sku?: "standard" | "premium";
}

/**
 * Create an Azure Key Vault for secret management.
 *
 * @example
 * ```typescript
 * const secrets = createAzureSecrets("prod", {
 *   cloud: "azure",
 *   backend: "azure-key-vault",
 * }, {
 *   resourceGroupName: "my-rg",
 *   tenantId: "00000000-0000-0000-0000-000000000000",
 * });
 *
 * secrets.putSecret("database", { host: "db.example.com", password: dbPassword });
 * const pw = secrets.getSecretRef({ path: "database", key: "password" });
 * ```
 */
export function createAzureSecrets(
  name: string,
  config: ISecretsConfig,
  options: IAzureSecretsOptions
): ISecrets {
  const cloud = Array.isArray(config.cloud) ? (config.cloud[0] ?? "azure") : config.cloud;
  const target = resolveCloudTarget(cloud);

  const tags = config.tags ?? {};
  const rgName = options.resourceGroupName;

  // Key Vault names must be 3-24 chars, alphanumeric + hyphens
  const vaultName = name.replace(/[^a-zA-Z0-9-]/g, "-").substring(0, 24);

  const accessPolicies: azure.types.input.keyvault.AccessPolicyEntryArgs[] = [];
  if (options.objectId) {
    accessPolicies.push({
      tenantId: options.tenantId,
      objectId: options.objectId,
      permissions: {
        secrets: ["Get", "List", "Set", "Delete"],
      },
    });
  }

  const vault = new azure.keyvault.Vault(`${name}-kv`, {
    vaultName,
    resourceGroupName: rgName,
    properties: {
      tenantId: options.tenantId,
      sku: {
        family: "A",
        name:
          options.sku === "premium"
            ? azure.keyvault.SkuName.Premium
            : azure.keyvault.SkuName.Standard,
      },
      enableSoftDelete: true,
      softDeleteRetentionInDays: 90,
      enableRbacAuthorization: true,
      accessPolicies,
    },
    tags: { ...tags, Name: `${name}-kv` },
  });

  // Track created secrets for getSecretRef lookups
  const secretResources = new Map<string, azure.keyvault.Secret>();

  return {
    name,
    cloud: target,
    backend: "azure-key-vault",
    nativeResource: vault,

    putSecret(path: string, data: Record<string, pulumi.Input<string>>): void {
      // Azure Key Vault stores one value per secret, so we JSON-encode multi-key data
      const secretValue = pulumi.all(data).apply((resolved) => JSON.stringify(resolved));
      // Key Vault secret names: alphanumeric + hyphens
      const secretName = path.replace(/[^a-zA-Z0-9-]/g, "-");

      const secret = new azure.keyvault.Secret(`${name}-${secretName}`, {
        secretName,
        vaultName: vault.name,
        resourceGroupName: rgName,
        properties: {
          value: secretValue,
          contentType: "application/json",
        },
        tags: { ...tags, path },
      });

      secretResources.set(path, secret);
    },

    getSecretRef(ref: ISecretRef): pulumi.Output<string> {
      const secret = secretResources.get(ref.path);
      const { key } = ref;

      if (!secret) {
        // Lookup existing secret by name convention
        const secretName = ref.path.replace(/[^a-zA-Z0-9-]/g, "-");
        const lookup = azure.keyvault.getSecretOutput({
          secretName,
          vaultName: vault.name,
          resourceGroupName: rgName,
        });

        if (key) {
          return lookup.properties.apply((props) => {
            const parsed = JSON.parse(props.value ?? "{}") as Record<string, string>;
            return parsed[key] ?? "";
          });
        }
        return lookup.properties.apply((props) => props.value ?? "");
      }

      if (key) {
        return secret.properties.apply((props) => {
          const parsed = JSON.parse(props.value ?? "{}") as Record<string, string>;
          return parsed[key] ?? "";
        });
      }
      return secret.properties.apply((props) => props.value ?? "");
    },
  };
}
