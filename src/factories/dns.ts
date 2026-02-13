/**
 * DNS factory — creates Route 53/Azure DNS via a single cloud-agnostic function.
 *
 * Dispatches to AWS or Azure based on the `cloud` parameter.
 *
 * @module factories/dns
 */

import type { IDns, IDnsConfig } from "../dns";
import { resolveCloudTarget, UnsupportedFeatureError } from "../types";
import type { ResolvedCloudTarget } from "../types";
import type { IProviderOptions } from "./types";
import { isMultiCloud } from "./types";

/** Config for the createDns factory. */
export type ICreateDnsConfig = IDnsConfig & {
  readonly providerOptions?: IProviderOptions;
};

/**
 * Create a DNS zone for one or more cloud providers.
 *
 * @param name - Resource name prefix
 * @param config - DNS configuration with cloud target and optional providerOptions
 * @returns Single IDns for a single cloud target, array for multi-cloud
 *
 * @example
 * ```typescript
 * const dns = await createDns("prod", {
 *   cloud: "aws",
 *   zoneName: "example.com",
 * });
 * ```
 */
export async function createDns(name: string, config: ICreateDnsConfig): Promise<IDns | IDns[]> {
  if (!isMultiCloud(config.cloud)) {
    const target = resolveCloudTarget(config.cloud);
    return dispatchDns(name, config, target, config.providerOptions);
  }

  const targets = resolveCloudTarget(config.cloud);
  return Promise.all(
    targets.map((target) =>
      dispatchDns(`${name}-${target.provider}`, config, target, config.providerOptions)
    )
  );
}

async function dispatchDns(
  name: string,
  config: IDnsConfig,
  target: ResolvedCloudTarget,
  opts?: IProviderOptions
): Promise<IDns> {
  const targetConfig = { ...config, cloud: { provider: target.provider, region: target.region } };

  switch (target.provider) {
    case "aws": {
      const { createRoute53Dns } = await import("../aws/index.js");
      return createRoute53Dns(name, targetConfig);
    }
    case "azure": {
      const azureOpts = opts?.azure;
      if (!azureOpts) {
        throw new UnsupportedFeatureError(
          "Azure requires providerOptions.azure.resourceGroupName",
          "azure"
        );
      }
      const { createAzureDns } = await import("../azure/index.js");
      return createAzureDns(name, targetConfig, {
        resourceGroupName: azureOpts.resourceGroupName,
      });
    }
    default:
      throw new UnsupportedFeatureError("dns", target.provider);
  }
}
