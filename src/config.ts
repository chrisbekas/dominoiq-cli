import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

export interface AppConfig {
  baseUrl: string;
  command: string;
  token: string;
}

const CONFIG_PATH = join(homedir(), ".dominoiq-cli", "config.json");
const API_V1_PATH = "/api/v1";

const EMPTY_CONFIG: AppConfig = {
  baseUrl: "",
  command: "",
  token: "",
};

export function getConfigPath(): string {
  return CONFIG_PATH;
}

export function normalizeBaseUrl(value: string): string {
  const trimmed = value.trim();

  if (!trimmed) {
    return "";
  }

  try {
    const url = new URL(trimmed);
    let pathname = url.pathname.replace(/\/+$/, "");

    const apiV1Index = pathname.indexOf(API_V1_PATH);

    if (apiV1Index !== -1) {
      pathname = pathname.slice(0, apiV1Index + API_V1_PATH.length);
    } else {
      pathname = pathname + API_V1_PATH;
    }

    url.pathname = pathname;
    url.search = "";
    url.hash = "";

    return url.toString().replace(/\/$/, "");
  } catch {
    return trimmed.replace(/\/+$/, "");
  }
}

export function validateBaseUrl(value: string): string {
  const normalized = normalizeBaseUrl(value);

  if (!normalized) {
    throw new Error("The Domino REST API URL cannot be empty.");
  }

  try {
    new URL(normalized);
  } catch {
    throw new Error("The Domino REST API URL must be a valid absolute URL.");
  }

  return normalized;
}

export async function loadConfig(): Promise<AppConfig> {
  try {
    const raw = await readFile(CONFIG_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<AppConfig>;

    return {
      baseUrl: typeof parsed.baseUrl === "string" ? normalizeBaseUrl(parsed.baseUrl) : "",
      command: typeof parsed.command === "string" ? parsed.command.trim() : "",
      token: typeof parsed.token === "string" ? parsed.token.trim() : "",
    };
  } catch (error) {
    const fileError = error as NodeJS.ErrnoException;

    if (fileError.code === "ENOENT") {
      return { ...EMPTY_CONFIG };
    }

    throw error;
  }
}

export async function saveConfig(config: AppConfig): Promise<void> {
  await mkdir(dirname(CONFIG_PATH), { recursive: true });
  await writeFile(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}
