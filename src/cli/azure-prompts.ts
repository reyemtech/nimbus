/**
 * Azure-specific CLI prompt orchestration for `nimbus new`.
 *
 * Prompts users for Azure region, resource group name, and tenant ID
 * when scaffolding Azure templates.
 *
 * @module cli/azure-prompts
 */

import { createPromptInterface, askQuestion } from "./prompt.js";
import type { TemplateName } from "./templates.js";

/** Azure configuration values collected from interactive prompts. */
export interface IAzureTemplateOptions {
  readonly region: string;
  readonly resourceGroupName: string;
  readonly tenantId: string;
}

/** Templates that require Azure configuration prompts. */
const AZURE_TEMPLATES: ReadonlyArray<TemplateName> = ["minimal-azure", "azure", "multi-cloud"];

/** Templates that use `createSecrets` with Azure Key Vault and require a tenant ID. */
const TENANT_ID_TEMPLATES: ReadonlyArray<TemplateName> = ["minimal-azure", "azure"];

/**
 * Check whether a template requires Azure prompts.
 *
 * @param template - Template name to check
 * @returns True if the template needs Azure configuration
 */
export function requiresAzurePrompts(template: TemplateName): boolean {
  return AZURE_TEMPLATES.includes(template);
}

/**
 * Check whether a template requires a tenant ID for Azure Key Vault.
 *
 * @param template - Template name to check
 * @returns True if the template uses createSecrets with Azure Key Vault
 */
export function requiresTenantId(template: TemplateName): boolean {
  return TENANT_ID_TEMPLATES.includes(template);
}

/**
 * Prompt the user for Azure configuration values.
 *
 * Asks for region, resource group name, and (if needed) tenant ID.
 *
 * @param projectName - Project name used for default resource group
 * @param template - Template name to determine which prompts to show
 * @returns Azure template options collected from the user
 */
export async function promptForAzureOptions(
  projectName: string,
  template: TemplateName
): Promise<IAzureTemplateOptions> {
  const rl = createPromptInterface();

  try {
    console.log("\nAzure configuration:\n");

    const region = await askQuestion(rl, "Azure region", {
      defaultValue: "canadacentral",
    });

    const resourceGroupName = await askQuestion(rl, "Resource group name", {
      defaultValue: `rg-${projectName}-${region}`,
    });

    let tenantId = "";
    if (requiresTenantId(template)) {
      tenantId = await askQuestion(rl, "Azure tenant ID", {
        required: true,
      });
    }

    return { region, resourceGroupName, tenantId };
  } finally {
    rl.close();
  }
}
