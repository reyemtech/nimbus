/**
 * Generic readline prompt utility for CLI interactive input.
 *
 * Uses Node's built-in `readline` module to prompt users for input.
 *
 * @module cli/prompt
 */

import { createInterface } from "readline";
import type { Interface as ReadlineInterface } from "readline";

/** Options for a single prompt question. */
export interface IPromptOptions {
  /** Default value shown in brackets, used if user presses Enter. */
  readonly defaultValue?: string;
  /** If true, re-prompts when the answer is empty and no default is set. */
  readonly required?: boolean;
}

/**
 * Create a readline interface for interactive prompts.
 *
 * @returns A readline interface connected to stdin/stdout
 */
export function createPromptInterface(): ReadlineInterface {
  return createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

/**
 * Ask the user a question via readline and return their answer.
 *
 * Shows the default value in brackets (e.g., `"Region [canadacentral]: "`).
 * Re-prompts if `required` is true and the answer is empty with no default.
 *
 * @param rl - Readline interface
 * @param question - The question text to display
 * @param options - Prompt options (defaultValue, required)
 * @returns The user's answer or the default value
 */
export function askQuestion(
  rl: ReadlineInterface,
  question: string,
  options: IPromptOptions = {}
): Promise<string> {
  const { defaultValue, required } = options;
  const suffix = defaultValue ? ` [${defaultValue}]` : "";
  const prompt = `${question}${suffix}: `;

  return new Promise((resolve) => {
    const ask = (): void => {
      rl.question(prompt, (answer: string) => {
        const trimmed = answer.trim();
        if (trimmed) {
          resolve(trimmed);
        } else if (defaultValue) {
          resolve(defaultValue);
        } else if (required) {
          console.log("  This field is required. Please enter a value.");
          ask();
        } else {
          resolve("");
        }
      });
    };
    ask();
  });
}
