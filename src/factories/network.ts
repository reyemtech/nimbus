/**
 * Network factory — creates VPC/VNet via a single cloud-agnostic function.
 *
 * Dispatches to AWS or Azure based on the `cloud` parameter.
 * For multi-cloud arrays, auto-offsets CIDRs and returns an array.
 *
 * @module factories/network
 */

import type { INetwork, INetworkConfig } from "../network";
import { autoOffsetCidrs, parseCidr } from "../network";
import { resolveCloudTarget, UnsupportedFeatureError } from "../types";
import type { ResolvedCloudTarget } from "../types";
import type { IProviderOptions } from "./types";
import { isMultiCloud } from "./types";

/** Config for the createNetwork factory. */
export type ICreateNetworkConfig = INetworkConfig & {
  readonly providerOptions?: IProviderOptions;
};

/**
 * Create a network (VPC/VNet) for one or more cloud providers.
 *
 * @param name - Resource name prefix
 * @param config - Network configuration with cloud target and optional providerOptions
 * @returns Single INetwork for a single cloud target, array for multi-cloud
 * @throws {UnsupportedFeatureError} If the cloud provider is not supported or Azure options are missing
 *
 * @example
 * ```typescript
 * // Single cloud
 * const network = await createNetwork("prod", {
 *   cloud: "aws",
 *   cidr: "10.0.0.0/16",
 *   natStrategy: "fck-nat",
 * });
 *
 * // Multi-cloud
 * const networks = await createNetwork("prod", {
 *   cloud: ["aws", "azure"],
 *   cidr: "10.0.0.0/16",
 *   providerOptions: { azure: { resourceGroupName: "my-rg" } },
 * });
 * ```
 */
export async function createNetwork(
  name: string,
  config: ICreateNetworkConfig
): Promise<INetwork | INetwork[]> {
  if (!isMultiCloud(config.cloud)) {
    const target = resolveCloudTarget(config.cloud);
    return dispatchNetwork(name, config, target, config.providerOptions);
  }

  const targets = resolveCloudTarget(config.cloud);
  const cidrs = resolveMultiCloudCidrs(config.cidr, targets.length);

  return Promise.all(
    targets.map((target, i) => {
      const perTargetConfig = { ...config, cloud: config.cloud, cidr: cidrs[i] };
      return dispatchNetwork(
        `${name}-${target.provider}`,
        perTargetConfig,
        target,
        config.providerOptions
      );
    })
  );
}

async function dispatchNetwork(
  name: string,
  config: INetworkConfig,
  target: ResolvedCloudTarget,
  opts?: IProviderOptions
): Promise<INetwork> {
  const targetConfig = { ...config, cloud: { provider: target.provider, region: target.region } };

  switch (target.provider) {
    case "aws": {
      const { createAwsNetwork } = await import("../aws/index.js");
      return createAwsNetwork(name, targetConfig, opts?.aws);
    }
    case "azure": {
      const azureOpts = opts?.azure;
      if (!azureOpts) {
        throw new UnsupportedFeatureError(
          "Azure requires providerOptions.azure.resourceGroupName",
          "azure"
        );
      }
      const { createAzureNetwork } = await import("../azure/index.js");
      return createAzureNetwork(name, targetConfig, {
        resourceGroupName: azureOpts.resourceGroupName,
        subnetCount: azureOpts.subnetCount,
      });
    }
    default:
      throw new UnsupportedFeatureError("network", target.provider);
  }
}

/**
 * Resolve CIDRs for multi-cloud deployment.
 * If a single CIDR is provided, auto-offset for each target.
 * If no CIDR, use defaults.
 */
function resolveMultiCloudCidrs(cidr: string | undefined, count: number): ReadonlyArray<string> {
  if (!cidr) {
    return autoOffsetCidrs(count);
  }

  const parsed = parseCidr(cidr);
  const secondOctet = (parsed.start >>> 16) & 0xff;
  return autoOffsetCidrs(count, { base: secondOctet });
}
