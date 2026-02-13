/**
 * Azure-specific CLI prompt orchestration for `nimbus new`.
 *
 * Prompts users for Azure region and resource group name
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
}

/** Templates that require Azure configuration prompts. */
const AZURE_TEMPLATES: ReadonlyArray<TemplateName> = ["minimal-azure", "azure", "multi-cloud"];

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
 * Prompt the user for Azure configuration values.
 *
 * Asks for region and resource group name.
 *
 * @param projectName - Project name used for default resource group
 * @returns Azure template options collected from the user
 */
export async function promptForAzureOptions(projectName: string): Promise<IAzureTemplateOptions> {
  const rl = createPromptInterface();

  try {
    console.log("\nAzure configuration:\n");

    const region = await askQuestion(rl, "Azure region", {
      defaultValue: "canadacentral",
    });

    const resourceGroupName = await askQuestion(rl, "Resource group name", {
      defaultValue: `rg-${projectName}-${region}`,
    });

    return { region, resourceGroupName };
  } finally {
    rl.close();
  }
}
