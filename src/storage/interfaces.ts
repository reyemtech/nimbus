/**
 * Object storage interfaces for @reyemtech/nimbus.
 *
 * Abstracts S3 (AWS), Blob Storage (Azure), and GCS (GCP)
 * bucket management with versioning, encryption, and lifecycle policies.
 *
 * @module storage/interfaces
 */

import type * as pulumi from "@pulumi/pulumi";
import type { CloudArg, ResolvedCloudTarget } from "../types";

/** Lifecycle rule for object expiration/transition. */
export interface ILifecycleRule {
  /** Object key prefix to scope this rule (e.g., "logs/"). Applies to all objects if omitted. */
  readonly prefix?: string;
  /** Number of days after creation before objects are deleted. */
  readonly expirationDays?: number;
  /** Number of days after creation before objects are transitioned to another storage class. */
  readonly transitionDays?: number;
  /** Target storage class for transition (e.g., "GLACIER", "COOL"). */
  readonly transitionStorageClass?: string;
}

/** CORS rule for cross-origin access. */
export interface ICorsRule {
  /** Allowed origin domains (e.g., ["https://reyem.tech"]). Use ["*"] for any origin. */
  readonly allowedOrigins: ReadonlyArray<string>;
  /** Allowed HTTP methods (e.g., ["GET", "PUT"]). */
  readonly allowedMethods: ReadonlyArray<string>;
  /** Allowed request headers. */
  readonly allowedHeaders?: ReadonlyArray<string>;
  /** Max time in seconds the browser may cache the preflight response. */
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
  /** Cloud provider target or multi-cloud array. */
  readonly cloud: CloudArg;
  /** Enable object versioning on the bucket. */
  readonly versioning?: boolean;
  /** Enable server-side encryption. Default: true. */
  readonly encryption?: boolean;
  /** Lifecycle rules for automatic object expiration or storage class transition. */
  readonly lifecycleRules?: ReadonlyArray<ILifecycleRule>;
  /** Allow public access. Default: false. */
  readonly publicAccess?: boolean;
  /** CORS rules for cross-origin browser access. */
  readonly corsRules?: ReadonlyArray<ICorsRule>;
  /** Resource tags applied to the bucket. */
  readonly tags?: Readonly<Record<string, string>>;
}

/** Object storage output — the created bucket. */
export interface IObjectStorage {
  /** Logical name of the storage resource. */
  readonly name: string;
  /** Resolved cloud target this bucket was provisioned on. */
  readonly cloud: ResolvedCloudTarget;
  /** Cloud-assigned bucket name. */
  readonly bucketName: pulumi.Output<string>;
  /** AWS-specific: bucket ARN. */
  readonly bucketArn?: pulumi.Output<string>;
  /** Bucket endpoint URL for object access. */
  readonly endpoint: pulumi.Output<string>;

  /** Escape hatch: cloud-native bucket resource. */
  readonly nativeResource: pulumi.Resource;
}
