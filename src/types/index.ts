/**
 * Shared types, interfaces, and constants for @reyemtech/pulumi-any-cloud.
 *
 * @module types
 */

export {
  type CloudProvider,
  type CloudTarget,
  type CloudArg,
  type ResolvedCloudTarget,
  DEFAULT_REGIONS,
  CLOUD_PROVIDERS,
  isCloudProvider,
  isCloudTarget,
  resolveCloudTarget,
} from "./cloud-target";

export {
  type ErrorCode,
  ERROR_CODES,
  AnyCloudError,
  CloudValidationError,
  CidrError,
  UnsupportedFeatureError,
  ConfigError,
  assertNever,
} from "./errors";

export { type IRequiredTags, normalizeTags, isValidGcpLabel, mergeWithRequiredTags } from "./tags";

export {
  type IValidationResult,
  validateFeature,
  isFeatureSupported,
  validateMultiCloud,
  validateResourceName,
  assertValidMultiCloud,
} from "./validation";
