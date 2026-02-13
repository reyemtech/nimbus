/**
 * Unit tests for CLI Azure prompt helpers and template generation with options.
 *
 * Tests requiresAzurePrompts and verifies that Azure
 * templates inject prompted values correctly.
 */

import { describe, it, expect } from "vitest";
import { requiresAzurePrompts } from "../../src/cli/azure-prompts.js";
import {
  minimalAzureTemplate,
  azureTemplate,
  multiCloudTemplate,
} from "../../src/cli/templates-azure.js";

describe("requiresAzurePrompts", () => {
  it("returns true for minimal-azure", () => {
    expect(requiresAzurePrompts("minimal-azure")).toBe(true);
  });

  it("returns true for azure", () => {
    expect(requiresAzurePrompts("azure")).toBe(true);
  });

  it("returns true for multi-cloud", () => {
    expect(requiresAzurePrompts("multi-cloud")).toBe(true);
  });

  it("returns false for empty", () => {
    expect(requiresAzurePrompts("empty")).toBe(false);
  });

  it("returns false for minimal-aws", () => {
    expect(requiresAzurePrompts("minimal-aws")).toBe(false);
  });

  it("returns false for aws", () => {
    expect(requiresAzurePrompts("aws")).toBe(false);
  });
});

describe("minimalAzureTemplate with options", () => {
  const options = {
    azure: {
      region: "eastus2",
      resourceGroupName: "rg-test-eastus2",
    },
  };

  it("injects the resource group name from options", () => {
    const files = minimalAzureTemplate("test-proj", options);
    expect(files.indexTs).toContain('"rg-test-eastus2"');
  });

  it("uses ensureResourceGroup for resource group declaration", () => {
    const files = minimalAzureTemplate("test-proj", options);
    expect(files.indexTs).toContain("ensureResourceGroup");
  });

  it("does not contain hardcoded canadacentral in resource group", () => {
    const files = minimalAzureTemplate("test-proj", options);
    expect(files.indexTs).not.toContain("rg-test-proj-canadacentral");
  });

  it("does not contain tenantId in generated code", () => {
    const files = minimalAzureTemplate("test-proj", options);
    expect(files.indexTs).not.toContain("tenantId");
  });

  it("falls back to defaults when no options provided", () => {
    const files = minimalAzureTemplate("myapp");
    expect(files.indexTs).toContain("rg-myapp-canadacentral");
    expect(files.indexTs).toContain("ensureResourceGroup");
  });
});

describe("azureTemplate with options", () => {
  const options = {
    azure: {
      region: "westeurope",
      resourceGroupName: "rg-prod-westeurope",
    },
  };

  it("injects the resource group name from options", () => {
    const files = azureTemplate("prod", options);
    expect(files.indexTs).toContain('"rg-prod-westeurope"');
  });

  it("uses ensureResourceGroup for resource group declaration", () => {
    const files = azureTemplate("prod", options);
    expect(files.indexTs).toContain("ensureResourceGroup");
  });

  it("does not contain tenantId in generated code", () => {
    const files = azureTemplate("prod", options);
    expect(files.indexTs).not.toContain("tenantId");
  });

  it("falls back to defaults when no options provided", () => {
    const files = azureTemplate("myapp");
    expect(files.indexTs).toContain("rg-myapp-canadacentral");
    expect(files.indexTs).toContain("ensureResourceGroup");
  });
});

describe("multiCloudTemplate with options", () => {
  const options = {
    azure: {
      region: "northeurope",
      resourceGroupName: "rg-global-northeurope",
    },
  };

  it("injects the resource group name from options", () => {
    const files = multiCloudTemplate("global", options);
    expect(files.indexTs).toContain('"rg-global-northeurope"');
  });

  it("uses ensureResourceGroup for resource group declaration", () => {
    const files = multiCloudTemplate("global", options);
    expect(files.indexTs).toContain("ensureResourceGroup");
  });

  it("injects the Azure region into cloud target array", () => {
    const files = multiCloudTemplate("global", options);
    expect(files.indexTs).toContain('region: "northeurope"');
  });

  it("does not hardcode canadacentral in cloud targets", () => {
    const files = multiCloudTemplate("global", options);
    expect(files.indexTs).not.toContain('"canadacentral"');
  });

  it("injects the region into the README architecture diagram", () => {
    const files = multiCloudTemplate("global", options);
    expect(files.readmeMd).toContain("northeurope");
  });

  it("falls back to defaults when no options provided", () => {
    const files = multiCloudTemplate("myapp");
    expect(files.indexTs).toContain("rg-myapp-canadacentral");
    expect(files.indexTs).toContain('region: "canadacentral"');
  });

  it("does not include tenantId in generated code", () => {
    const files = multiCloudTemplate("global", options);
    expect(files.indexTs).not.toContain("tenantId");
  });
});
