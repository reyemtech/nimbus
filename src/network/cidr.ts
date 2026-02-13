/**
 * CIDR utilities for multi-cloud network planning.
 *
 * Provides overlap detection, auto-offset for non-conflicting CIDRs,
 * and validation for multi-cloud VPC peering/mesh scenarios.
 *
 * @module network/cidr
 */

import { CidrError } from "../types";

/** Parsed CIDR representation. */
interface ParsedCidr {
  readonly network: number;
  readonly prefix: number;
  readonly size: number;
  readonly start: number;
  readonly end: number;
}

/**
 * Parse a CIDR string into its numeric components.
 *
 * @param cidr - CIDR notation string (e.g., "10.0.0.0/16")
 * @returns Parsed CIDR with start/end addresses
 * @throws {CidrError} If the CIDR string is malformed
 */
export function parseCidr(cidr: string): ParsedCidr {
  const match = /^(\d+)\.(\d+)\.(\d+)\.(\d+)\/(\d+)$/.exec(cidr);
  if (!match) {
    throw new CidrError(`Invalid CIDR notation: "${cidr}"`, "CIDR_INVALID", [cidr]);
  }

  const octets = [
    parseInt(match[1] ?? "0", 10),
    parseInt(match[2] ?? "0", 10),
    parseInt(match[3] ?? "0", 10),
    parseInt(match[4] ?? "0", 10),
  ];
  const prefix = parseInt(match[5] ?? "0", 10);

  if (octets.some((o) => o < 0 || o > 255) || prefix < 0 || prefix > 32) {
    throw new CidrError(`Invalid CIDR values: "${cidr}"`, "CIDR_INVALID", [cidr]);
  }

  const network =
    ((octets[0] ?? 0) << 24) |
    ((octets[1] ?? 0) << 16) |
    ((octets[2] ?? 0) << 8) |
    (octets[3] ?? 0);
  const size = 1 << (32 - prefix);
  const mask = ~(size - 1);
  const start = (network & mask) >>> 0;
  const end = (start + size - 1) >>> 0;

  return { network: start, prefix, size, start, end };
}

/**
 * Format a numeric IP address back to dotted notation.
 *
 * @param ip - 32-bit unsigned integer IP address
 * @returns Dotted decimal string
 */
export function formatIp(ip: number): string {
  return `${(ip >>> 24) & 0xff}.${(ip >>> 16) & 0xff}.${(ip >>> 8) & 0xff}.${ip & 0xff}`;
}

/**
 * Check if two CIDR ranges overlap.
 *
 * @param a - First CIDR string
 * @param b - Second CIDR string
 * @returns True if ranges overlap
 */
export function cidrsOverlap(a: string, b: string): boolean {
  const pa = parseCidr(a);
  const pb = parseCidr(b);
  return pa.start <= pb.end && pb.start <= pa.end;
}

/**
 * Detect overlaps in a set of CIDRs.
 *
 * @param cidrs - Array of CIDR strings to check
 * @returns Array of overlapping pairs, empty if no conflicts
 */
export function detectOverlaps(cidrs: ReadonlyArray<string>): ReadonlyArray<[string, string]> {
  const overlaps: [string, string][] = [];

  for (let i = 0; i < cidrs.length; i++) {
    for (let j = i + 1; j < cidrs.length; j++) {
      const a = cidrs[i];
      const b = cidrs[j];
      if (a && b && cidrsOverlap(a, b)) {
        overlaps.push([a, b]);
      }
    }
  }

  return overlaps;
}

/**
 * Validate that a set of CIDRs do not overlap.
 *
 * @param cidrs - Array of CIDR strings
 * @throws {CidrError} If any CIDRs overlap
 */
export function validateNoOverlaps(cidrs: ReadonlyArray<string>): void {
  const overlaps = detectOverlaps(cidrs);
  if (overlaps.length > 0) {
    const pairs = overlaps.map(([a, b]) => `${a} <-> ${b}`).join(", ");
    throw new CidrError(
      `CIDR overlap detected: ${pairs}. Multi-cloud VPC peering requires non-overlapping ranges.`,
      "CIDR_OVERLAP",
      cidrs
    );
  }
}

/**
 * Auto-generate non-overlapping CIDRs for multiple clouds.
 *
 * Uses 10.{offset}.0.0/16 pattern with configurable base and step.
 *
 * @param count - Number of CIDRs to generate
 * @param options - Base octet and step between CIDRs
 * @returns Array of non-overlapping CIDR strings
 *
 * @example
 * ```typescript
 * autoOffsetCidrs(3); // ["10.0.0.0/16", "10.1.0.0/16", "10.2.0.0/16"]
 * autoOffsetCidrs(2, { base: 10, step: 10 }); // ["10.10.0.0/16", "10.20.0.0/16"]
 * ```
 */
export function autoOffsetCidrs(
  count: number,
  options?: { base?: number; step?: number; prefix?: number }
): ReadonlyArray<string> {
  const base = options?.base ?? 0;
  const step = options?.step ?? 1;
  const prefix = options?.prefix ?? 16;

  const cidrs: string[] = [];
  for (let i = 0; i < count; i++) {
    const secondOctet = base + i * step;
    if (secondOctet > 255) {
      throw new CidrError(
        `Cannot generate ${count} non-overlapping /16 CIDRs: second octet exceeds 255 at index ${i}`,
        "CIDR_INVALID"
      );
    }
    cidrs.push(`10.${secondOctet}.0.0/${prefix}`);
  }

  return cidrs;
}

/**
 * Build a CIDR map for named clouds from explicit values or auto-offset.
 *
 * If explicit CIDRs are provided for all clouds, validates no overlaps.
 * For missing clouds, auto-generates non-overlapping CIDRs.
 *
 * @param clouds - Array of cloud names
 * @param explicit - Explicit CIDR assignments (partial or full)
 * @returns Complete CIDR map keyed by cloud name
 *
 * @example
 * ```typescript
 * buildCidrMap(["aws", "azure"], { aws: "10.0.0.0/16" });
 * // { aws: "10.0.0.0/16", azure: "10.1.0.0/16" }
 * ```
 */
export function buildCidrMap(
  clouds: ReadonlyArray<string>,
  explicit?: Readonly<Record<string, string>>
): Readonly<Record<string, string>> {
  const result: Record<string, string> = {};
  const usedCidrs: string[] = [];

  // First, assign explicit CIDRs
  for (const cloud of clouds) {
    const cidr = explicit?.[cloud];
    if (cidr) {
      result[cloud] = cidr;
      usedCidrs.push(cidr);
    }
  }

  // Validate explicit CIDRs don't overlap
  if (usedCidrs.length > 1) {
    validateNoOverlaps(usedCidrs);
  }

  // Auto-assign remaining clouds with non-overlapping CIDRs
  const remaining = clouds.filter((c) => !result[c]);
  if (remaining.length > 0) {
    // Find a base that doesn't overlap with existing CIDRs
    let base = 0;
    for (const existing of usedCidrs) {
      const parsed = parseCidr(existing);
      const secondOctet = (parsed.start >>> 16) & 0xff;
      if (secondOctet >= base) {
        base = secondOctet + 1;
      }
    }

    const autoCidrs = autoOffsetCidrs(remaining.length, { base });
    for (let i = 0; i < remaining.length; i++) {
      const cloud = remaining[i];
      const cidr = autoCidrs[i];
      if (cloud && cidr) {
        result[cloud] = cidr;
      }
    }

    // Final validation
    validateNoOverlaps(Object.values(result));
  }

  return result;
}
