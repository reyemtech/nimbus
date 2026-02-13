/**
 * Resource group abstraction — declare once, reuse across all Azure resources.
 *
 * Caches by name so multiple factories referencing the same resource group
 * share a single Pulumi resource declaration. Idempotent by design:
 * Pulumi handles create/update/no-op on each `pulumi up`.
 *
 * @module azure/resource-group
 */

import * as azure from "@pulumi/azure-native/resources";
import type * as pulumi from "@pulumi/pulumi";

/** Cache of declared resource groups, keyed by name. */
const cache = new Map<string, azure.ResourceGroup>();

/** Options for {@link ensureResourceGroup}. */
export interface IResourceGroupOptions {
  /** Tags to apply to the resource group. */
  readonly tags?: Record<string, string>;
  /** Azure location override. Defaults to the Pulumi-configured region. */
  readonly location?: pulumi.Input<string>;
}

/**
 * Ensure a resource group is declared in the Pulumi stack.
 *
 * First call creates the Pulumi resource; subsequent calls with the
 * same name return the cached reference. This is pure declaration —
 * Pulumi decides whether to create, update, or skip at deploy time.
 *
 * @param name - Desired resource group name in Azure (e.g. "rg-myapp-canadacentral")
 * @param opts - Optional tags and location override
 * @returns The ResourceGroup's name as a Pulumi Output (for dependency chaining)
 *
 * @example
 * ```typescript
 * const rgName = ensureResourceGroup("rg-prod-canadacentral", {
 *   tags: { environment: "production" },
 * });
 * ```
 */
export function ensureResourceGroup(
  name: string,
  opts?: IResourceGroupOptions
): pulumi.Output<string> {
  const existing = cache.get(name);
  if (existing) return existing.name;

  const rg = new azure.ResourceGroup(`nimbus-rg-${name}`, {
    resourceGroupName: name,
    location: opts?.location,
    tags: opts?.tags,
  });

  cache.set(name, rg);
  return rg.name;
}
