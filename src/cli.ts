#!/usr/bin/env node

/**
 * Nimbus CLI — helper for managing cloud provider dependencies.
 *
 * Usage:
 *   npx @reyemtech/nimbus install aws        → npm install @pulumi/aws
 *   npx @reyemtech/nimbus install azure       → npm install @pulumi/azure-native
 *   npx @reyemtech/nimbus install aws azure   → npm install @pulumi/aws @pulumi/azure-native
 *   npx @reyemtech/nimbus check               → reports which providers are installed/missing
 *
 * @module cli
 */

import { execSync } from "child_process";

const PROVIDER_PACKAGES: Readonly<Record<string, ReadonlyArray<string>>> = {
  aws: ["@pulumi/aws"],
  azure: ["@pulumi/azure-native"],
  gcp: ["@pulumi/gcp"],
  kubernetes: ["@pulumi/kubernetes"],
};

const ALL_PROVIDERS = Object.keys(PROVIDER_PACKAGES);

function install(providers: string[]): void {
  const packages: string[] = [];

  for (const provider of providers) {
    const pkgs = PROVIDER_PACKAGES[provider];
    if (!pkgs) {
      console.error(`Unknown provider: "${provider}". Available: ${ALL_PROVIDERS.join(", ")}`);
      process.exit(1);
    }
    packages.push(...pkgs);
  }

  if (packages.length === 0) {
    console.error("Usage: nimbus install <provider> [provider...]");
    console.error(`Available providers: ${ALL_PROVIDERS.join(", ")}`);
    process.exit(1);
  }

  const cmd = `npm install ${packages.join(" ")}`;
  console.log(`Installing: ${packages.join(", ")}`);
  console.log(`Running: ${cmd}\n`);

  try {
    execSync(cmd, { stdio: "inherit" });
  } catch {
    console.error("\nInstallation failed.");
    process.exit(1);
  }
}

async function check(): Promise<void> {
  console.log("Checking cloud provider availability:\n");

  for (const [provider, packages] of Object.entries(PROVIDER_PACKAGES)) {
    const pkg = packages[0] ?? provider;
    try {
      await import(pkg);
      console.log(`  ${provider}: installed`);
    } catch {
      console.log(`  ${provider}: not installed (${pkg})`);
    }
  }

  console.log("\nInstall missing providers with: nimbus install <provider>");
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case "install":
      install(args.slice(1));
      break;
    case "check":
      await check();
      break;
    default:
      console.log("@reyemtech/nimbus CLI\n");
      console.log("Commands:");
      console.log("  install <provider> [provider...]  Install cloud provider packages");
      console.log("  check                             Check which providers are installed");
      console.log(`\nAvailable providers: ${ALL_PROVIDERS.join(", ")}`);
      if (command && command !== "help" && command !== "--help" && command !== "-h") {
        process.exit(1);
      }
  }
}

void main();
