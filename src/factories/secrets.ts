/**
 * Secrets factory — creates Secrets Manager/Key Vault via a single cloud-agnostic function.
 *
 * Dispatches to AWS or Azure based on the `cloud` parameter.
 *
 * @module factories/secrets
 */

import type { ISecrets, ISecretsConfig } from "../secrets";
import { resolveCloudTarget, UnsupportedFeatureError } from "../types";
import type { ResolvedCloudTarget } from "../types";
import type { IProviderOptions } from "./types";
import { isMultiCloud } from "./types";

/** Config for the createSecrets factory. */
export type ICreateSecretsConfig = ISecretsConfig & {
  readonly providerOptions?: IProviderOptions;
};

/**
 * Create a secrets store for one or more cloud providers.
 *
 * @param name - Resource name prefix
 * @param config - Secrets configuration with cloud target and optional providerOptions
 * @returns Single ISecrets for a single cloud target, array for multi-cloud
 * @throws {UnsupportedFeatureError} If the cloud provider is not supported or Azure options are missing
 *
 * @example
 * ```typescript
 * const secrets = await createSecrets("prod", {
 *   cloud: "aws",
 *   backend: "aws-secrets-manager",
 * });
 *
 * const secrets = await createSecrets("prod", {
 *   cloud: "azure",
 *   backend: "azure-key-vault",
 *   providerOptions: {
 *     azure: { resourceGroupName: "my-rg", tenantId: "..." },
 *   },
 * });
 * ```
 */
export async function createSecrets(
  name: string,
  config: ICreateSecretsConfig
): Promise<ISecrets | ISecrets[]> {
  if (!isMultiCloud(config.cloud)) {
    const target = resolveCloudTarget(config.cloud);
    return dispatchSecrets(name, config, target, config.providerOptions);
  }

  const targets = resolveCloudTarget(config.cloud);
  return Promise.all(
    targets.map((target) =>
      dispatchSecrets(`${name}-${target.provider}`, config, target, config.providerOptions)
    )
  );
}

async function dispatchSecrets(
  name: string,
  config: ISecretsConfig,
  target: ResolvedCloudTarget,
  opts?: IProviderOptions
): Promise<ISecrets> {
  const targetConfig = { ...config, cloud: { provider: target.provider, region: target.region } };

  switch (target.provider) {
    case "aws": {
      const { createAwsSecrets } = await import("../aws/index.js");
      return createAwsSecrets(name, targetConfig);
    }
    case "azure": {
      const azureOpts = opts?.azure;
      if (!azureOpts?.tenantId) {
        throw new UnsupportedFeatureError(
          "Azure requires providerOptions.azure with resourceGroupName and tenantId",
          "azure"
        );
      }
      const { createAzureSecrets } = await import("../azure/index.js");
      return createAzureSecrets(name, targetConfig, {
        resourceGroupName: azureOpts.resourceGroupName,
        tenantId: azureOpts.tenantId,
        objectId: azureOpts.objectId,
        sku: azureOpts.sku,
      });
    }
    default:
      throw new UnsupportedFeatureError("secrets", target.provider);
  }
}
