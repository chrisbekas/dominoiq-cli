type JsonRecord = Record<string, unknown>;
const AUTH_PATH = "auth";
const LOGOUT_PATH = "auth/logout";
const COMPLETION_PATH = "dominoiq/completion";

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readJsonResponse(response: Response, operation: string): Promise<unknown> {
  const bodyText = await response.text();

  if (!response.ok) {
    const details = bodyText.trim() || response.statusText;
    throw new Error(`${operation} failed with ${response.status}: ${details}`);
  }

  if (!bodyText.trim()) {
    throw new Error(`${operation} returned an empty response body.`);
  }

  try {
    return JSON.parse(bodyText) as unknown;
  } catch {
    throw new Error(`${operation} returned non-JSON content.`);
  }
}

function extractErrorDetails(bodyText: string, fallback: string): string {
  const trimmed = bodyText.trim();

  if (!trimmed) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (typeof parsed === "string" && parsed.trim()) {
      return parsed.trim();
    }

    if (isRecord(parsed)) {
      const detailFields = ["message", "error", "detail", "details", "title"];

      for (const fieldName of detailFields) {
        const value = getStringField(parsed, fieldName);
        if (value) {
          return value;
        }
      }
    }
  } catch {
    return trimmed;
  }

  return trimmed;
}

function getStringField(record: JsonRecord, fieldName: string): string | undefined {
  const value = record[fieldName];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function isExpiredTokenError(status: number, bodyText: string): boolean {
  if (status === 401 || status === 403) {
    return true;
  }

  if (status === 500) {
    const lower = bodyText.toLowerCase();
    return (
      lower.includes("jwt") ||
      lower.includes("token expired") ||
      lower.includes("token is expired") ||
      lower.includes("expired token") ||
      lower.includes("unauthorized") ||
      lower.includes("authentication provider") ||
      lower.includes("unable to find")
    );
  }

  return false;
}

function buildDominoUrl(baseUrl: string, path: string): string {
  return new URL(path, `${baseUrl}/`).toString();
}

function formatFetchFailureMessage(
  operation: string,
  requestUrl: string,
  error: unknown,
  configHint?: string,
): string {
  const details =
    error instanceof Error && error.message.trim() ? error.message.trim() : "The request could not be sent.";
  const normalizedDetails = /[.!?]$/.test(details) ? details : `${details}.`;
  const hint = configHint ? ` ${configHint}` : "";
  return `${operation} could not reach ${requestUrl}. ${normalizedDetails}${hint}`;
}

function extractJwt(responseBody: unknown): string {
  if (typeof responseBody === "string" && responseBody.trim()) {
    return responseBody.trim();
  }

  if (!isRecord(responseBody)) {
    throw new Error("Auth response did not contain a JWT.");
  }

  const candidateFields = ["bearer", "token", "jwt", "accessToken", "access_token"];

  for (const fieldName of candidateFields) {
    const token = getStringField(responseBody, fieldName);
    if (token) {
      return token;
    }
  }

  const nestedData = responseBody.data;
  if (isRecord(nestedData)) {
    for (const fieldName of candidateFields) {
      const token = getStringField(nestedData, fieldName);
      if (token) {
        return token;
      }
    }
  }

  throw new Error("Auth response did not contain a JWT in bearer, token, jwt, accessToken, or access_token.");
}

export async function login(baseUrl: string, username: string, password: string): Promise<string> {
  const requestUrl = buildDominoUrl(baseUrl, AUTH_PATH);
  let response: Response;

  try {
    response = await fetch(requestUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ username, password }),
    });
  } catch (error) {
    throw new Error(formatFetchFailureMessage("Login", requestUrl, error));
  }

  if (!response.ok) {
    const details = extractErrorDetails(await response.text(), response.statusText);

    if (response.status === 401 || response.status === 403) {
      throw new Error(
        `Login failed. Check your username and password, then verify the Domino API base URL with /status or update it with /config if needed.`,
      );
    }

    throw new Error(`Login failed with ${response.status}: ${details}`);
  }

  const responseBody = await readJsonResponse(response, "Login");
  return extractJwt(responseBody);
}

export async function logout(baseUrl: string, token: string): Promise<void> {
  const requestUrl = buildDominoUrl(baseUrl, LOGOUT_PATH);

  try {
    const response = await fetch(requestUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ logout: "Yes" }),
    });

    if (!response.ok) {
      const bodyText = await response.text();
      const details = extractErrorDetails(bodyText, response.statusText);
      throw new Error(`Logout failed with ${response.status}: ${details}`);
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Logout failed")) {
      throw error;
    }
    throw new Error(formatFetchFailureMessage("Logout", requestUrl, error));
  }
}

export async function requestCompletion(baseUrl: string, token: string, command: string, payload: string): Promise<unknown> {
  const requestUrl = buildDominoUrl(baseUrl, COMPLETION_PATH);
  let response: Response;

  try {
    response = await fetch(requestUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ command, payload }),
    });
  } catch (error) {
    throw new Error(
      formatFetchFailureMessage(
        "Completion request",
        requestUrl,
        error,
        "Check your CLI configuration with /status and update it with /config or /login if needed.",
      ),
    );
  }

  if (!response.ok) {
    const bodyText = await response.text();

    if (isExpiredTokenError(response.status, bodyText)) {
      throw new Error("Your session has expired or is invalid. Run /login to authenticate again.");
    }

    const details = extractErrorDetails(bodyText, response.statusText);
    throw new Error(`Completion request failed with ${response.status}: ${details}`);
  }

  return readJsonResponse(response, "Completion request");
}

export function formatCompletionResponse(responseBody: unknown): string {
  if (typeof responseBody === "string") {
    return responseBody;
  }

  if (Array.isArray(responseBody)) {
    return JSON.stringify(responseBody, null, 2);
  }

  if (isRecord(responseBody)) {
    const preferredFields = ["content", "completion", "response", "result", "message", "text", "output", "payload"];

    for (const fieldName of preferredFields) {
      const value = responseBody[fieldName];
      if (typeof value === "string" && value.trim()) {
        return value;
      }
    }
  }

  return JSON.stringify(responseBody, null, 2);
}
