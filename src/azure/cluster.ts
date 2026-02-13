/**
 * Azure AKS cluster implementation.
 *
 * Supports system + user node pools, spot instances, and
 * Azure Container Instances virtual node.
 *
 * @module azure/cluster
 */

import * as azure from "@pulumi/azure-native";
import * as k8s from "@pulumi/kubernetes";
import type * as pulumi from "@pulumi/pulumi";
import type { ICluster, IClusterConfig } from "../cluster";
import type { INetwork } from "../network";
import { resolveCloudTarget } from "../types";

/** Azure-specific AKS options beyond the base config. */
export interface IAksOptions {
  /** Resource group name. Required for Azure. */
  readonly resourceGroupName: pulumi.Input<string>;
  /** Enable Azure CNI networking (vs kubenet). Default: true. */
  readonly azureCni?: boolean;
  /** Enable virtual node (ACI). Default: false. */
  readonly virtualNodes?: boolean;
  /** Azure AD tenant ID for RBAC integration. */
  readonly aadTenantId?: string;
  /** DNS prefix for the cluster FQDN. Default: cluster name. */
  readonly dnsPrefix?: string;
}

/**
 * Create an AKS cluster with system + user node pools.
 *
 * @example
 * ```typescript
 * const cluster = createAksCluster("prod", {
 *   cloud: "azure",
 *   version: "1.32",
 *   nodePools: [
 *     { name: "system", instanceType: "Standard_D2pds_v6", minNodes: 2, maxNodes: 5, mode: "system" },
 *     { name: "workers", instanceType: "Standard_D2pds_v6", minNodes: 2, maxNodes: 8, spot: true },
 *   ],
 * }, network, {
 *   resourceGroupName: "my-rg",
 *   virtualNodes: true,
 * });
 * ```
 */
export function createAksCluster(
  name: string,
  config: IClusterConfig,
  network: INetwork,
  options: IAksOptions
): ICluster {
  const cloud = Array.isArray(config.cloud) ? (config.cloud[0] ?? "azure") : config.cloud;
  const target = resolveCloudTarget(cloud);

  const tags = config.tags ?? {};
  const rgName = options.resourceGroupName;
  const dnsPrefix = options.dnsPrefix ?? name;
  const enableVirtualNodes = options.virtualNodes ?? config.virtualNodes ?? false;

  // Build agent pool profiles from node pool config
  const agentPoolProfiles = config.nodePools.map((np) => ({
    name: np.name.substring(0, 12), // AKS pool names max 12 chars
    vmSize: np.instanceType,
    count: np.desiredNodes ?? np.minNodes,
    minCount: np.minNodes,
    maxCount: np.maxNodes,
    enableAutoScaling: true,
    mode: (np.mode ?? "User") as "System" | "User",
    osType: "Linux" as const,
    osDiskSizeGB: 128,
    vnetSubnetId: network.privateSubnetIds.apply((ids) => ids[0] ?? ""),
    scaleSetPriority: np.spot ? ("Spot" as const) : ("Regular" as const),
    scaleSetEvictionPolicy: np.spot ? ("Delete" as const) : undefined,
    spotMaxPrice: np.spot ? -1 : undefined,
    nodeTaints: np.taints?.map((t) => `${t.key}=${t.value}:${t.effect}`) ?? [],
    nodeLabels: np.labels ?? {},
    type: "VirtualMachineScaleSets" as const,
  }));

  // AKS add-on profiles
  const addonProfiles: Record<string, { enabled: boolean; config?: Record<string, string> }> = {};

  if (enableVirtualNodes) {
    addonProfiles["aciConnectorLinux"] = {
      enabled: true,
      config: {
        SubnetName: "aci-subnet",
      },
    };
  }

  const cluster = new azure.containerservice.ManagedCluster(`${name}-aks`, {
    resourceName: name,
    resourceGroupName: rgName,
    dnsPrefix,
    kubernetesVersion: config.version,
    agentPoolProfiles,
    identity: { type: "SystemAssigned" },
    networkProfile: {
      networkPlugin: options.azureCni !== false ? "azure" : "kubenet",
      serviceCidr: "10.240.0.0/16",
      dnsServiceIP: "10.240.0.10",
    },
    addonProfiles,
    tags: { ...tags, Name: name },
  });

  // Build kubeconfig from AKS cluster credentials
  const creds = azure.containerservice.listManagedClusterUserCredentialsOutput({
    resourceGroupName: rgName,
    resourceName: cluster.name,
  });

  const kubeconfig = creds.kubeconfigs.apply((configs) => {
    const kc = configs[0];
    if (!kc?.value) {
      return "";
    }
    return Buffer.from(kc.value, "base64").toString("utf-8");
  });

  const provider = new k8s.Provider(`${name}-k8s`, {
    kubeconfig,
  });

  return {
    name,
    cloud: target,
    endpoint: cluster.fqdn.apply((fqdn) => `https://${fqdn ?? ""}`),
    kubeconfig,
    version: cluster.kubernetesVersion.apply((v) => v ?? ""),
    nodePools: config.nodePools,
    nativeResource: cluster,
    provider,
  };
}
