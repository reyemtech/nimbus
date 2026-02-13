/**
 * AWS S3 state backend implementation with BCDR features.
 *
 * Creates an S3 bucket for Pulumi state storage with versioning,
 * encryption, locking (DynamoDB), and optional cross-region replication.
 *
 * @module aws/state
 */

import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import type { IStateBackend, IStateBackendConfig } from "../state";
import { resolveCloudTarget } from "../types";

/** AWS-specific state backend options. */
export interface IAwsStateBackendOptions {
  /** KMS key ARN for encryption. Uses AES256 if not provided. */
  readonly kmsKeyArn?: string;
  /** Allow Pulumi to destroy the state bucket (for dev/test). Default: false. */
  readonly forceDestroy?: boolean;
}

/**
 * Create an AWS S3 state backend with BCDR features.
 *
 * @example
 * ```typescript
 * const state = createAwsStateBackend("prod", {
 *   cloud: "aws",
 *   versioning: true,
 *   encryption: true,
 *   locking: { enabled: true },
 *   replication: { enabled: true, destinationRegion: "us-west-2" },
 * });
 * ```
 */
export function createAwsStateBackend(
  name: string,
  config: IStateBackendConfig,
  options?: IAwsStateBackendOptions
): IStateBackend {
  const cloud = Array.isArray(config.cloud) ? (config.cloud[0] ?? "aws") : config.cloud;
  const target = resolveCloudTarget(cloud);

  const tags = config.tags ?? {};
  const encryption = config.encryption ?? true;
  const lockingEnabled = config.locking?.enabled ?? true;
  const replication = config.replication ?? { enabled: false };
  const forceDestroy = options?.forceDestroy ?? false;

  // S3 replication requires versioning on source bucket — force it on
  const versioning = replication.enabled ? true : (config.versioning ?? true);

  // S3 bucket for state storage
  const bucket = new aws.s3.BucketV2(`${name}-state`, {
    bucketPrefix: `${name}-state-`,
    forceDestroy,
    tags: { ...tags, Name: `${name}-state` },
  });

  // Block all public access — state must never be public
  new aws.s3.BucketPublicAccessBlock(`${name}-state-public-access`, {
    bucket: bucket.id,
    blockPublicAcls: true,
    blockPublicPolicy: true,
    ignorePublicAcls: true,
    restrictPublicBuckets: true,
  });

  // Versioning
  if (versioning) {
    new aws.s3.BucketVersioningV2(`${name}-state-versioning`, {
      bucket: bucket.id,
      versioningConfiguration: { status: "Enabled" },
    });
  }

  // Server-side encryption
  if (encryption) {
    const sseRule: aws.types.input.s3.BucketServerSideEncryptionConfigurationV2Rule =
      options?.kmsKeyArn
        ? {
            applyServerSideEncryptionByDefault: {
              sseAlgorithm: "aws:kms",
              kmsMasterKeyId: options.kmsKeyArn,
            },
            bucketKeyEnabled: true,
          }
        : {
            applyServerSideEncryptionByDefault: {
              sseAlgorithm: "AES256",
            },
          };

    new aws.s3.BucketServerSideEncryptionConfigurationV2(`${name}-state-sse`, {
      bucket: bucket.id,
      rules: [sseRule],
    });
  }

  // DynamoDB table for state locking
  let lockTableName: pulumi.Output<string> | undefined;

  if (lockingEnabled) {
    const tableName = config.locking?.dynamoDbTableName ?? `${name}-state-lock`;
    const lockTable = new aws.dynamodb.Table(`${name}-state-lock`, {
      name: tableName,
      billingMode: "PAY_PER_REQUEST",
      hashKey: "LockID",
      attributes: [{ name: "LockID", type: "S" }],
      tags: { ...tags, Name: `${name}-state-lock` },
    });
    lockTableName = lockTable.name;
  }

  // Cross-region replication
  if (replication.enabled && replication.destinationRegion) {
    const destProvider = new aws.Provider(`${name}-state-repl-provider`, {
      region: replication.destinationRegion as aws.Region,
    });

    const replicaBucket = new aws.s3.BucketV2(
      `${name}-state-replica`,
      {
        bucketPrefix: `${name}-state-replica-`,
        forceDestroy,
        tags: { ...tags, Name: `${name}-state-replica` },
      },
      { provider: destProvider }
    );

    new aws.s3.BucketVersioningV2(
      `${name}-state-replica-versioning`,
      {
        bucket: replicaBucket.id,
        versioningConfiguration: { status: "Enabled" },
      },
      { provider: destProvider }
    );

    // IAM role for replication
    const replRole = new aws.iam.Role(`${name}-state-repl-role`, {
      namePrefix: `${name}-s3-repl`,
      assumeRolePolicy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Action: "sts:AssumeRole",
            Effect: "Allow",
            Principal: { Service: "s3.amazonaws.com" },
          },
        ],
      }),
      tags,
    });

    new aws.iam.RolePolicy(`${name}-state-repl-policy`, {
      role: replRole.id,
      policy: pulumi.all([bucket.arn, replicaBucket.arn]).apply(([srcArn, destArn]) =>
        JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Action: ["s3:GetReplicationConfiguration", "s3:ListBucket"],
              Resource: srcArn,
            },
            {
              Effect: "Allow",
              Action: [
                "s3:GetObjectVersionForReplication",
                "s3:GetObjectVersionAcl",
                "s3:GetObjectVersionTagging",
              ],
              Resource: `${srcArn}/*`,
            },
            {
              Effect: "Allow",
              Action: ["s3:ReplicateObject", "s3:ReplicateDelete", "s3:ReplicateTags"],
              Resource: `${destArn}/*`,
            },
          ],
        })
      ),
    });

    new aws.s3.BucketReplicationConfig(`${name}-state-replication`, {
      role: replRole.arn,
      bucket: bucket.id,
      rules: [
        {
          id: "replicate-all",
          status: "Enabled",
          destination: {
            bucket: replicaBucket.arn,
          },
        },
      ],
    });
  }

  return {
    name,
    cloud: target,
    backendType: "s3",
    backendUrl: bucket.bucket.apply((b) => `s3://${b}`),
    bucketName: bucket.bucket,
    lockTableName,
    versioning,
    encryption,
    replicationEnabled: replication.enabled,
    nativeResource: bucket,
  };
}
