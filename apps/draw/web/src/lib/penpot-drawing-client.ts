import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {
  applyDrawingPatchOutcomeSchema,
  exportDrawingOutcomeSchema,
  inspectDrawingOutcomeSchema,
  type ApplyDrawingPatchToolInput,
  type ApplyDrawingPatchOutcome,
  type DrawingToolClient,
  type ExportDrawingToolInput,
  type ExportDrawingOutcome,
  type InspectDrawingToolInput,
  type InspectDrawingOutcome,
} from "@evetools/drawing";
import type { z } from "zod";

export type PenpotDrawingToolName =
  | "inspect_drawing"
  | "apply_drawing_patch"
  | "export_drawing";

type McpToolResult = {
  content?: Array<{ type: string; text?: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
};

export interface PenpotMcpConnection {
  callTool(
    request: { name: PenpotDrawingToolName; arguments: Record<string, unknown> },
    options?: { signal?: AbortSignal; timeout?: number },
  ): Promise<McpToolResult>;
  close(): Promise<void>;
}

export type ConnectPenpotMcpOptions = {
  signal?: AbortSignal;
  timeout: number;
};

export type ConnectPenpotMcp = (
  endpoint: URL,
  options: ConnectPenpotMcpOptions,
) => Promise<PenpotMcpConnection>;

export type PenpotDrawingClientConfig = {
  endpoint: URL;
  requestTimeoutMs: number;
  connect?: ConnectPenpotMcp;
};

type OutcomeSchema<T> = z.ZodType<T>;

const DEFAULT_REQUEST_TIMEOUT_MS = 120_000;
const MIN_REQUEST_TIMEOUT_MS = 1_000;
const MAX_REQUEST_TIMEOUT_MS = 300_000;

async function connectPenpotMcp(
  endpoint: URL,
  options: ConnectPenpotMcpOptions,
): Promise<PenpotMcpConnection> {
  const client = new Client({ name: "evedraw", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(endpoint);
  await client.connect(transport, {
    signal: options.signal,
    timeout: options.timeout,
    maxTotalTimeout: options.timeout,
  });

  return {
    callTool: (request, options) =>
      client.callTool(request, undefined, {
        signal: options?.signal,
        timeout: options?.timeout,
        maxTotalTimeout: options?.timeout,
      }) as Promise<McpToolResult>,
    close: () => client.close(),
  };
}

function parseTextContent(result: McpToolResult): unknown {
  const text = result.content?.find(
    (item) => item.type === "text" && typeof item.text === "string",
  )?.text;
  if (!text) return undefined;

  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

export function parsePenpotToolOutcome<T>(
  toolName: PenpotDrawingToolName,
  result: McpToolResult,
  schema: OutcomeSchema<T>,
): T {
  const payload = result.structuredContent ?? parseTextContent(result);
  const parsed = schema.safeParse(payload);
  if (parsed.success) return parsed.data;

  const reason = result.isError
    ? "Penpot reported a tool error without a valid eve.design/v1 fault envelope."
    : "Penpot returned an invalid eve.design/v1 response.";
  throw new Error(`${toolName}: ${reason}`);
}

export class PenpotDrawingClient implements DrawingToolClient {
  readonly #config: PenpotDrawingClientConfig;
  readonly #connectAbortController = new AbortController();
  #connection?: Promise<PenpotMcpConnection>;
  #connected?: PenpotMcpConnection;
  #closed = false;

  constructor(config: PenpotDrawingClientConfig) {
    this.#config = config;
  }

  inspect(
    input: InspectDrawingToolInput,
    options?: { signal?: AbortSignal },
  ): Promise<InspectDrawingOutcome> {
    return this.#call(
      "inspect_drawing",
      input,
      inspectDrawingOutcomeSchema,
      options?.signal,
    );
  }

  apply(
    input: ApplyDrawingPatchToolInput,
    options?: { signal?: AbortSignal },
  ): Promise<ApplyDrawingPatchOutcome> {
    return this.#call(
      "apply_drawing_patch",
      input,
      applyDrawingPatchOutcomeSchema,
      options?.signal,
    );
  }

  export(
    input: ExportDrawingToolInput,
    options?: { signal?: AbortSignal },
  ): Promise<ExportDrawingOutcome> {
    return this.#call(
      "export_drawing",
      input,
      exportDrawingOutcomeSchema,
      options?.signal,
    );
  }

  async close(): Promise<void> {
    if (this.#closed) return;
    this.#closed = true;
    this.#connectAbortController.abort(
      new DOMException("The Penpot drawing client was closed.", "AbortError"),
    );
    const connection = this.#connected;
    this.#connected = undefined;
    this.#connection = undefined;
    if (connection) await connection.close();
  }

  async #call<T>(
    toolName: PenpotDrawingToolName,
    input: object,
    schema: OutcomeSchema<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    const connection = await this.#getConnection(signal);
    const result = await connection.callTool(
      { name: toolName, arguments: input as Record<string, unknown> },
      { signal, timeout: this.#config.requestTimeoutMs },
    );
    return parsePenpotToolOutcome(toolName, result, schema);
  }

  #getConnection(signal?: AbortSignal): Promise<PenpotMcpConnection> {
    if (this.#closed) {
      return Promise.reject(
        new DOMException("The Penpot drawing client is closed.", "AbortError"),
      );
    }
    if (!this.#connection) {
      const connectSignal = signal
        ? AbortSignal.any([signal, this.#connectAbortController.signal])
        : this.#connectAbortController.signal;
      this.#connection = (this.#config.connect ?? connectPenpotMcp)(
        this.#config.endpoint,
        { signal: connectSignal, timeout: this.#config.requestTimeoutMs },
      ).then(async (connection) => {
        if (this.#closed) {
          await connection.close().catch(() => undefined);
          throw new DOMException(
            "The Penpot drawing client was closed during connection setup.",
            "AbortError",
          );
        }
        this.#connected = connection;
        return connection;
      });
    }
    return this.#connection;
  }
}

export function penpotDrawingClientConfigFromEnv(
  environment: Record<string, string | undefined> = process.env,
): PenpotDrawingClientConfig | null {
  const rawEndpoint = environment.PENPOT_MCP_URL?.trim();
  if (!rawEndpoint) return null;

  const endpoint = new URL(rawEndpoint);
  if (endpoint.protocol !== "http:" && endpoint.protocol !== "https:") {
    throw new Error("PENPOT_MCP_URL must use HTTP or HTTPS.");
  }
  const userToken = environment.PENPOT_MCP_USER_TOKEN?.trim();
  if (userToken) endpoint.searchParams.set("userToken", userToken);

  const rawTimeout = environment.PENPOT_MCP_REQUEST_TIMEOUT_MS?.trim();
  const parsedTimeout = rawTimeout ? Number(rawTimeout) : NaN;
  const requestTimeoutMs =
    Number.isInteger(parsedTimeout) &&
    parsedTimeout >= MIN_REQUEST_TIMEOUT_MS &&
    parsedTimeout <= MAX_REQUEST_TIMEOUT_MS
      ? parsedTimeout
      : DEFAULT_REQUEST_TIMEOUT_MS;

  return { endpoint, requestTimeoutMs };
}

export function createPenpotDrawingClientFromEnv(
  environment: Record<string, string | undefined> = process.env,
): PenpotDrawingClient | null {
  const config = penpotDrawingClientConfigFromEnv(environment);
  return config ? new PenpotDrawingClient(config) : null;
}
