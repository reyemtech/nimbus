/**
 * Dynamic provider loader with helpful error messages.
 *
 * @module utils/provider-loader
 */

const PROVIDER_PACKAGES: Readonly<Record<string, ReadonlyArray<string>>> = {
  aws: ["@pulumi/aws"],
  azure: ["@pulumi/azure-native"],
  gcp: ["@pulumi/gcp"],
  kubernetes: ["@pulumi/kubernetes"],
};

/**
 * Dynamically import a provider module, throwing a helpful error if missing.
 *
 * @param provider - The cloud provider name (aws, azure, etc.)
 * @param modulePath - The module path to import
 * @returns The imported module
 */
export async function loadProvider<T>(provider: string, modulePath: string): Promise<T> {
  try {
    return (await import(modulePath)) as T;
  } catch (cause: unknown) {
    const packages = PROVIDER_PACKAGES[provider] ?? [modulePath];
    throw new Error(
      `Cloud provider "${provider}" requires: ${packages.join(", ")}\n` +
        `Run: npm install ${packages.join(" ")}\n` +
        `Or:  npx @reyemtech/nimbus install ${provider}`,
      { cause }
    );
  }
}
