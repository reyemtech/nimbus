/**
 * Azure DNS Zone implementation.
 *
 * @module azure/dns
 */

import * as azure from "@pulumi/azure-native";
import type * as pulumi from "@pulumi/pulumi";
import type { IDns, IDnsConfig, IDnsRecord } from "../dns";
import { resolveCloudTarget } from "../types";

/** Default DNS record TTL in seconds. */
const DEFAULT_DNS_TTL_SECONDS = 300;

/** Azure-specific DNS options. */
export interface IAzureDnsOptions {
  /** Resource group name. Required for Azure. */
  readonly resourceGroupName: pulumi.Input<string>;
}

/**
 * Create an Azure DNS Zone with optional initial records.
 *
 * @example
 * ```typescript
 * const dns = createAzureDns("prod", {
 *   cloud: "azure",
 *   zoneName: "metrixgroup.com",
 *   records: [
 *     { name: "app", type: "A", values: ["1.2.3.4"], ttl: 300 },
 *   ],
 * }, { resourceGroupName: "my-rg" });
 * ```
 */
export function createAzureDns(name: string, config: IDnsConfig, options: IAzureDnsOptions): IDns {
  const cloud = Array.isArray(config.cloud) ? (config.cloud[0] ?? "azure") : config.cloud;
  const target = resolveCloudTarget(cloud);

  const tags = config.tags ?? {};
  const rgName = options.resourceGroupName;

  const zone = new azure.dns.Zone(`${name}-zone`, {
    zoneName: config.zoneName,
    resourceGroupName: rgName,
    zoneType: azure.dns.ZoneType.Public,
    location: "global",
    tags: { ...tags, Name: `${name}-zone` },
  });

  if (config.records) {
    for (const rec of config.records) {
      createRecord(name, rgName, config.zoneName, rec);
    }
  }

  return {
    name,
    cloud: target,
    zoneId: zone.id,
    zoneName: config.zoneName,
    nameServers: zone.nameServers as pulumi.Output<ReadonlyArray<string>>,
    nativeResource: zone,
    addRecord(record: IDnsRecord): void {
      createRecord(name, rgName, config.zoneName, record);
    },
  };
}

function createRecord(
  name: string,
  rgName: pulumi.Input<string>,
  zoneName: string,
  record: IDnsRecord
): void {
  const recordName = record.name === "@" ? "@" : record.name;
  const resourceName = `${name}-${record.name || "root"}-${record.type.toLowerCase()}`;
  const ttl = record.ttl ?? DEFAULT_DNS_TTL_SECONDS;

  switch (record.type) {
    case "A":
      new azure.dns.RecordSet(resourceName, {
        relativeRecordSetName: recordName,
        resourceGroupName: rgName,
        zoneName,
        recordType: "A",
        ttl,
        aRecords: record.values.map((v) => ({ ipv4Address: v })),
      });
      break;
    case "AAAA":
      new azure.dns.RecordSet(resourceName, {
        relativeRecordSetName: recordName,
        resourceGroupName: rgName,
        zoneName,
        recordType: "AAAA",
        ttl,
        aaaaRecords: record.values.map((v) => ({ ipv6Address: v })),
      });
      break;
    case "CNAME":
      new azure.dns.RecordSet(resourceName, {
        relativeRecordSetName: recordName,
        resourceGroupName: rgName,
        zoneName,
        recordType: "CNAME",
        ttl,
        cnameRecord: { cname: record.values[0] ?? "" },
      });
      break;
    case "TXT":
      new azure.dns.RecordSet(resourceName, {
        relativeRecordSetName: recordName,
        resourceGroupName: rgName,
        zoneName,
        recordType: "TXT",
        ttl,
        txtRecords: record.values.map((v) => ({ value: [v] })),
      });
      break;
    case "MX":
      new azure.dns.RecordSet(resourceName, {
        relativeRecordSetName: recordName,
        resourceGroupName: rgName,
        zoneName,
        recordType: "MX",
        ttl,
        mxRecords: record.values.map((v) => {
          const parts = v.split(" ");
          return {
            preference: parseInt(parts[0] ?? "10", 10),
            exchange: parts[1] ?? v,
          };
        }),
      });
      break;
    case "NS":
      new azure.dns.RecordSet(resourceName, {
        relativeRecordSetName: recordName,
        resourceGroupName: rgName,
        zoneName,
        recordType: "NS",
        ttl,
        nsRecords: record.values.map((v) => ({ nsdname: v })),
      });
      break;
    default:
      // SRV, CAA — create record set without type-specific fields
      new azure.dns.RecordSet(resourceName, {
        relativeRecordSetName: recordName,
        resourceGroupName: rgName,
        zoneName,
        recordType: record.type,
        ttl,
      });
  }
}
