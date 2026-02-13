/**
 * @reyemtech/pulumi-any-cloud
 *
 * Cloud-agnostic infrastructure abstractions for Pulumi.
 * Enables BCDR: any client environment fully reproducible from code,
 * cloud migration = change one config value.
 *
 * @packageDocumentation
 */

// Core types
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
} from "./types";

export {
  type ErrorCode,
  ERROR_CODES,
  AnyCloudError,
  CloudValidationError,
  CidrError,
  UnsupportedFeatureError,
  ConfigError,
  assertNever,
} from "./types";

export { type IRequiredTags, normalizeTags, isValidGcpLabel, mergeWithRequiredTags } from "./types";

// Cluster
export type {
  INodeTaint,
  INodePool,
  IClusterConfig,
  ICluster,
  IEksClusterExtensions,
  IAksClusterExtensions,
  IGkeClusterExtensions,
  ProviderClusterExtensions,
} from "./cluster";

// Network
export type { NatStrategy, ISubnetConfig, INetworkConfig, INetwork } from "./network";

// DNS
export type { DnsRecordType, IDnsRecord, IDnsConfig, IDns } from "./dns";

// Secrets
export type { SecretBackend, ISecretRef, ISecretsConfig, ISecrets } from "./secrets";

// Database
export type {
  DatabaseEngine,
  DatabaseMode,
  DatabaseOperator,
  IDatabaseBackupConfig,
  IDatabaseConfig,
  IDatabase,
} from "./database";

// Cache
export type { CacheEngine, CacheMode, CacheArchitecture, ICacheConfig, ICache } from "./cache";

// Object Storage
export type { ILifecycleRule, ICorsRule, IObjectStorageConfig, IObjectStorage } from "./storage";

// Queue
export type { QueueEngine, QueueMode, QueueType, IQueueConfig, IQueue } from "./queue";

// Platform
export type {
  DnsProvider,
  IPlatformComponentConfig,
  IExternalDnsConfig,
  IVaultConfig,
  IPlatformStackConfig,
  IPlatformStack,
} from "./platform";

// Global Load Balancer
export type {
  RoutingStrategy,
  GlbDnsProvider,
  IHealthCheck,
  IGlobalLoadBalancerConfig,
  IClusterHealthStatus,
  IGlobalLoadBalancer,
} from "./global-lb";

// AWS Provider
export {
  createAwsNetwork,
  type IAwsNetworkOptions,
  createEksCluster,
  type IEksOptions,
  createRoute53Dns,
  createAwsSecrets,
} from "./aws";

// Azure Provider
export {
  createAzureNetwork,
  type IAzureNetworkOptions,
  createAksCluster,
  type IAksOptions,
  createAzureDns,
  type IAzureDnsOptions,
  createAzureSecrets,
  type IAzureSecretsOptions,
} from "./azure";
