/**
 * Template contract tests — catch hardcoded placeholders across ALL templates.
 *
 * These tests document every known placeholder pattern and verify:
 * 1. Placeholders that have prompt support are replaced when options are given
 * 2. Remaining placeholders are explicitly tracked (no silent regressions)
 * 3. Cross-cloud parity: if Azure prompts for a value, AWS should too (or be tracked)
 *
 * When adding a new prompt, add it to PROMPTED_PLACEHOLDERS and remove
 * the corresponding entry from KNOWN_UNPROMPTED_PLACEHOLDERS.
 */

import { describe, it, expect } from "vitest";
import { TEMPLATES, TEMPLATE_NAMES } from "../../src/cli/templates.js";
import type { TemplateName, ITemplateOptions } from "../../src/cli/templates.js";

// ---------------------------------------------------------------------------
// Placeholder pattern registry
// ---------------------------------------------------------------------------

/**
 * Patterns that indicate a placeholder value the user must manually edit.
 * Each entry documents which templates contain it and the severity.
 */
const PLACEHOLDER_PATTERNS: ReadonlyArray<{
  readonly pattern: string | RegExp;
  readonly label: string;
  readonly severity: "critical" | "warning";
  /** Templates where this placeholder is expected (in default/no-options mode). */
  readonly expectedIn: ReadonlyArray<TemplateName>;
}> = [
  {
    pattern: "example.com",
    label: "Placeholder domain name (includes db host substring)",
    severity: "critical",
    expectedIn: ["minimal-aws", "minimal-azure", "aws", "azure", "multi-cloud"],
  },
  {
    pattern: "1.2.3.4",
    label: "Placeholder IP address",
    severity: "critical",
    expectedIn: ["aws", "azure"],
  },
  {
    pattern: "db.internal.example.com",
    label: "Placeholder database host",
    severity: "warning",
    expectedIn: ["minimal-aws", "minimal-azure", "aws", "azure"],
  },
  {
    pattern: "change-me-in-pulumi-config",
    label: "Placeholder password",
    severity: "warning",
    expectedIn: ["minimal-aws", "minimal-azure", "aws", "azure"],
  },
  {
    pattern: /client: "acme"/,
    label: "Hardcoded client tag",
    severity: "warning",
    expectedIn: ["aws", "azure"],
  },
];

/**
 * Templates that are NOT expected to contain active (uncommented) cloud code.
 * The empty template only has commented-out examples.
 */
const SCAFFOLD_ONLY_TEMPLATES: ReadonlyArray<TemplateName> = ["empty"];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function contains(text: string, pattern: string | RegExp): boolean {
  return typeof pattern === "string" ? text.includes(pattern) : pattern.test(text);
}

function generateDefault(template: TemplateName): string {
  return TEMPLATES[template].generate("test-project").indexTs;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("template placeholder registry", () => {
  it("every template in TEMPLATE_NAMES has an entry in TEMPLATES", () => {
    for (const name of TEMPLATE_NAMES) {
      expect(TEMPLATES[name]).toBeDefined();
    }
  });

  describe("placeholder presence matches expectations (default generation)", () => {
    for (const entry of PLACEHOLDER_PATTERNS) {
      for (const template of TEMPLATE_NAMES) {
        if (SCAFFOLD_ONLY_TEMPLATES.includes(template)) continue;

        const shouldContain = entry.expectedIn.includes(template);
        const desc = shouldContain
          ? `${template} contains "${entry.label}"`
          : `${template} does NOT contain "${entry.label}"`;

        it(desc, () => {
          const code = generateDefault(template);
          if (shouldContain) {
            expect(contains(code, entry.pattern)).toBe(true);
          } else {
            expect(contains(code, entry.pattern)).toBe(false);
          }
        });
      }
    }
  });
});

describe("Azure placeholders are replaced when options are provided", () => {
  const azureOptions: ITemplateOptions = {
    azure: {
      region: "westeurope",
      resourceGroupName: "rg-custom-westeurope",
    },
  };

  const azureTemplates: ReadonlyArray<TemplateName> = ["minimal-azure", "azure", "multi-cloud"];

  for (const template of azureTemplates) {
    describe(template, () => {
      it("does not contain default region in resource group name", () => {
        const code = TEMPLATES[template].generate("proj", azureOptions).indexTs;
        expect(code).not.toContain("rg-proj-canadacentral");
      });

      it("contains the prompted resource group name", () => {
        const code = TEMPLATES[template].generate("proj", azureOptions).indexTs;
        expect(code).toContain("rg-custom-westeurope");
      });

      it("uses ensureResourceGroup for resource group declaration", () => {
        const code = TEMPLATES[template].generate("proj", azureOptions).indexTs;
        expect(code).toContain("ensureResourceGroup");
      });

      it("does not contain tenantId in generated code", () => {
        const code = TEMPLATES[template].generate("proj", azureOptions).indexTs;
        expect(code).not.toContain("tenantId");
      });
    });
  }

  describe("multi-cloud", () => {
    it("uses prompted region in Azure cloud target", () => {
      const code = TEMPLATES["multi-cloud"].generate("proj", azureOptions).indexTs;
      expect(code).toContain('{ provider: "azure", region: "westeurope" }');
    });
  });
});

describe("cross-cloud parity: placeholders shared by AWS and Azure", () => {
  /**
   * These placeholders exist in BOTH AWS and Azure full templates.
   * If one cloud gets a prompt to replace them, the other should too.
   * This test documents the current state: neither cloud prompts for these yet.
   *
   * When you add a prompt for one of these, update the test to verify
   * the prompted value is injected and remove it from this list.
   */
  const sharedPlaceholders = [
    { pattern: "example.com", label: "domain name" },
    { pattern: "1.2.3.4", label: "IP address" },
    { pattern: "db.internal.example.com", label: "database host" },
    { pattern: "change-me-in-pulumi-config", label: "database password" },
    { pattern: /client: "acme"/, label: "client tag" },
  ];

  for (const { pattern, label } of sharedPlaceholders) {
    it(`"${label}" placeholder exists in both aws and azure templates (unprompted)`, () => {
      const awsCode = TEMPLATES["aws"].generate("proj").indexTs;
      const azureCode = TEMPLATES["azure"].generate("proj").indexTs;

      expect(contains(awsCode, pattern)).toBe(true);
      expect(contains(azureCode, pattern)).toBe(true);
    });
  }
});

describe("no unexpected placeholders in non-cloud templates", () => {
  it("empty template does not contain any critical placeholders", () => {
    const code = TEMPLATES["empty"].generate("proj").indexTs;

    for (const entry of PLACEHOLDER_PATTERNS) {
      if (entry.severity === "critical") {
        // Empty template has everything commented out, so active placeholders
        // should not exist. We check lines that are NOT comments.
        const activeLines = code
          .split("\n")
          .filter((line) => !line.trimStart().startsWith("//"))
          .join("\n");
        expect(contains(activeLines, entry.pattern)).toBe(false);
      }
    }
  });

  it("minimal-aws does not contain Azure-specific placeholders", () => {
    const code = TEMPLATES["minimal-aws"].generate("proj").indexTs;
    expect(code).not.toContain("your-tenant-id");
    expect(code).not.toContain("resourceGroupName");
    expect(code).not.toContain("canadacentral");
  });
});

describe("template output structure", () => {
  for (const template of TEMPLATE_NAMES) {
    it(`${template} generates both indexTs and readmeMd`, () => {
      const files = TEMPLATES[template].generate("test-proj");
      expect(files.indexTs).toBeTruthy();
      expect(files.readmeMd).toBeTruthy();
    });

    it(`${template} includes project name in generated code`, () => {
      const files = TEMPLATES[template].generate("my-unique-proj");
      expect(files.indexTs).toContain("my-unique-proj");
      expect(files.readmeMd).toContain("my-unique-proj");
    });
  }
});
