/**
 * AWS Route 53 DNS implementation.
 *
 * @module aws/dns
 */

import * as aws from "@pulumi/aws";
import type * as pulumi from "@pulumi/pulumi";
import type { IDns, IDnsConfig, IDnsRecord } from "../dns";
import { resolveCloudTarget } from "../types";

/**
 * Create a Route 53 hosted zone with optional initial records.
 *
 * @example
 * ```typescript
 * const dns = createRoute53Dns("prod", {
 *   cloud: "aws",
 *   zoneName: "example.com",
 *   records: [
 *     { name: "app", type: "A", values: ["1.2.3.4"], ttl: 300 },
 *   ],
 * });
 * ```
 */
export function createRoute53Dns(name: string, config: IDnsConfig): IDns {
  const cloud = Array.isArray(config.cloud) ? (config.cloud[0] ?? "aws") : config.cloud;
  const target = resolveCloudTarget(cloud);

  const tags = config.tags ?? {};

  const zone = new aws.route53.Zone(`${name}-zone`, {
    name: config.zoneName,
    tags: { ...tags, Name: `${name}-zone` },
  });

  // Create initial records
  if (config.records) {
    for (const rec of config.records) {
      createRecord(name, zone, rec);
    }
  }

  return {
    name,
    cloud: target,
    zoneId: zone.zoneId,
    zoneName: config.zoneName,
    nameServers: zone.nameServers as pulumi.Output<ReadonlyArray<string>>,
    nativeResource: zone,
    addRecord(record: IDnsRecord): void {
      createRecord(name, zone, record);
    },
  };
}

function createRecord(
  name: string,
  zone: aws.route53.Zone,
  record: IDnsRecord
): aws.route53.Record {
  const fqdn = record.name === "@" ? "" : record.name ? `${record.name}.` : "";
  const resourceName = `${name}-${record.name || "root"}-${record.type.toLowerCase()}`;

  return new aws.route53.Record(resourceName, {
    zoneId: zone.zoneId,
    name: zone.name.apply((zoneName) => `${fqdn}${zoneName}`),
    type: record.type,
    ttl: record.ttl ?? 300,
    records: [...record.values],
  });
}
