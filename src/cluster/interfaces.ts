/**
 * Cluster interfaces for @reyemtech/pulumi-any-cloud.
 *
 * Abstracts Kubernetes cluster provisioning across EKS, AKS, and GKE.
 * Supports EKS Auto Mode, AKS virtual nodes, spot instances, and
 * multiple node pool configurations.
 *
 * @module cluster/interfaces
 */

import type * as pulumi from "@pulumi/pulumi";
import type * as k8s from "@pulumi/kubernetes";
import type { CloudArg, ResolvedCloudTarget } from "../types";

/** Kubernetes node taint. */
export interface INodeTaint {
  readonly key: string;
  readonly value: string;
  readonly effect: "NoSchedule" | "PreferNoSchedule" | "NoExecute";
}

/**
 * Node pool configuration.
 *
 * @example
 * ```typescript
 * const pool: INodePool = {
 *   name: "workers",
 *   instanceType: "c6a.large",
 *   minNodes: 2,
 *   maxNodes: 8,
 *   spot: true,
 *   labels: { "workload-type": "general" },
 * };
 * ```
 */
export interface INodePool {
  readonly name: string;
  readonly instanceType: string;
  readonly minNodes: number;
  readonly maxNodes: number;
  readonly desiredNodes?: number;
  readonly spot?: boolean;
  readonly labels?: Readonly<Record<string, string>>;
  readonly taints?: ReadonlyArray<INodeTaint>;
  /** Node pool mode (AKS concept: "system" vs "user"). Maps to labels on other providers. */
  readonly mode?: "system" | "user";
}

/**
 * Cluster configuration input.
 *
 * @example
 * ```typescript
 * const config: IClusterConfig = {
 *   cloud: "aws",
 *   version: "1.32",
 *   nodePools: [
 *     { name: "system", instanceType: "t3.medium", minNodes: 2, maxNodes: 4 },
 *     { name: "workers", instanceType: "c6a.large", minNodes: 2, maxNodes: 8, spot: true },
 *   ],
 * };
 * ```
 */
export interface IClusterConfig {
  readonly cloud: CloudArg;
  readonly version?: string;
  readonly nodePools: ReadonlyArray<INodePool>;
  /** EKS Auto Mode: no explicit node groups, AWS manages node selection. */
  readonly autoMode?: boolean;
  /** AKS: enable Azure Container Instances virtual node. */
  readonly virtualNodes?: boolean;
  /** Optional: attach to an existing network. */
  readonly networkId?: pulumi.Input<string>;
  readonly tags?: Readonly<Record<string, string>>;
}

/**
 * Cluster output — the created Kubernetes cluster resource.
 *
 * Provides a unified interface regardless of the underlying cloud provider.
 * Use `nativeResource` for cloud-specific operations via escape hatch.
 */
export interface ICluster {
  readonly name: string;
  readonly cloud: ResolvedCloudTarget;
  readonly endpoint: pulumi.Output<string>;
  readonly kubeconfig: pulumi.Output<string>;
  readonly version: pulumi.Output<string>;
  readonly nodePools: ReadonlyArray<INodePool>;

  /**
   * Escape hatch: access the cloud-native cluster resource.
   *
   * @example
   * ```typescript
   * const eksCluster = cluster.nativeResource as aws.eks.Cluster;
   * eksCluster.arn.apply(arn => console.log("EKS ARN:", arn));
   * ```
   */
  readonly nativeResource: pulumi.Resource;

  /** Pulumi K8s provider for deploying workloads to this cluster. */
  readonly provider: k8s.Provider;
}

/** AWS-specific cluster extensions for EKS. */
export interface IEksClusterExtensions {
  readonly provider: "aws";
  readonly autoMode?: boolean;
}

/** Azure-specific cluster extensions for AKS. */
export interface IAksClusterExtensions {
  readonly provider: "azure";
  readonly virtualNodes?: boolean;
  readonly azureCni?: boolean;
}

/** GCP-specific cluster extensions for GKE. */
export interface IGkeClusterExtensions {
  readonly provider: "gcp";
  readonly autopilot?: boolean;
}

/**
 * Discriminated union of provider-specific cluster extensions.
 * Use `provider` field to narrow the type in a switch/case.
 */
export type ProviderClusterExtensions =
  | IEksClusterExtensions
  | IAksClusterExtensions
  | IGkeClusterExtensions;
