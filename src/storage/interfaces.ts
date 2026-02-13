/**
 * Object storage interfaces for @reyemtech/pulumi-any-cloud.
 *
 * Abstracts S3 (AWS), Blob Storage (Azure), and GCS (GCP)
 * bucket management with versioning, encryption, and lifecycle policies.
 *
 * @module storage/interfaces
 */

import * as pulumi from "@pulumi/pulumi";
import type { CloudArg, ResolvedCloudTarget } from "../types";

/** Lifecycle rule for object expiration/transition. */
export interface ILifecycleRule {
  readonly prefix?: string;
  readonly expirationDays?: number;
  readonly transitionDays?: number;
  readonly transitionStorageClass?: string;
}

/** CORS rule for cross-origin access. */
export interface ICorsRule {
  readonly allowedOrigins: ReadonlyArray<string>;
  readonly allowedMethods: ReadonlyArray<string>;
  readonly allowedHeaders?: ReadonlyArray<string>;
  readonly maxAgeSeconds?: number;
}

/**
 * Object storage configuration input.
 *
 * @example
 * ```typescript
 * const config: IObjectStorageConfig = {
 *   cloud: "aws",
 *   versioning: true,
 *   encryption: true,
 *   lifecycleRules: [
 *     { prefix: "logs/", expirationDays: 90 },
 *     { prefix: "backups/", transitionDays: 30, transitionStorageClass: "GLACIER" },
 *   ],
 * };
 * ```
 */
export interface IObjectStorageConfig {
  readonly cloud: CloudArg;
  readonly versioning?: boolean;
  /** Enable server-side encryption. Default: true. */
  readonly encryption?: boolean;
  readonly lifecycleRules?: ReadonlyArray<ILifecycleRule>;
  /** Allow public access. Default: false. */
  readonly publicAccess?: boolean;
  readonly corsRules?: ReadonlyArray<ICorsRule>;
  readonly tags?: Readonly<Record<string, string>>;
}

/** Object storage output — the created bucket. */
export interface IObjectStorage {
  readonly name: string;
  readonly cloud: ResolvedCloudTarget;
  readonly bucketName: pulumi.Output<string>;
  /** AWS-specific: bucket ARN. */
  readonly bucketArn?: pulumi.Output<string>;
  readonly endpoint: pulumi.Output<string>;

  /** Escape hatch: cloud-native bucket resource. */
  readonly nativeResource: pulumi.Resource;
}
