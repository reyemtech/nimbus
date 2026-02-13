/**
 * Azure Key Vault implementation.
 *
 * @module azure/secrets
 */

import * as azure from "@pulumi/azure-native";
import * as pulumi from "@pulumi/pulumi";
import type { ISecretRef, ISecrets, ISecretsConfig } from "../secrets";
import { resolveCloudTarget } from "../types";

/** Maximum length for Azure Key Vault names (3-24 chars, alphanumeric + hyphens). */
const KEY_VAULT_NAME_MAX_LENGTH = 24;

/** Default soft-delete retention period in days for Key Vault. */
const SOFT_DELETE_RETENTION_DAYS = 90;

/** Well-known role definition ID for Key Vault Secrets Officer. */
const KEY_VAULT_SECRETS_OFFICER_ROLE_ID = "b86a8fe4-44ce-4948-aee5-eccb2c155cd7";

/** Azure-specific secrets options. */
export interface IAzureSecretsOptions {
  /** Resource group name. Required for Azure. */
  readonly resourceGroupName: pulumi.Input<string>;
  /** Azure AD tenant ID. Auto-detected via `getClientConfigOutput()` when omitted. */
  readonly tenantId?: pulumi.Input<string>;
  /** Object ID of the principal that should have access to secrets. */
  readonly objectId?: pulumi.Input<string>;
  /** Key Vault SKU. Default: "standard". */
  readonly sku?: "standard" | "premium";
}

/**
 * Create an Azure Key Vault for secret management.
 *
 * When `tenantId` is omitted, it is auto-detected from the current Azure
 * identity via `getClientConfigOutput()`. A Key Vault Secrets Officer RBAC
 * role assignment is automatically created for the deploying principal.
 *
 * @example
 * ```typescript
 * const secrets = createAzureSecrets("prod", {
 *   cloud: "azure",
 *   backend: "azure-key-vault",
 * }, {
 *   resourceGroupName: "my-rg",
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

  // Auto-detect tenantId from current Azure identity when not provided
  const clientConfig = azure.authorization.getClientConfigOutput();
  const tenantId = options.tenantId ?? clientConfig.tenantId;

  // Key Vault names must be 3-24 chars, alphanumeric + hyphens
  const vaultName = name.replace(/[^a-zA-Z0-9-]/g, "-").substring(0, KEY_VAULT_NAME_MAX_LENGTH);

  const accessPolicies: azure.types.input.keyvault.AccessPolicyEntryArgs[] = [];
  if (options.objectId) {
    accessPolicies.push({
      tenantId,
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
      tenantId,
      sku: {
        family: "A",
        name:
          options.sku === "premium"
            ? azure.keyvault.SkuName.Premium
            : azure.keyvault.SkuName.Standard,
      },
      enableSoftDelete: true,
      softDeleteRetentionInDays: SOFT_DELETE_RETENTION_DAYS,
      enableRbacAuthorization: true,
      accessPolicies,
    },
    tags: { ...tags, Name: `${name}-kv` },
  });

  // Grant the deploying principal Key Vault Secrets Officer on this vault
  new azure.authorization.RoleAssignment(`${name}-kv-secrets-officer`, {
    principalId: clientConfig.objectId,
    roleDefinitionId: clientConfig.subscriptionId.apply(
      (sub) =>
        `/subscriptions/${sub}/providers/Microsoft.Authorization/roleDefinitions/${KEY_VAULT_SECRETS_OFFICER_ROLE_ID}`
    ),
    scope: vault.id,
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
