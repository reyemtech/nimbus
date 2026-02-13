/**
 * Azure provider implementations for @reyemtech/nimbus.
 *
 * @module azure
 */

export { createAzureNetwork, type IAzureNetworkOptions } from "./network";
export { createAksCluster, type IAksOptions } from "./cluster";
export { createAzureDns, type IAzureDnsOptions } from "./dns";
export { createAzureSecrets, type IAzureSecretsOptions } from "./secrets";
export { createAzureStateBackend, type IAzureStateBackendOptions } from "./state";
export { ensureResourceGroup, type IResourceGroupOptions } from "./resource-group";
