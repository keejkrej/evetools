import {
  EVE_DESIGN_PROTOCOL_VERSION,
  inspectDrawingOutcomeSchema,
} from "@evetools/drawing";
import { describe, expect, it, vi } from "vitest";
import {
  parsePenpotToolOutcome,
  PenpotDrawingClient,
  penpotDrawingClientConfigFromEnv,
  type ConnectPenpotMcpOptions,
  type PenpotMcpConnection,
} from "./penpot-drawing-client";

const inspectOutcome = {
  protocolVersion: EVE_DESIGN_PROTOCOL_VERSION,
  status: "ok" as const,
  data: {
    revision: "opaque:1",
    document: { fileId: "file-1", name: "Drawing" },
    page: { id: "page-1", name: "Page 1" },
    selectionIds: [],
    shapes: [],
    truncated: false,
  },
};

describe("PenpotDrawingClient", () => {
  it("lazily reuses one MCP connection and forwards abort and timeout", async () => {
    const callTool = vi.fn(async () => ({ structuredContent: inspectOutcome }));
    const close = vi.fn(async () => undefined);
    const connection: PenpotMcpConnection = { callTool, close };
    let connectOptions: ConnectPenpotMcpOptions | undefined;
    const connect = vi.fn(
      async (_endpoint: URL, options: ConnectPenpotMcpOptions) => {
        connectOptions = options;
        return connection;
      },
    );
    const client = new PenpotDrawingClient({
      endpoint: new URL("http://penpot-mcp.test/mcp"),
      requestTimeoutMs: 42_000,
      connect,
    });
    const controller = new AbortController();

    await expect(client.inspect({}, { signal: controller.signal })).resolves.toEqual(
      inspectOutcome,
    );
    await expect(client.inspect({ scope: "selection" })).resolves.toEqual(
      inspectOutcome,
    );
    await client.close();

    expect(connect).toHaveBeenCalledOnce();
    expect(connect).toHaveBeenCalledWith(
      new URL("http://penpot-mcp.test/mcp"),
      { signal: expect.any(AbortSignal), timeout: 42_000 },
    );
    expect(connectOptions?.signal).not.toBe(controller.signal);
    expect(callTool).toHaveBeenNthCalledWith(
      1,
      { name: "inspect_drawing", arguments: {} },
      { signal: controller.signal, timeout: 42_000 },
    );
    expect(close).toHaveBeenCalledOnce();
  });

  it("aborts connection setup with the request and configured timeout", async () => {
    const request = new AbortController();
    const connect = vi.fn(
      async (
        _endpoint: URL,
        options: { signal?: AbortSignal; timeout: number },
      ): Promise<PenpotMcpConnection> => {
        expect(options.timeout).toBe(42_000);
        return await new Promise((_, reject) => {
          options.signal?.addEventListener(
            "abort",
            () => reject(options.signal?.reason),
            { once: true },
          );
        });
      },
    );
    const client = new PenpotDrawingClient({
      endpoint: new URL("http://penpot-mcp.test/mcp"),
      requestTimeoutMs: 42_000,
      connect,
    });

    const inspection = client.inspect({}, { signal: request.signal });
    await vi.waitFor(() => expect(connect).toHaveBeenCalledOnce());
    request.abort(new Error("request aborted"));

    await expect(inspection).rejects.toThrow("request aborted");
    await expect(client.close()).resolves.toBeUndefined();
  });

  it("closes immediately while setup is pending and closes a late connection", async () => {
    let finishConnect: ((connection: PenpotMcpConnection) => void) | undefined;
    const connection = {
      callTool: vi.fn(async () => ({ structuredContent: inspectOutcome })),
      close: vi.fn(async () => undefined),
    } satisfies PenpotMcpConnection;
    let connectSignal: AbortSignal | undefined;
    const connect = vi.fn(
      (_endpoint: URL, options: ConnectPenpotMcpOptions) => {
        connectSignal = options.signal;
        return new Promise<PenpotMcpConnection>((resolve) => {
          finishConnect = resolve;
        });
      },
    );
    const client = new PenpotDrawingClient({
      endpoint: new URL("http://penpot-mcp.test/mcp"),
      requestTimeoutMs: 42_000,
      connect,
    });

    const inspection = client.inspect({});
    await vi.waitFor(() => expect(connect).toHaveBeenCalledOnce());
    const closeResult = await Promise.race([
      client.close().then(() => "closed"),
      new Promise<string>((resolve) =>
        setTimeout(() => resolve("still waiting"), 50),
      ),
    ]);

    expect(closeResult).toBe("closed");
    expect(connectSignal?.aborted).toBe(true);
    finishConnect?.(connection);
    await expect(inspection).rejects.toMatchObject({ name: "AbortError" });
    await vi.waitFor(() => expect(connection.close).toHaveBeenCalledOnce());
    expect(connection.callTool).not.toHaveBeenCalled();
  });

  it("falls back to JSON text content", () => {
    expect(
      parsePenpotToolOutcome(
        "inspect_drawing",
        { content: [{ type: "text", text: JSON.stringify(inspectOutcome) }] },
        inspectDrawingOutcomeSchema,
      ),
    ).toEqual(inspectOutcome);
  });

  it("rejects malformed success and error responses", () => {
    expect(() =>
      parsePenpotToolOutcome(
        "inspect_drawing",
        { structuredContent: { status: "ok" } },
        inspectDrawingOutcomeSchema,
      ),
    ).toThrow("invalid eve.design/v1 response");
    expect(() =>
      parsePenpotToolOutcome(
        "inspect_drawing",
        { isError: true, content: [{ type: "text", text: "failed" }] },
        inspectDrawingOutcomeSchema,
      ),
    ).toThrow("tool error");
  });

  it("preserves structured domain faults from MCP error results", () => {
    const outcome = {
      protocolVersion: EVE_DESIGN_PROTOCOL_VERSION,
      status: "error" as const,
      faults: [
        {
          code: "revision_conflict",
          message: "Inspect again before retrying.",
          retryable: true,
        },
      ],
    };

    expect(
      parsePenpotToolOutcome(
        "inspect_drawing",
        { isError: true, structuredContent: outcome },
        inspectDrawingOutcomeSchema,
      ),
    ).toEqual(outcome);
  });
});

describe("penpotDrawingClientConfigFromEnv", () => {
  it("requires an endpoint and appends the workspace token", () => {
    expect(penpotDrawingClientConfigFromEnv({})).toBeNull();

    const config = penpotDrawingClientConfigFromEnv({
      PENPOT_MCP_URL: "https://penpot.test/mcp?tenant=eve",
      PENPOT_MCP_USER_TOKEN: "secret token",
      PENPOT_MCP_REQUEST_TIMEOUT_MS: "90000",
    });

    expect(config?.endpoint.toString()).toBe(
      "https://penpot.test/mcp?tenant=eve&userToken=secret+token",
    );
    expect(config?.requestTimeoutMs).toBe(90_000);
  });

  it("uses a bounded default for an invalid timeout", () => {
    const config = penpotDrawingClientConfigFromEnv({
      PENPOT_MCP_URL: "http://localhost:4401/mcp",
      PENPOT_MCP_REQUEST_TIMEOUT_MS: "forever",
    });

    expect(config?.requestTimeoutMs).toBe(120_000);
  });

  it("rejects non-HTTP transports", () => {
    expect(() =>
      penpotDrawingClientConfigFromEnv({
        PENPOT_MCP_URL: "file:///tmp/mcp.sock",
      }),
    ).toThrow("HTTP or HTTPS");
  });
});
