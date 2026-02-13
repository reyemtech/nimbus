/**
 * Minimal AWS example — state backend + secrets, no cluster.
 *
 * Demonstrates: S3 state backend with versioning/encryption/locking + Secrets Manager
 * Ideal for: CTO vault analysis, lightweight infra, or pre-cluster setup.
 *
 * Usage:
 *   pulumi new typescript
 *   npm install @reyemtech/nimbus @pulumi/aws
 *   # Copy this file to index.ts
 *   pulumi up
 */

import { createStateBackend, createSecrets } from "@reyemtech/nimbus";
import type { IStateBackend, ISecrets } from "@reyemtech/nimbus";

// 1. State Backend — S3 with versioning, encryption, and DynamoDB locking
const backend = createStateBackend("prod", {
  cloud: "aws",
  versioning: true,
  encryption: true,
  locking: { enabled: true },
  tags: { environment: "production" },
}) as IStateBackend;

// 2. Secrets — AWS Secrets Manager
const secrets = createSecrets("prod", {
  cloud: "aws",
  backend: "aws-secrets-manager",
  tags: { environment: "production" },
}) as ISecrets;

secrets.putSecret("database", {
  host: "db.internal.example.com",
  password: "change-me-in-pulumi-config",
});

// Exports
export const backendUrl = backend.backendUrl;
export const bucketName = backend.bucketName;
