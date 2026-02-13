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
import { createAwsSecrets } from "../aws/index.js";
import { createAzureSecrets } from "../azure/index.js";

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
 * const secrets = createSecrets("prod", {
 *   cloud: "aws",
 *   backend: "aws-secrets-manager",
 * });
 *
 * const secrets = createSecrets("prod", {
 *   cloud: "azure",
 *   backend: "azure-key-vault",
 *   providerOptions: {
 *     azure: { resourceGroupName: "my-rg" },
 *   },
 * });
 * ```
 */
export function createSecrets(name: string, config: ICreateSecretsConfig): ISecrets | ISecrets[] {
  if (!isMultiCloud(config.cloud)) {
    const target = resolveCloudTarget(config.cloud);
    return dispatchSecrets(name, config, target, config.providerOptions);
  }

  const targets = resolveCloudTarget(config.cloud);
  return targets.map((target) =>
    dispatchSecrets(`${name}-${target.provider}`, config, target, config.providerOptions)
  );
}

function dispatchSecrets(
  name: string,
  config: ISecretsConfig,
  target: ResolvedCloudTarget,
  opts?: IProviderOptions
): ISecrets {
  const targetConfig = { ...config, cloud: { provider: target.provider, region: target.region } };

  switch (target.provider) {
    case "aws": {
      return createAwsSecrets(name, targetConfig);
    }
    case "azure": {
      const azureOpts = opts?.azure;
      if (!azureOpts) {
        throw new UnsupportedFeatureError(
          "Azure requires providerOptions.azure with resourceGroupName",
          "azure"
        );
      }
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
