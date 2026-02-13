/**
 * Global Load Balancer implementation.
 *
 * Routes traffic across multiple clusters using DNS-based health checks.
 * Currently supports Route53 as the DNS provider. Azure Traffic Manager
 * and Cloudflare can be added as future providers.
 *
 * @module global-lb/glb
 */

import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import type {
  IGlobalLoadBalancer,
  IGlobalLoadBalancerConfig,
  IClusterHealthStatus,
} from "./interfaces";
import { assertNever } from "../types";

/** Default health check interval in seconds. */
const DEFAULT_HEALTH_CHECK_INTERVAL_SECONDS = 30;

/** Default health check failure threshold. */
const DEFAULT_FAILURE_THRESHOLD = 3;

/** Equal weight for active-active routing (each endpoint gets the same weight). */
const EQUAL_ROUTING_WEIGHT = 100;

/** DNS record TTL in seconds for GLB records. */
const GLB_DNS_TTL_SECONDS = 60;

/** Geographic continent codes for geo-routing. */
const GEO_CONTINENTS = ["NA", "EU", "AP", "SA", "AF", "OC"] as const;

/**
 * Create a Global Load Balancer across multiple clusters.
 *
 * Uses DNS-based routing with health checks to distribute traffic.
 * Supports active-active, active-passive, and geo-routing strategies.
 *
 * @example
 * ```typescript
 * const glb = createGlobalLoadBalancer("prod", {
 *   strategy: "active-active",
 *   clusters: [awsCluster, azureCluster],
 *   domain: "app.example.com",
 *   healthCheck: { path: "/health", port: 443, protocol: "HTTPS" },
 *   dnsProvider: "route53",
 * });
 * ```
 */
export function createGlobalLoadBalancer(
  name: string,
  config: IGlobalLoadBalancerConfig
): IGlobalLoadBalancer {
  switch (config.dnsProvider) {
    case "route53":
      return createRoute53Glb(name, config);
    case "cloudflare":
    case "azure-traffic-manager":
      // Placeholder for future providers
      return createRoute53Glb(name, config);
    default:
      assertNever(config.dnsProvider);
  }
}

function createRoute53Glb(name: string, config: IGlobalLoadBalancerConfig): IGlobalLoadBalancer {
  const hc = config.healthCheck;

  // Create a hosted zone for the GLB domain (or reference existing)
  const domainParts = config.domain.split(".");
  const zoneDomain = domainParts.slice(-2).join(".");

  const zone = aws.route53.getZoneOutput({ name: zoneDomain });

  // Create health checks for each cluster
  const healthChecks = config.clusters.map((cluster, i) => {
    const healthCheck = new aws.route53.HealthCheck(`${name}-hc-${i}`, {
      type: hc.protocol === "TCP" ? "TCP" : `${hc.protocol}_STR_MATCH`,
      resourcePath: hc.protocol !== "TCP" ? hc.path : undefined,
      port: hc.port,
      requestInterval: hc.intervalSeconds ?? DEFAULT_HEALTH_CHECK_INTERVAL_SECONDS,
      failureThreshold: hc.unhealthyThreshold ?? DEFAULT_FAILURE_THRESHOLD,
      fqdn: cluster.endpoint.apply((ep) => {
        try {
          return new URL(ep).hostname;
        } catch {
          return ep;
        }
      }),
      searchString: hc.protocol !== "TCP" ? "ok" : undefined,
      tags: { Name: `${name}-hc-${cluster.name}` },
    });

    return { cluster, healthCheck };
  });

  // Create DNS records based on routing strategy
  switch (config.strategy) {
    case "active-active": {
      // Weighted routing — equal weight across all clusters
      for (const [i, entry] of healthChecks.entries()) {
        new aws.route53.Record(`${name}-record-${i}`, {
          zoneId: zone.zoneId,
          name: config.domain,
          type: "CNAME",
          ttl: GLB_DNS_TTL_SECONDS,
          setIdentifier: `${name}-${entry.cluster.name}`,
          weightedRoutingPolicies: [{ weight: EQUAL_ROUTING_WEIGHT }],
          healthCheckId: entry.healthCheck.id,
          records: [
            entry.cluster.endpoint.apply((ep) => {
              try {
                return new URL(ep).hostname;
              } catch {
                return ep;
              }
            }),
          ],
        });
      }
      break;
    }
    case "active-passive": {
      // Failover routing — primary + secondary
      for (const [i, entry] of healthChecks.entries()) {
        new aws.route53.Record(`${name}-record-${i}`, {
          zoneId: zone.zoneId,
          name: config.domain,
          type: "CNAME",
          ttl: GLB_DNS_TTL_SECONDS,
          setIdentifier: `${name}-${entry.cluster.name}`,
          failoverRoutingPolicies: [{ type: i === 0 ? "PRIMARY" : "SECONDARY" }],
          healthCheckId: entry.healthCheck.id,
          records: [
            entry.cluster.endpoint.apply((ep) => {
              try {
                return new URL(ep).hostname;
              } catch {
                return ep;
              }
            }),
          ],
        });
      }
      break;
    }
    case "geo": {
      // Geolocation routing — defaults to continent-based
      for (const [i, entry] of healthChecks.entries()) {
        new aws.route53.Record(`${name}-record-${i}`, {
          zoneId: zone.zoneId,
          name: config.domain,
          type: "CNAME",
          ttl: GLB_DNS_TTL_SECONDS,
          setIdentifier: `${name}-${entry.cluster.name}`,
          geolocationRoutingPolicies: [
            i < GEO_CONTINENTS.length ? { continent: GEO_CONTINENTS[i] } : { country: "*" },
          ],
          healthCheckId: entry.healthCheck.id,
          records: [
            entry.cluster.endpoint.apply((ep) => {
              try {
                return new URL(ep).hostname;
              } catch {
                return ep;
              }
            }),
          ],
        });
      }
      // Default fallback record
      if (healthChecks.length > 0) {
        const fallback = healthChecks[0];
        if (fallback) {
          new aws.route53.Record(`${name}-record-default`, {
            zoneId: zone.zoneId,
            name: config.domain,
            type: "CNAME",
            ttl: GLB_DNS_TTL_SECONDS,
            setIdentifier: `${name}-default`,
            geolocationRoutingPolicies: [{ country: "*" }],
            healthCheckId: fallback.healthCheck.id,
            records: [
              fallback.cluster.endpoint.apply((ep) => {
                try {
                  return new URL(ep).hostname;
                } catch {
                  return ep;
                }
              }),
            ],
          });
        }
      }
      break;
    }
    default:
      assertNever(config.strategy);
  }

  // Health status output
  const healthStatus = pulumi.all(
    healthChecks.map((entry) =>
      pulumi.all([pulumi.output(entry.cluster.name), entry.healthCheck.id]).apply(
        ([clusterName]) =>
          ({
            cluster: clusterName,
            healthy: true, // Initial state; actual health determined by Route53
          }) satisfies IClusterHealthStatus
      )
    )
  );

  return {
    name,
    strategy: config.strategy,
    endpoint: pulumi.output(config.domain),
    healthStatus: healthStatus as pulumi.Output<ReadonlyArray<IClusterHealthStatus>>,
  };
}
