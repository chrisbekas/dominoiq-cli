#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { emitKeypressEvents } from "node:readline";
import { createInterface } from "node:readline/promises";
import process from "node:process";
import ora from "ora";
import chalk from "chalk";
import figlet from "figlet";
import { Command } from "commander";
import { getConfigPath, loadConfig, saveConfig, type AppConfig, validateBaseUrl } from "./config";
import { formatCompletionResponse, login, logout, requestCompletion } from "./dominoApi";

type CliOptions = {
  prompt?: string;
};

type SlashCommandResult = {
  config: AppConfig;
  shouldExit: boolean;
};

function readPackageVersion(): string {
  const packageJsonPath = join(__dirname, "..", "package.json");
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as { version?: string };
  return packageJson.version ?? "0.0.0";
}

function requirePromptResult<T>(value: T | undefined, action: string): T {
  if (value === undefined) {
    throw new Error(`${action} was cancelled.`);
  }

  return value;
}

function buildPromptLabel(label: string, currentValue?: string): string {
  return currentValue ? `${label} [${currentValue}]: ` : `${label}: `;
}

async function askLine(label: string, currentValue?: string): Promise<string> {
  const readline = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const promptLabel = currentValue === undefined ? `${label} ` : buildPromptLabel(label, currentValue);
    const response = await readline.question(promptLabel);
    return response.trim();
  } finally {
    readline.close();
  }
}

async function askHiddenLine(label: string): Promise<string> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return askLine(label);
  }

  return new Promise<string>((resolve, reject) => {
    const previousRawMode = process.stdin.isRaw;
    let value = "";

    const cleanup = () => {
      process.stdin.removeListener("keypress", onKeypress);
      process.stdin.setRawMode?.(previousRawMode);
      process.stdin.pause();
      process.stdout.write("\n");
    };

    const onKeypress = (text: string, key: { ctrl?: boolean; name?: string; sequence?: string }) => {
      if (key.ctrl && key.name === "c") {
        cleanup();
        reject(new Error("Login was cancelled."));
        return;
      }

      if (key.name === "return" || key.name === "enter") {
        cleanup();
        resolve(value);
        return;
      }

      if (key.name === "backspace") {
        if (value.length > 0) {
          value = value.slice(0, -1);
          process.stdout.write("\b \b");
        }
        return;
      }

      if (!key.sequence || key.name === "escape") {
        return;
      }

      value += text;
      process.stdout.write("*");
    };

    emitKeypressEvents(process.stdin);
    process.stdout.write(`${label}: `);
    process.stdin.resume();
    process.stdin.setRawMode?.(true);
    process.stdin.on("keypress", onKeypress);
  });
}

async function askWithHistory(label: string, history: string[]): Promise<string> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return askLine(label);
  }

  return new Promise<string>((resolve, reject) => {
    const previousRawMode = process.stdin.isRaw;
    let value = "";
    let cursor = 0;
    let historyIndex = -1;
    let savedInput = "";

    const write = (s: string) => process.stdout.write(s);

    const redraw = (newValue: string, newCursor: number) => {
      write("\r" + label + " " + newValue + "\x1b[K");
      const moveBack = newValue.length - newCursor;
      if (moveBack > 0) write(`\x1b[${moveBack}D`);
      value = newValue;
      cursor = newCursor;
    };

    const cleanup = () => {
      process.stdin.removeListener("keypress", onKeypress);
      process.stdin.setRawMode?.(previousRawMode);
      process.stdin.pause();
      write("\n");
    };

    const onKeypress = (text: string, key: { ctrl?: boolean; meta?: boolean; name?: string; sequence?: string }) => {
      if (!key) return;

      if (key.ctrl && key.name === "c") {
        cleanup();
        reject(new Error("Cancelled."));
        return;
      }

      if (key.name === "return" || key.name === "enter") {
        cleanup();
        resolve(value);
        return;
      }

      if (key.name === "up") {
        if (history.length === 0) return;
        if (historyIndex === -1) savedInput = value;
        historyIndex = Math.min(historyIndex + 1, history.length - 1);
        const entry = history[history.length - 1 - historyIndex] ?? "";
        redraw(entry, entry.length);
        return;
      }

      if (key.name === "down") {
        if (historyIndex === -1) return;
        historyIndex--;
        const entry = historyIndex === -1 ? savedInput : (history[history.length - 1 - historyIndex] ?? "");
        redraw(entry, entry.length);
        return;
      }

      if (key.name === "left") {
        if (cursor > 0) { cursor--; write("\x1b[1D"); }
        return;
      }

      if (key.name === "right") {
        if (cursor < value.length) { cursor++; write("\x1b[1C"); }
        return;
      }

      if (key.name === "home") {
        if (cursor > 0) { write(`\x1b[${cursor}D`); cursor = 0; }
        return;
      }

      if (key.name === "end") {
        const moveRight = value.length - cursor;
        if (moveRight > 0) { write(`\x1b[${moveRight}C`); cursor = value.length; }
        return;
      }

      if (key.name === "backspace") {
        if (cursor > 0) redraw(value.slice(0, cursor - 1) + value.slice(cursor), cursor - 1);
        return;
      }

      if (key.name === "delete") {
        if (cursor < value.length) redraw(value.slice(0, cursor) + value.slice(cursor + 1), cursor);
        return;
      }

      if (!key.sequence || key.ctrl || key.meta || key.name === "escape") return;

      redraw(value.slice(0, cursor) + text + value.slice(cursor), cursor + text.length);
    };

    emitKeypressEvents(process.stdin);
    write(`${label} `);
    process.stdin.resume();
    process.stdin.setRawMode?.(true);
    process.stdin.on("keypress", onKeypress);
  });
}

function printWelcome(config: AppConfig): void {
  const banner = figlet.textSync("dominoiq-cli", { font: "Slant" });
  console.log(chalk.cyan(banner));
  console.log("");

  const check = chalk.green("✔");
  const cross = chalk.dim("○");

  console.log(`  ${config.baseUrl ? check : cross}  REST API URL     ${config.baseUrl ? chalk.white(config.baseUrl) : chalk.dim("not set — use /config")}`);
  console.log(`  ${config.command ? check : cross}  Default command  ${config.command ? chalk.white(config.command) : chalk.dim("not set — use /commands")}`);
  console.log(`  ${config.token ? check : cross}  Logged in        ${config.token ? chalk.white("Yes") : chalk.dim("No — use /login")}`);
  console.log("");
  console.log(chalk.dim("  Type /help for commands, or enter a prompt to send it to DominoIQ."));
  console.log("");
}

function printHelp(): void {
  console.log(chalk.cyan("Slash commands"));
  console.log("  /config [url]     Set the Domino API base URL");
  console.log("  /commands [name]  Set the default command payload value");
  console.log("  /login            Authenticate and save the JWT");
  console.log("  /logout           Log out and clear your session");
  console.log("  /status           Show the current configuration");
  console.log("  /help             Show this help");
  console.log("  /exit             Exit the CLI");
  console.log("");
}

function printStatus(config: AppConfig): void {
  const check = chalk.green("✔");
  const cross = chalk.dim("○");

  console.log(`  ${config.baseUrl ? check : cross}  REST API URL     ${config.baseUrl ? chalk.white(config.baseUrl) : chalk.dim("not set — use /config")}`);
  console.log(`  ${config.command ? check : cross}  Default command  ${config.command ? chalk.white(config.command) : chalk.dim("not set — use /commands")}`);
  console.log(`  ${config.token ? check : cross}  Logged in        ${config.token ? chalk.white("Yes") : chalk.dim("No — use /login")}`);
  console.log(`  ${check}  Config file      ${chalk.white(getConfigPath())}`);
  console.log("");
}

function parseSlashCommand(input: string): { name: string; argument: string } {
  const trimmed = input.trim();
  const firstSpace = trimmed.indexOf(" ");

  if (firstSpace === -1) {
    return { name: trimmed.toLowerCase(), argument: "" };
  }

  return {
    name: trimmed.slice(0, firstSpace).toLowerCase(),
    argument: trimmed.slice(firstSpace + 1).trim(),
  };
}

async function promptForBaseUrl(currentBaseUrl: string, inlineValue: string): Promise<string> {
  if (inlineValue) {
    return validateBaseUrl(inlineValue);
  }

  const response = requirePromptResult(
    await askLine("Domino API base URL", currentBaseUrl || "http://localhost:8880"),
    "REST API URL update",
  );

  return validateBaseUrl(response || currentBaseUrl || "http://localhost:8880");
}

async function promptForCommand(currentCommand: string, inlineValue: string): Promise<string> {
  if (inlineValue) {
    const command = inlineValue.trim();
    if (!command) {
      throw new Error("The command cannot be empty.");
    }

    return command;
  }

  const response = requirePromptResult(
    await askLine("Default DominoIQ command", currentCommand || "StdReplyEmail"),
    "Command update",
  );
  const nextCommand = (response || currentCommand || "StdReplyEmail").trim();

  if (!nextCommand) {
    throw new Error("The command cannot be empty.");
  }

  return nextCommand;
}

async function promptForLogin(config: AppConfig): Promise<AppConfig> {
  if (!config.baseUrl) {
    throw new Error("Set the Domino API base URL with /config before logging in.");
  }

  const username = requirePromptResult(await askLine("username:"), "Login").trim();
  const password = requirePromptResult(await askHiddenLine("password"), "Login");

  if (!username) {
    throw new Error("The username cannot be empty.");
  }

  if (!password.trim()) {
    throw new Error("The password cannot be empty.");
  }

  const token = await login(config.baseUrl, username, password);

  const nextConfig = { ...config, token };
  await saveConfig(nextConfig);

  console.log(chalk.green("Login succeeded."));
  console.log("");

  return nextConfig;
}

async function updateBaseUrl(config: AppConfig, inlineValue: string): Promise<AppConfig> {
  const baseUrl = await promptForBaseUrl(config.baseUrl, inlineValue);
  const nextConfig = { ...config, baseUrl };
  await saveConfig(nextConfig);
  console.log(chalk.green(`REST API URL saved: ${baseUrl}`));
  console.log("");
  return nextConfig;
}

async function updateCommand(config: AppConfig, inlineValue: string): Promise<AppConfig> {
  const command = await promptForCommand(config.command, inlineValue);
  const nextConfig = { ...config, command };
  await saveConfig(nextConfig);
  console.log(chalk.green(`Default command saved: ${command}`));
  console.log("");
  return nextConfig;
}

async function clearToken(config: AppConfig): Promise<AppConfig> {
  if (config.token && config.baseUrl) {
    try {
      await logout(config.baseUrl, config.token);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Logout request failed.";
      console.log(chalk.yellow(`Warning: could not invalidate token on the server: ${message}`));
      console.log(chalk.dim("The saved JWT will still be cleared locally."));
      console.log("");
    }
  }

  const nextConfig = { ...config, token: "" };
  await saveConfig(nextConfig);
  console.log(chalk.green("Logged out successfully."));
  console.log("");
  return nextConfig;
}

function assertReadyToSend(config: AppConfig): void {
  if (!config.baseUrl) {
    throw new Error("Set the Domino API base URL with /config before sending prompts.");
  }

  if (!config.command) {
    throw new Error("Set the default command with /commands before sending prompts.");
  }

  if (!config.token) {
    throw new Error("Run /login before sending prompts.");
  }
}

async function sendPrompt(promptText: string, config: AppConfig): Promise<void> {
  assertReadyToSend(config);
  const spinner = ora({ text: "Working...", spinner: "dots" }).start();
  let responseBody: unknown;

  try {
    responseBody = await requestCompletion(config.baseUrl, config.token, config.command, promptText);
    spinner.stop();
  } catch (error) {
    spinner.stop();
    throw error;
  }

  console.log("");
  console.log(formatCompletionResponse(responseBody));
  console.log("");
}

async function handleSlashCommand(input: string, config: AppConfig): Promise<SlashCommandResult> {
  const { name, argument } = parseSlashCommand(input);

  switch (name) {
    case "/config":
      return { config: await updateBaseUrl(config, argument), shouldExit: false };
    case "/commands":
    case "/command":
      return { config: await updateCommand(config, argument), shouldExit: false };
    case "/login":
      return { config: await promptForLogin(config), shouldExit: false };
    case "/logout":
      return { config: await clearToken(config), shouldExit: false };
    case "/status":
      printStatus(config);
      return { config, shouldExit: false };
    case "/help":
      printHelp();
      return { config, shouldExit: false };
    case "/exit":
    case "/quit":
      return { config, shouldExit: true };
    default:
      console.log(chalk.yellow(`Unknown command: ${name}`));
      console.log(chalk.dim("Type /help to list the available slash commands."));
      console.log("");
      return { config, shouldExit: false };
  }
}

async function runInteractive(): Promise<void> {
  let config = await loadConfig();
  printWelcome(config);
  const history: string[] = [];

  while (true) {
    const input = (await askWithHistory(chalk.gray(">"), history)).trim();

    if (!input) {
      continue;
    }

    if (history.length === 0 || history[history.length - 1] !== input) {
      history.push(input);
    }

    try {
      if (input.startsWith("/")) {
        const result = await handleSlashCommand(input, config);
        config = result.config;

        if (result.shouldExit) {
          break;
        }

        continue;
      }

      await sendPrompt(input, config);
    } catch (error) {
      const message = error instanceof Error ? error.message : "An unexpected error occurred.";
      console.error(chalk.red(message));
      console.log("");
    }
  }
}

async function runSinglePrompt(promptText: string): Promise<void> {
  const config = await loadConfig();
  await sendPrompt(promptText.trim(), config);
}

async function main(): Promise<void> {
  const program = new Command();

  program
    .name("dominoiq-cli")
    .description("Send prompts to DominoIQ through the Domino REST API.")
    .version(readPackageVersion())
    .option("-p, --prompt <text>", "send one prompt without entering interactive mode");

  program.parse(process.argv);

  const options = program.opts<CliOptions>();

  if (options.prompt) {
    await runSinglePrompt(options.prompt);
    return;
  }

  await runInteractive();
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "An unexpected error occurred.";
  console.error(chalk.red(message));
  process.exitCode = 1;
});
