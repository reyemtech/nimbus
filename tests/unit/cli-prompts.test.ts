/**
 * Unit tests for CLI Azure prompt helpers and template generation with options.
 *
 * Tests requiresAzurePrompts, requiresTenantId, and verifies that Azure
 * templates inject prompted values correctly.
 */

import { describe, it, expect } from "vitest";
import { requiresAzurePrompts, requiresTenantId } from "../../src/cli/azure-prompts.js";
import {
  minimalAzureTemplate,
  azureTemplate,
  multiCloudTemplate,
} from "../../src/cli/templates-azure.js";
import type { TemplateName } from "../../src/cli/templates.js";

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

describe("requiresTenantId", () => {
  it("returns true for minimal-azure", () => {
    expect(requiresTenantId("minimal-azure")).toBe(true);
  });

  it("returns true for azure", () => {
    expect(requiresTenantId("azure")).toBe(true);
  });

  it("returns false for multi-cloud", () => {
    expect(requiresTenantId("multi-cloud")).toBe(false);
  });

  it("returns false for non-Azure templates", () => {
    const nonAzure: TemplateName[] = ["empty", "minimal-aws", "aws"];
    for (const t of nonAzure) {
      expect(requiresTenantId(t)).toBe(false);
    }
  });
});

describe("minimalAzureTemplate with options", () => {
  const options = {
    azure: {
      region: "eastus2",
      resourceGroupName: "rg-test-eastus2",
      tenantId: "abc-123-def",
    },
  };

  it("injects the resource group name from options", () => {
    const files = minimalAzureTemplate("test-proj", options);
    expect(files.indexTs).toContain('"rg-test-eastus2"');
  });

  it("injects the tenant ID from options", () => {
    const files = minimalAzureTemplate("test-proj", options);
    expect(files.indexTs).toContain('"abc-123-def"');
  });

  it("does not contain hardcoded canadacentral in resource group", () => {
    const files = minimalAzureTemplate("test-proj", options);
    expect(files.indexTs).not.toContain("rg-test-proj-canadacentral");
  });

  it("falls back to defaults when no options provided", () => {
    const files = minimalAzureTemplate("myapp");
    expect(files.indexTs).toContain("rg-myapp-canadacentral");
    expect(files.indexTs).toContain('"your-tenant-id"');
  });
});

describe("azureTemplate with options", () => {
  const options = {
    azure: {
      region: "westeurope",
      resourceGroupName: "rg-prod-westeurope",
      tenantId: "tenant-xyz-789",
    },
  };

  it("injects the resource group name from options", () => {
    const files = azureTemplate("prod", options);
    expect(files.indexTs).toContain('"rg-prod-westeurope"');
  });

  it("injects the tenant ID from options", () => {
    const files = azureTemplate("prod", options);
    expect(files.indexTs).toContain('"tenant-xyz-789"');
  });

  it("does not contain placeholder tenant ID", () => {
    const files = azureTemplate("prod", options);
    expect(files.indexTs).not.toContain("your-tenant-id");
  });

  it("falls back to defaults when no options provided", () => {
    const files = azureTemplate("myapp");
    expect(files.indexTs).toContain("rg-myapp-canadacentral");
    expect(files.indexTs).toContain('"your-tenant-id"');
  });
});

describe("multiCloudTemplate with options", () => {
  const options = {
    azure: {
      region: "northeurope",
      resourceGroupName: "rg-global-northeurope",
      tenantId: "",
    },
  };

  it("injects the resource group name from options", () => {
    const files = multiCloudTemplate("global", options);
    expect(files.indexTs).toContain('"rg-global-northeurope"');
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

  it("does not include tenant ID in generated code", () => {
    const files = multiCloudTemplate("global", options);
    expect(files.indexTs).not.toContain("tenantId");
  });
});
