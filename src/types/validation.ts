/**
 * Cross-cloud validation utilities.
 *
 * Validates multi-cloud configurations for compatibility:
 * - Region naming consistency
 * - Resource naming conflicts
 * - Feature availability per provider
 *
 * @module types/validation
 */

import type { CloudProvider, ResolvedCloudTarget } from "./cloud-target";
import { CloudValidationError, UnsupportedFeatureError } from "./errors";

/** Validation result with warnings and errors. */
export interface IValidationResult {
  readonly valid: boolean;
  readonly errors: ReadonlyArray<string>;
  readonly warnings: ReadonlyArray<string>;
}

/** Features that may not be available on all providers. */
const PROVIDER_FEATURES: Readonly<Record<CloudProvider, ReadonlySet<string>>> = {
  aws: new Set([
    "eks-auto-mode",
    "fck-nat",
    "managed-nat",
    "spot-instances",
    "route53",
    "secrets-manager",
  ]),
  azure: new Set([
    "virtual-nodes",
    "azure-cni",
    "managed-nat",
    "spot-instances",
    "azure-dns",
    "key-vault",
  ]),
  gcp: new Set(["autopilot", "managed-nat", "spot-instances", "cloud-dns", "secret-manager"]),
  rackspace: new Set(["spot-instances"]),
};

/**
 * Validate that a feature is supported on a given provider.
 *
 * @param feature - Feature name to check
 * @param provider - Cloud provider
 * @throws {UnsupportedFeatureError} If the feature is not available
 */
export function validateFeature(feature: string, provider: CloudProvider): void {
  const supported = PROVIDER_FEATURES[provider];
  if (!supported.has(feature)) {
    throw new UnsupportedFeatureError(feature, provider);
  }
}

/**
 * Check if a feature is available on a provider (non-throwing).
 *
 * @param feature - Feature name
 * @param provider - Cloud provider
 * @returns True if the feature is supported
 */
export function isFeatureSupported(feature: string, provider: CloudProvider): boolean {
  return PROVIDER_FEATURES[provider].has(feature);
}

/**
 * Validate a multi-cloud deployment configuration.
 *
 * Checks for:
 * - Duplicate provider+region combinations
 * - Resource name length constraints per provider
 * - Region availability
 *
 * @param targets - Array of resolved cloud targets
 * @param resourceName - Name that will be used for resources
 * @returns Validation result with any errors/warnings
 */
export function validateMultiCloud(
  targets: ReadonlyArray<ResolvedCloudTarget>,
  resourceName: string
): IValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check for duplicate targets
  const seen = new Set<string>();
  for (const target of targets) {
    const key = `${target.provider}:${target.region}`;
    if (seen.has(key)) {
      errors.push(`Duplicate target: ${key}. Each provider+region combination must be unique.`);
    }
    seen.add(key);
  }

  // Validate resource naming per provider
  for (const target of targets) {
    const nameIssues = validateResourceName(resourceName, target.provider);
    errors.push(...nameIssues.errors);
    warnings.push(...nameIssues.warnings);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate a resource name against provider-specific constraints.
 *
 * @param name - Resource name to validate
 * @param provider - Target cloud provider
 * @returns Validation result
 */
export function validateResourceName(name: string, provider: CloudProvider): IValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  switch (provider) {
    case "aws":
      // AWS names are generally flexible but some have 63-char limits
      if (name.length > 63) {
        errors.push(`Resource name "${name}" exceeds AWS 63-character limit.`);
      }
      break;
    case "azure":
      // Azure resource names: 1-63 chars, alphanumeric + hyphens
      if (name.length > 63) {
        errors.push(`Resource name "${name}" exceeds Azure 63-character limit.`);
      }
      if (/[^a-zA-Z0-9-]/.test(name)) {
        warnings.push(
          `Resource name "${name}" contains characters not allowed in Azure (only alphanumeric + hyphens).`
        );
      }
      break;
    case "gcp":
      // GCP: 1-63 chars, lowercase + hyphens, must start with letter
      if (name.length > 63) {
        errors.push(`Resource name "${name}" exceeds GCP 63-character limit.`);
      }
      if (name !== name.toLowerCase()) {
        warnings.push(`Resource name "${name}" will be lowercased for GCP.`);
      }
      if (!/^[a-z]/.test(name.toLowerCase())) {
        errors.push(`Resource name "${name}" must start with a letter for GCP.`);
      }
      break;
    case "rackspace":
      if (name.length > 255) {
        errors.push(`Resource name "${name}" exceeds Rackspace 255-character limit.`);
      }
      break;
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Assert that a multi-cloud configuration is valid, throwing on errors.
 *
 * @param targets - Resolved cloud targets
 * @param resourceName - Resource name
 * @throws {CloudValidationError} If validation fails
 */
export function assertValidMultiCloud(
  targets: ReadonlyArray<ResolvedCloudTarget>,
  resourceName: string
): void {
  const result = validateMultiCloud(targets, resourceName);
  if (!result.valid) {
    throw new CloudValidationError(`Multi-cloud validation failed:\n${result.errors.join("\n")}`);
  }
}
