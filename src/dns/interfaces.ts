/**
 * DNS interfaces for @reyemtech/pulumi-any-cloud.
 *
 * Abstracts DNS zone management across Route 53 (AWS),
 * Azure DNS Zone, and Cloud DNS (GCP).
 *
 * @module dns/interfaces
 */

import * as pulumi from "@pulumi/pulumi";
import type { CloudArg, ResolvedCloudTarget } from "../types";

/** Supported DNS record types. */
export type DnsRecordType =
  | "A"
  | "AAAA"
  | "CNAME"
  | "TXT"
  | "MX"
  | "NS"
  | "SRV"
  | "CAA";

/** DNS record configuration. */
export interface IDnsRecord {
  /** Record name relative to zone (e.g., "www" or "argocd"). Use "@" for apex. */
  readonly name: string;
  readonly type: DnsRecordType;
  readonly values: ReadonlyArray<string>;
  /** TTL in seconds. Default: 300. */
  readonly ttl?: number;
}

/**
 * DNS configuration input.
 *
 * @example
 * ```typescript
 * const config: IDnsConfig = {
 *   cloud: "aws",
 *   zoneName: "reyem.tech",
 * };
 * ```
 */
export interface IDnsConfig {
  readonly cloud: CloudArg;
  readonly zoneName: string;
  readonly records?: ReadonlyArray<IDnsRecord>;
  readonly tags?: Readonly<Record<string, string>>;
}

/**
 * DNS output — the created DNS zone.
 *
 * Use `addRecord()` to manage records in the zone.
 */
export interface IDns {
  readonly name: string;
  readonly cloud: ResolvedCloudTarget;
  readonly zoneId: pulumi.Output<string>;
  readonly zoneName: string;
  readonly nameServers: pulumi.Output<ReadonlyArray<string>>;

  /** Add a DNS record to the zone. */
  addRecord(record: IDnsRecord): void;

  /** Escape hatch: cloud-native DNS zone resource. */
  readonly nativeResource: pulumi.Resource;
}
