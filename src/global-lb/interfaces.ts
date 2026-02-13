/**
 * Global load balancer interfaces for @reyemtech/nimbus.
 *
 * Multi-cloud traffic routing with health checks, supporting
 * active-active, active-passive, and geo-routing strategies.
 *
 * @module global-lb/interfaces
 */

import type * as pulumi from "@pulumi/pulumi";
import type { ICluster } from "../cluster";

/** Routing strategy for multi-cluster traffic. */
export type RoutingStrategy =
  | "active-active" // All clusters serve traffic
  | "active-passive" // Primary cluster, failover to secondary
  | "geo"; // Route based on client geography

/** DNS provider for global load balancing. */
export type GlbDnsProvider =
  | "route53" // AWS Route 53 health-checked routing
  | "cloudflare" // Cloudflare Load Balancing
  | "azure-traffic-manager"; // Azure Traffic Manager

/** Health check configuration. */
export interface IHealthCheck {
  readonly path: string;
  readonly port: number;
  readonly protocol: "HTTP" | "HTTPS" | "TCP";
  /** Health check interval in seconds. Default: 30. */
  readonly intervalSeconds?: number;
  /** Timeout in seconds. Default: 10. */
  readonly timeoutSeconds?: number;
  /** Consecutive successes needed to mark healthy. Default: 3. */
  readonly healthyThreshold?: number;
  /** Consecutive failures needed to mark unhealthy. Default: 3. */
  readonly unhealthyThreshold?: number;
}

/**
 * Global load balancer configuration input.
 *
 * @example
 * ```typescript
 * const config: IGlobalLoadBalancerConfig = {
 *   strategy: "active-active",
 *   clusters: [awsCluster, azureCluster],
 *   domain: "app.example.com",
 *   healthCheck: { path: "/health", port: 443, protocol: "HTTPS" },
 *   dnsProvider: "route53",
 * };
 * ```
 */
export interface IGlobalLoadBalancerConfig {
  readonly strategy: RoutingStrategy;
  readonly clusters: ReadonlyArray<ICluster>;
  readonly domain: string;
  readonly healthCheck: IHealthCheck;
  readonly dnsProvider: GlbDnsProvider;
}

/** Cluster health status entry. */
export interface IClusterHealthStatus {
  readonly cluster: string;
  readonly healthy: boolean;
}

/** Global load balancer output. */
export interface IGlobalLoadBalancer {
  readonly name: string;
  readonly strategy: RoutingStrategy;
  readonly endpoint: pulumi.Output<string>;
  readonly healthStatus: pulumi.Output<ReadonlyArray<IClusterHealthStatus>>;
}
