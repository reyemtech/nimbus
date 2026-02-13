/**
 * Network interfaces for @reyemtech/pulumi-any-cloud.
 *
 * Abstracts VPC (AWS), VNet (Azure), and VPC (GCP) provisioning.
 * Includes NAT strategy options (managed, fck-nat, none) and
 * CIDR overlap detection for multi-cloud deployments.
 *
 * @module network/interfaces
 */

import * as pulumi from "@pulumi/pulumi";
import type { CloudArg, ResolvedCloudTarget } from "../types";

/** NAT gateway strategy. */
export type NatStrategy =
  | "managed"  // Cloud-native NAT Gateway (AWS: ~$32/mo, Azure: ~$32/mo)
  | "fck-nat"  // fck-nat instance on AWS (~$3/mo) — AWS only
  | "none";    // No NAT (public subnets only or hosted K8s)

/** Subnet configuration. */
export interface ISubnetConfig {
  readonly cidr: string;
  readonly availabilityZone?: string;
  readonly public?: boolean;
}

/**
 * Network configuration input.
 *
 * @example
 * ```typescript
 * const config: INetworkConfig = {
 *   cloud: "aws",
 *   cidr: "10.0.0.0/16",
 *   natStrategy: "fck-nat", // ~$97/mo savings vs managed NAT
 * };
 * ```
 */
export interface INetworkConfig {
  readonly cloud: CloudArg;
  /** CIDR block for the VPC/VNet. Optional for hosted K8s without custom networking (e.g. Rackspace Spot). */
  readonly cidr?: string;
  readonly publicSubnets?: ReadonlyArray<ISubnetConfig>;
  readonly privateSubnets?: ReadonlyArray<ISubnetConfig>;
  readonly natStrategy?: NatStrategy;
  readonly enableDnsHostnames?: boolean;
  readonly enableDnsSupport?: boolean;
  readonly tags?: Readonly<Record<string, string>>;
}

/**
 * Network output — the created VPC/VNet resource.
 *
 * Use `nativeResource` for cloud-specific network operations.
 */
export interface INetwork {
  readonly name: string;
  readonly cloud: ResolvedCloudTarget;
  /** VPC ID (AWS), VNet ID (Azure), or Network self-link (GCP). */
  readonly vpcId: pulumi.Output<string>;
  readonly cidr?: string;
  readonly publicSubnetIds: pulumi.Output<ReadonlyArray<string>>;
  readonly privateSubnetIds: pulumi.Output<ReadonlyArray<string>>;
  readonly natGatewayId?: pulumi.Output<string>;

  /** Escape hatch: cloud-native network resource. */
  readonly nativeResource: pulumi.Resource;
}
