/**
 * Cache interfaces for @reyemtech/pulumi-any-cloud.
 *
 * Abstracts Redis/Memcached/Valkey provisioning — managed services
 * (ElastiCache, Azure Cache, Memorystore) or Helm-based (Bitnami Redis).
 *
 * @module cache/interfaces
 */

import type * as pulumi from "@pulumi/pulumi";
import type { CloudArg, ResolvedCloudTarget } from "../types";
import type { ISecretRef } from "../secrets";

/** Supported cache engines. */
export type CacheEngine = "redis" | "memcached" | "valkey";

/** Cache deployment mode. */
export type CacheMode =
  | "managed" // Cloud-native (ElastiCache, Azure Cache, Memorystore)
  | "helm"; // In-cluster via Helm chart (Bitnami Redis)

/** Cache architecture. */
export type CacheArchitecture =
  | "standalone" // Single node
  | "replication" // Master + replicas
  | "cluster"; // Redis Cluster mode (sharded)

/**
 * Cache configuration input.
 *
 * @example
 * ```typescript
 * // Bitnami Redis (ReyemTech pattern)
 * const config: ICacheConfig = {
 *   cloud: "aws",
 *   engine: "redis",
 *   mode: "helm",
 *   architecture: "replication",
 *   replicas: 2,
 *   storageGb: 5,
 *   metrics: true,
 * };
 * ```
 */
export interface ICacheConfig {
  readonly cloud: CloudArg;
  readonly engine: CacheEngine;
  readonly mode?: CacheMode;
  readonly architecture?: CacheArchitecture;
  readonly replicas?: number;
  /** Instance class for managed caches. */
  readonly instanceClass?: string;
  /** Persistent storage size in GB (for Helm-based). */
  readonly storageGb?: number;
  /** Enable Prometheus metrics exporter. */
  readonly metrics?: boolean;
  readonly tags?: Readonly<Record<string, string>>;
}

/** Cache output — the created cache resource. */
export interface ICache {
  readonly name: string;
  readonly cloud: ResolvedCloudTarget;
  readonly engine: CacheEngine;
  readonly endpoint: pulumi.Output<string>;
  readonly port: pulumi.Output<number>;
  readonly secretRef?: ISecretRef;

  /** Escape hatch: cloud-native or Helm release resource. */
  readonly nativeResource: pulumi.Resource;
}
