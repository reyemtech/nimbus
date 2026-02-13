/**
 * Secrets interfaces for @reyemtech/pulumi-any-cloud.
 *
 * Abstracts secret management across HashiCorp Vault (in-cluster),
 * AWS Secrets Manager, Azure Key Vault, and GCP Secret Manager.
 *
 * @module secrets/interfaces
 */

import * as pulumi from "@pulumi/pulumi";
import type { CloudArg, ResolvedCloudTarget } from "../types";

/** Supported secret backends. */
export type SecretBackend =
  | "vault"               // HashiCorp Vault (in-cluster, used by ReyemTech + DoNotCarry)
  | "aws-secrets-manager" // AWS Secrets Manager
  | "azure-key-vault"     // Azure Key Vault (used by MetrixGroup)
  | "gcp-secret-manager"; // GCP Secret Manager

/** Reference to a secret (path + optional key within the secret). */
export interface ISecretRef {
  /** Secret path (e.g., "operators/mysql" or "production"). */
  readonly path: string;
  /** Specific key within the secret (e.g., "root" for the root password). */
  readonly key?: string;
}

/**
 * Secrets configuration input.
 *
 * @example
 * ```typescript
 * // Vault (default for in-cluster)
 * const config: ISecretsConfig = {
 *   cloud: "aws",
 *   backend: "vault",
 *   vaultAddress: "https://vault.reyem.tech",
 * };
 *
 * // Azure Key Vault
 * const config: ISecretsConfig = {
 *   cloud: "azure",
 *   backend: "azure-key-vault",
 * };
 * ```
 */
export interface ISecretsConfig {
  readonly cloud: CloudArg;
  /** Default: "vault" if Vault is in the platform stack, cloud-native otherwise. */
  readonly backend?: SecretBackend;
  /** Vault address (required if backend is "vault"). */
  readonly vaultAddress?: string;
  readonly tags?: Readonly<Record<string, string>>;
}

/**
 * Secrets output — the created secret store.
 *
 * Provides unified put/get operations regardless of backend.
 */
export interface ISecrets {
  readonly name: string;
  readonly cloud: ResolvedCloudTarget;
  readonly backend: SecretBackend;

  /**
   * Store a secret.
   *
   * @param path - Secret path
   * @param data - Key-value pairs to store
   */
  putSecret(path: string, data: Record<string, pulumi.Input<string>>): void;

  /**
   * Get a reference to a secret value (for use in other resources).
   *
   * @param ref - Secret reference (path + optional key)
   * @returns The secret value as a Pulumi Output
   */
  getSecretRef(ref: ISecretRef): pulumi.Output<string>;

  /** Escape hatch: cloud-native secret store resource. */
  readonly nativeResource: pulumi.Resource;
}
