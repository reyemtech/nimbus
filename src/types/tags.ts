/**
 * Cross-cloud tagging strategy for @reyemtech/pulumi-any-cloud.
 *
 * Normalizes tags/labels across AWS, Azure, and GCP.
 * GCP has strict label requirements: lowercase, no special chars, max 63 chars.
 *
 * @module types/tags
 */

import type { CloudProvider } from "./cloud-target";

/** Required tags applied to every resource. */
export interface IRequiredTags {
  readonly environment: string;
  readonly client: string;
  readonly costCenter: string;
  readonly managedBy: "pulumi-any-cloud";
}

/** Maximum label key/value length for GCP. */
const GCP_LABEL_MAX_LENGTH = 63;

/** Regex for valid GCP label characters (lowercase letters, numbers, hyphens, underscores). */
const GCP_LABEL_REGEX = /^[a-z][a-z0-9_-]*$/;

/**
 * Normalize tags for a specific cloud provider.
 *
 * - **AWS:** Tags pass through as-is (supports most characters).
 * - **Azure:** Tags pass through as-is (supports most characters).
 * - **GCP:** Labels are lowercased, special chars replaced with hyphens,
 *   truncated to 63 chars, and must start with a lowercase letter.
 *
 * @param tags - Raw tags to normalize
 * @param provider - Target cloud provider
 * @returns Normalized tags for the provider
 *
 * @example
 * ```typescript
 * const tags = { Environment: "Production", "Cost-Center": "Engineering" };
 * normalizeTags(tags, "gcp");
 * // { environment: "production", cost-center: "engineering" }
 * ```
 */
export function normalizeTags(
  tags: Readonly<Record<string, string>>,
  provider: CloudProvider
): Record<string, string> {
  if (provider !== "gcp") {
    return { ...tags };
  }

  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(tags)) {
    const normalizedKey = normalizeGcpLabelKey(key);
    const normalizedValue = normalizeGcpLabelValue(value);
    if (normalizedKey in normalized) {
      console.warn(
        `[pulumi-any-cloud] GCP label key collision: "${key}" normalizes to "${normalizedKey}" which already exists. Skipping.`
      );
      continue;
    }
    normalized[normalizedKey] = normalizedValue;
  }
  return normalized;
}

/**
 * Normalize a string to a valid GCP label key.
 * Keys must start with a lowercase letter.
 */
function normalizeGcpLabelKey(value: string): string {
  let label = value
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "-")
    .replace(/^[^a-z]/, "l$&")
    .replace(/-+/g, "-")
    .replace(/-$/, "");

  if (label.length > GCP_LABEL_MAX_LENGTH) {
    label = label.substring(0, GCP_LABEL_MAX_LENGTH);
  }

  return label;
}

/**
 * Normalize a string to a valid GCP label value.
 * Values can start with any valid character (including digits).
 */
function normalizeGcpLabelValue(value: string): string {
  let label = value
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/-$/, "");

  if (label.length > GCP_LABEL_MAX_LENGTH) {
    label = label.substring(0, GCP_LABEL_MAX_LENGTH);
  }

  return label;
}

/**
 * Validate that a GCP label key or value is compliant.
 *
 * @param value - Label string to validate
 * @returns True if the label is valid for GCP
 */
export function isValidGcpLabel(value: string): boolean {
  return (
    value.length > 0 &&
    value.length <= GCP_LABEL_MAX_LENGTH &&
    GCP_LABEL_REGEX.test(value)
  );
}

/**
 * Merge required tags with user-provided tags.
 * Required tags take precedence for the `managedBy` key.
 *
 * @param required - Required tag values
 * @param userTags - User-provided additional tags
 * @returns Merged tag set
 */
export function mergeWithRequiredTags(
  required: Omit<IRequiredTags, "managedBy">,
  userTags?: Readonly<Record<string, string>>
): Record<string, string> {
  return {
    ...userTags,
    environment: required.environment,
    client: required.client,
    costCenter: required.costCenter,
    managedBy: "pulumi-any-cloud",
  };
}
