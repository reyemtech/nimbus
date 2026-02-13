/**
 * State backend factory — creates S3/Azure Blob state storage via a single cloud-agnostic function.
 *
 * Dispatches to AWS or Azure based on the `cloud` parameter.
 *
 * @module factories/state
 */

import type { IStateBackend, IStateBackendConfig } from "../state";
import { resolveCloudTarget, UnsupportedFeatureError } from "../types";
import type { ResolvedCloudTarget } from "../types";
import type { IProviderOptions } from "./types";
import { isMultiCloud } from "./types";
import { createAwsStateBackend } from "../aws/index.js";
import { createAzureStateBackend } from "../azure/index.js";

/** Config for the createStateBackend factory. */
export type ICreateStateBackendConfig = IStateBackendConfig & {
  readonly providerOptions?: IProviderOptions;
};

/**
 * Create a state backend (S3/Azure Blob) for one or more cloud providers.
 *
 * @param name - Resource name prefix
 * @param config - State backend configuration with cloud target and optional providerOptions
 * @returns Single IStateBackend for a single cloud target, array for multi-cloud
 * @throws {UnsupportedFeatureError} If the cloud provider is not supported or Azure options are missing
 *
 * @example
 * ```typescript
 * const state = createStateBackend("prod", {
 *   cloud: "aws",
 *   versioning: true,
 *   encryption: true,
 *   locking: { enabled: true },
 * });
 * ```
 */
export function createStateBackend(
  name: string,
  config: ICreateStateBackendConfig
): IStateBackend | IStateBackend[] {
  if (!isMultiCloud(config.cloud)) {
    const target = resolveCloudTarget(config.cloud);
    return dispatchStateBackend(name, config, target, config.providerOptions);
  }

  const targets = resolveCloudTarget(config.cloud);
  return targets.map((target) =>
    dispatchStateBackend(`${name}-${target.provider}`, config, target, config.providerOptions)
  );
}

function dispatchStateBackend(
  name: string,
  config: IStateBackendConfig,
  target: ResolvedCloudTarget,
  opts?: IProviderOptions
): IStateBackend {
  const targetConfig = { ...config, cloud: { provider: target.provider, region: target.region } };

  switch (target.provider) {
    case "aws": {
      return createAwsStateBackend(name, targetConfig, {
        kmsKeyArn: opts?.aws?.stateKmsKeyArn,
        forceDestroy: opts?.aws?.stateForceDestroy,
      });
    }
    case "azure": {
      const azureOpts = opts?.azure;
      if (!azureOpts) {
        throw new UnsupportedFeatureError(
          "Azure requires providerOptions.azure.resourceGroupName",
          "azure"
        );
      }
      return createAzureStateBackend(name, targetConfig, {
        resourceGroupName: azureOpts.resourceGroupName,
      });
    }
    default:
      throw new UnsupportedFeatureError("state-backend", target.provider);
  }
}
