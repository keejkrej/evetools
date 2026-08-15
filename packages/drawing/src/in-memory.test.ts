import { describe, expect, it } from "vitest";
import {
  DrawingOpenError,
  EVE_DESIGN_PROTOCOL_VERSION,
  createInMemoryDrawingEditor,
  drawingToolClientFromSession,
} from "./index";

const SHAPE_1 = "00000000-0000-4000-8000-000000000001";
const SHAPE_2 = "00000000-0000-4000-8000-000000000002";
const SHAPE_3 = "00000000-0000-4000-8000-000000000003";

describe("in-memory drawing contract", () => {
  it("opens a document and inspects its empty first revision", async () => {
    const editor = createInMemoryDrawingEditor();
    const session = await editor.open({
      protocolVersion: EVE_DESIGN_PROTOCOL_VERSION,
      documentId: "drawing-1",
      createIfMissing: true,
    });

    await expect(
      session.inspect({
        protocolVersion: EVE_DESIGN_PROTOCOL_VERSION,
        scope: "current-page",
      }),
    ).resolves.toEqual({
      protocolVersion: EVE_DESIGN_PROTOCOL_VERSION,
      status: "ok",
      data: {
        revision: "memory:0",
        document: { fileId: "drawing-1" },
        page: { id: "page-1" },
        selectionIds: [],
        shapes: [],
        truncated: false,
      },
    });
  });

  it("conforms to the protocol-free production tool seam", async () => {
    const editor = createInMemoryDrawingEditor();
    const session = await editor.open({
      protocolVersion: EVE_DESIGN_PROTOCOL_VERSION,
      documentId: "drawing-1",
      createIfMissing: true,
    });
    const client = drawingToolClientFromSession(session);

    await expect(client.inspect({})).resolves.toMatchObject({
      protocolVersion: EVE_DESIGN_PROTOCOL_VERSION,
      status: "ok",
      data: { revision: "memory:0", shapes: [] },
    });
  });

  it("applies a create operation atomically and returns its durable id", async () => {
    const editor = createInMemoryDrawingEditor({
      createId: () => SHAPE_1,
    });
    const session = await editor.open({
      protocolVersion: EVE_DESIGN_PROTOCOL_VERSION,
      documentId: "drawing-1",
      createIfMissing: true,
    });

    const receipt = await session.apply({
      protocolVersion: EVE_DESIGN_PROTOCOL_VERSION,
      baseRevision: "memory:0",
      idempotencyKey: "turn-1:tool-1",
      await: "persisted",
      operations: [
        {
          op: "create",
          kind: "rectangle",
          clientId: "rectangle-a",
          x: 10,
          y: 20,
          width: 120,
          height: 80,
          style: { fill: "#ffffff" },
        },
      ],
    });

    expect(receipt).toEqual({
      protocolVersion: EVE_DESIGN_PROTOCOL_VERSION,
      status: "ok",
      data: {
        revision: "memory:1",
        persisted: true,
        idMap: { "rectangle-a": SHAPE_1 },
        changedShapeIds: [SHAPE_1],
        warnings: [],
      },
    });
    await expect(
      session.inspect({
        protocolVersion: EVE_DESIGN_PROTOCOL_VERSION,
        scope: "current-page",
      }),
    ).resolves.toMatchObject({
      status: "ok",
      data: {
        revision: "memory:1",
        shapes: [
          {
            id: SHAPE_1,
            type: "rectangle",
            x: 10,
            y: 20,
            width: 120,
            height: 80,
            style: { fill: "#ffffff" },
          },
        ],
      },
    });
  });

  it("patches an existing shape without replacing its other fields", async () => {
    const editor = createInMemoryDrawingEditor({ createId: () => SHAPE_1 });
    const session = await editor.open({
      protocolVersion: EVE_DESIGN_PROTOCOL_VERSION,
      documentId: "drawing-1",
      createIfMissing: true,
    });
    await session.apply({
      protocolVersion: EVE_DESIGN_PROTOCOL_VERSION,
      baseRevision: "memory:0",
      idempotencyKey: "create",
      operations: [
        {
          op: "create",
          kind: "rectangle",
          x: 10,
          y: 20,
          width: 120,
          height: 80,
          style: { fill: "#ffffff", stroke: "#000000" },
        },
      ],
    });

    const outcome = await session.apply({
      protocolVersion: EVE_DESIGN_PROTOCOL_VERSION,
      baseRevision: "memory:1",
      idempotencyKey: "patch",
      operations: [
        {
          op: "patch",
          target: { id: SHAPE_1 },
          patch: { x: 42, fill: "#ff00aa" },
        },
      ],
    });

    expect(outcome).toMatchObject({
      status: "ok",
      data: { revision: "memory:2", changedShapeIds: [SHAPE_1] },
    });
    const inspected = await session.inspect({
      protocolVersion: EVE_DESIGN_PROTOCOL_VERSION,
      scope: "shape-ids",
      shapeIds: [SHAPE_1],
    });
    expect(inspected).toMatchObject({
      status: "ok",
      data: {
        shapes: [
          {
            id: SHAPE_1,
            x: 42,
            width: 120,
            style: { fill: "#ff00aa", stroke: "#000000" },
          },
        ],
      },
    });
  });

  it("creates a path through the dedicated bounded operation", async () => {
    const editor = createInMemoryDrawingEditor({ createId: () => SHAPE_1 });
    const session = await editor.open({
      protocolVersion: EVE_DESIGN_PROTOCOL_VERSION,
      documentId: "drawing-1",
      createIfMissing: true,
    });

    const outcome = await session.apply({
      protocolVersion: EVE_DESIGN_PROTOCOL_VERSION,
      baseRevision: "memory:0",
      idempotencyKey: "path",
      operations: [
        {
          op: "createPath",
          clientId: "connector",
          content: "M 0 0 L 100 100",
          name: "Connector",
          style: { stroke: "#112233", strokeWidth: 2 },
        },
      ],
    });

    expect(outcome).toMatchObject({
      status: "ok",
      data: { idMap: { connector: SHAPE_1 } },
    });
    await expect(
      session.inspect({
        protocolVersion: EVE_DESIGN_PROTOCOL_VERSION,
        scope: "current-page",
      }),
    ).resolves.toMatchObject({
      data: {
        shapes: [
          {
            id: SHAPE_1,
            type: "path",
            name: "Connector",
            style: { stroke: "#112233", strokeWidth: 2 },
          },
        ],
      },
    });
  });

  it("resolves prior client references and updates the selection in one batch", async () => {
    const ids = [SHAPE_1, SHAPE_2];
    const editor = createInMemoryDrawingEditor({
      createId: () => ids.shift() ?? crypto.randomUUID(),
    });
    const session = await editor.open({
      protocolVersion: EVE_DESIGN_PROTOCOL_VERSION,
      documentId: "drawing-1",
      createIfMissing: true,
    });

    const outcome = await session.apply({
      protocolVersion: EVE_DESIGN_PROTOCOL_VERSION,
      baseRevision: "memory:0",
      idempotencyKey: "nested-shapes",
      operations: [
        {
          op: "create",
          kind: "board",
          clientId: "board",
          x: 0,
          y: 0,
          width: 400,
          height: 300,
        },
        {
          op: "create",
          kind: "rectangle",
          clientId: "card",
          parent: { clientId: "board" },
          x: 20,
          y: 30,
          width: 100,
          height: 80,
        },
        { op: "select", targets: [{ clientId: "card" }] },
      ],
    });

    expect(outcome).toMatchObject({
      status: "ok",
      data: {
        idMap: { board: SHAPE_1, card: SHAPE_2 },
        changedShapeIds: [SHAPE_1, SHAPE_2],
      },
    });
    await expect(
      session.inspect({
        protocolVersion: EVE_DESIGN_PROTOCOL_VERSION,
        scope: "current-page",
      }),
    ).resolves.toMatchObject({
      data: {
        selectionIds: [SHAPE_2],
        shapes: [
          { id: SHAPE_1, type: "board", children: [SHAPE_2] },
          { id: SHAPE_2, type: "rectangle", parentId: SHAPE_1 },
        ],
      },
    });
  });

  it("reparents shapes to a prior client reference", async () => {
    const ids = [SHAPE_1, SHAPE_2, SHAPE_3];
    const editor = createInMemoryDrawingEditor({
      createId: () => ids.shift() ?? crypto.randomUUID(),
    });
    const session = await editor.open({
      protocolVersion: EVE_DESIGN_PROTOCOL_VERSION,
      documentId: "drawing-1",
      createIfMissing: true,
    });

    const outcome = await session.apply({
      protocolVersion: EVE_DESIGN_PROTOCOL_VERSION,
      baseRevision: "memory:0",
      idempotencyKey: "reparent",
      operations: [
        {
          op: "create",
          kind: "board",
          clientId: "left",
          x: 0,
          y: 0,
          width: 300,
          height: 300,
        },
        {
          op: "create",
          kind: "board",
          clientId: "right",
          x: 400,
          y: 0,
          width: 300,
          height: 300,
        },
        {
          op: "create",
          kind: "ellipse",
          clientId: "dot",
          parent: { clientId: "left" },
          x: 20,
          y: 20,
          width: 40,
          height: 40,
        },
        {
          op: "reparent",
          targets: [{ clientId: "dot" }],
          parent: { clientId: "right" },
          index: 0,
        },
      ],
    });

    expect(outcome).toMatchObject({
      status: "ok",
      data: { changedShapeIds: [SHAPE_1, SHAPE_2, SHAPE_3] },
    });
    await expect(
      session.inspect({
        protocolVersion: EVE_DESIGN_PROTOCOL_VERSION,
        scope: "current-page",
      }),
    ).resolves.toMatchObject({
      data: {
        shapes: [
          { id: SHAPE_1, type: "board" },
          { id: SHAPE_2, type: "board", children: [SHAPE_3] },
          { id: SHAPE_3, type: "ellipse", parentId: SHAPE_2 },
        ],
      },
    });
  });

  it("groups shapes and returns the group through its client reference", async () => {
    const ids = [SHAPE_1, SHAPE_2, SHAPE_3];
    const editor = createInMemoryDrawingEditor({
      createId: () => ids.shift() ?? crypto.randomUUID(),
    });
    const session = await editor.open({
      protocolVersion: EVE_DESIGN_PROTOCOL_VERSION,
      documentId: "drawing-1",
      createIfMissing: true,
    });

    const outcome = await session.apply({
      protocolVersion: EVE_DESIGN_PROTOCOL_VERSION,
      baseRevision: "memory:0",
      idempotencyKey: "group",
      operations: [
        {
          op: "create",
          kind: "rectangle",
          clientId: "one",
          x: 10,
          y: 20,
          width: 50,
          height: 40,
        },
        {
          op: "create",
          kind: "ellipse",
          clientId: "two",
          x: 100,
          y: 50,
          width: 30,
          height: 60,
        },
        {
          op: "group",
          targets: [{ clientId: "one" }, { clientId: "two" }],
          clientId: "cluster",
          name: "Cluster",
        },
      ],
    });

    expect(outcome).toMatchObject({
      status: "ok",
      data: {
        idMap: { one: SHAPE_1, two: SHAPE_2, cluster: SHAPE_3 },
        changedShapeIds: [SHAPE_1, SHAPE_2, SHAPE_3],
      },
    });
    await expect(
      session.inspect({
        protocolVersion: EVE_DESIGN_PROTOCOL_VERSION,
        scope: "shape-ids",
        shapeIds: [SHAPE_3],
        maxDepth: 1,
      }),
    ).resolves.toMatchObject({
      data: {
        shapes: [
          {
            id: SHAPE_3,
            type: "group",
            name: "Cluster",
            x: 10,
            y: 20,
            width: 120,
            height: 90,
            children: [SHAPE_1, SHAPE_2],
          },
          { id: SHAPE_1, parentId: SHAPE_3 },
          { id: SHAPE_2, parentId: SHAPE_3 },
        ],
      },
    });
  });

  it("ungroups shapes back into their group's parent", async () => {
    const ids = [SHAPE_1, SHAPE_2, SHAPE_3];
    const editor = createInMemoryDrawingEditor({
      createId: () => ids.shift() ?? crypto.randomUUID(),
    });
    const session = await editor.open({
      protocolVersion: EVE_DESIGN_PROTOCOL_VERSION,
      documentId: "drawing-1",
      createIfMissing: true,
    });
    await session.apply({
      protocolVersion: EVE_DESIGN_PROTOCOL_VERSION,
      baseRevision: "memory:0",
      idempotencyKey: "group",
      operations: [
        {
          op: "create",
          kind: "rectangle",
          clientId: "one",
          x: 0,
          y: 0,
          width: 40,
          height: 40,
        },
        {
          op: "create",
          kind: "ellipse",
          clientId: "two",
          x: 50,
          y: 0,
          width: 40,
          height: 40,
        },
        {
          op: "group",
          targets: [{ clientId: "one" }, { clientId: "two" }],
          clientId: "cluster",
        },
      ],
    });

    const outcome = await session.apply({
      protocolVersion: EVE_DESIGN_PROTOCOL_VERSION,
      baseRevision: "memory:1",
      idempotencyKey: "ungroup",
      operations: [{ op: "ungroup", targets: [{ id: SHAPE_3 }] }],
    });

    expect(outcome).toMatchObject({
      status: "ok",
      data: { changedShapeIds: [SHAPE_1, SHAPE_2, SHAPE_3] },
    });
    await expect(
      session.inspect({
        protocolVersion: EVE_DESIGN_PROTOCOL_VERSION,
        scope: "current-page",
      }),
    ).resolves.toMatchObject({
      data: {
        shapes: [
          { id: SHAPE_1, type: "rectangle" },
          { id: SHAPE_2, type: "ellipse" },
        ],
      },
    });
  });

  it("deletes a target and its descendants without leaving orphaned shapes", async () => {
    const ids = [SHAPE_1, SHAPE_2];
    const editor = createInMemoryDrawingEditor({
      createId: () => ids.shift() ?? crypto.randomUUID(),
    });
    const session = await editor.open({
      protocolVersion: EVE_DESIGN_PROTOCOL_VERSION,
      documentId: "drawing-1",
      createIfMissing: true,
    });
    await session.apply({
      protocolVersion: EVE_DESIGN_PROTOCOL_VERSION,
      baseRevision: "memory:0",
      idempotencyKey: "create",
      operations: [
        {
          op: "create",
          kind: "board",
          clientId: "board",
          x: 0,
          y: 0,
          width: 300,
          height: 200,
        },
        {
          op: "create",
          kind: "rectangle",
          parent: { clientId: "board" },
          x: 20,
          y: 20,
          width: 100,
          height: 50,
        },
      ],
    });

    const outcome = await session.apply({
      protocolVersion: EVE_DESIGN_PROTOCOL_VERSION,
      baseRevision: "memory:1",
      idempotencyKey: "delete",
      operations: [{ op: "delete", targets: [{ id: SHAPE_1 }] }],
    });

    expect(outcome).toMatchObject({
      status: "ok",
      data: { changedShapeIds: [SHAPE_1, SHAPE_2] },
    });
    await expect(
      session.inspect({
        protocolVersion: EVE_DESIGN_PROTOCOL_VERSION,
        scope: "current-page",
      }),
    ).resolves.toMatchObject({ data: { shapes: [] } });
  });

  it("replays an identical idempotent patch without advancing revision", async () => {
    const editor = createInMemoryDrawingEditor({ createId: () => SHAPE_1 });
    const session = await editor.open({
      protocolVersion: EVE_DESIGN_PROTOCOL_VERSION,
      documentId: "drawing-1",
      createIfMissing: true,
    });
    const request = {
      protocolVersion: EVE_DESIGN_PROTOCOL_VERSION,
      baseRevision: "memory:0",
      idempotencyKey: "same-request",
      operations: [
        {
          op: "create" as const,
          kind: "rectangle" as const,
          x: 0,
          y: 0,
          width: 100,
          height: 80,
        },
      ],
    };

    const first = await session.apply(request);
    const replay = await session.apply(request);

    expect(replay).toEqual(first);
    await expect(
      session.inspect({
        protocolVersion: EVE_DESIGN_PROTOCOL_VERSION,
        scope: "current-page",
      }),
    ).resolves.toMatchObject({
      data: { revision: "memory:1", shapes: [{ id: SHAPE_1 }] },
    });
  });

  it("returns structured conflicts for stale revisions and reused keys", async () => {
    const editor = createInMemoryDrawingEditor({ createId: () => SHAPE_1 });
    const session = await editor.open({
      protocolVersion: EVE_DESIGN_PROTOCOL_VERSION,
      documentId: "drawing-1",
      createIfMissing: true,
    });
    await session.apply({
      protocolVersion: EVE_DESIGN_PROTOCOL_VERSION,
      baseRevision: "memory:0",
      idempotencyKey: "used-key",
      operations: [
        {
          op: "create",
          kind: "rectangle",
          x: 0,
          y: 0,
          width: 100,
          height: 80,
        },
      ],
    });

    await expect(
      session.apply({
        protocolVersion: EVE_DESIGN_PROTOCOL_VERSION,
        baseRevision: "memory:1",
        idempotencyKey: "used-key",
        operations: [{ op: "select", targets: [] }],
      }),
    ).resolves.toMatchObject({
      status: "error",
      faults: [{ code: "idempotency_conflict", retryable: false }],
    });
    await expect(
      session.apply({
        protocolVersion: EVE_DESIGN_PROTOCOL_VERSION,
        baseRevision: "memory:0",
        idempotencyKey: "new-key",
        operations: [{ op: "select", targets: [] }],
      }),
    ).resolves.toMatchObject({
      status: "error",
      faults: [
        {
          code: "revision_conflict",
          retryable: true,
          details: {
            expectedRevision: "memory:0",
            actualRevision: "memory:1",
          },
        },
      ],
    });
  });

  it("rolls back an entire batch when any operation fails", async () => {
    const editor = createInMemoryDrawingEditor({ createId: () => SHAPE_1 });
    const session = await editor.open({
      protocolVersion: EVE_DESIGN_PROTOCOL_VERSION,
      documentId: "drawing-1",
      createIfMissing: true,
    });

    const outcome = await session.apply({
      protocolVersion: EVE_DESIGN_PROTOCOL_VERSION,
      baseRevision: "memory:0",
      idempotencyKey: "atomic",
      operations: [
        {
          op: "create",
          kind: "rectangle",
          x: 0,
          y: 0,
          width: 100,
          height: 80,
        },
        {
          op: "patch",
          target: { id: SHAPE_2 },
          patch: { x: 30 },
        },
      ],
    });

    expect(outcome).toMatchObject({
      status: "error",
      faults: [{ code: "shape_not_found" }],
    });
    await expect(
      session.inspect({
        protocolVersion: EVE_DESIGN_PROTOCOL_VERSION,
        scope: "current-page",
      }),
    ).resolves.toMatchObject({
      data: { revision: "memory:0", shapes: [] },
    });
  });

  it("returns structured lifecycle and export faults", async () => {
    const editor = createInMemoryDrawingEditor();

    const openError = await editor
      .open({
        protocolVersion: EVE_DESIGN_PROTOCOL_VERSION,
        documentId: "missing",
      })
      .catch((error: unknown) => error);
    expect(openError).toBeInstanceOf(DrawingOpenError);
    expect(openError).toMatchObject({
      name: "DrawingOpenError",
      fault: { code: "document_not_found", retryable: false },
    });

    const session = await editor.open({
      protocolVersion: EVE_DESIGN_PROTOCOL_VERSION,
      documentId: "drawing-1",
      createIfMissing: true,
    });
    await expect(
      session.export({
        protocolVersion: EVE_DESIGN_PROTOCOL_VERSION,
        format: "penpot",
        scope: "document",
      }),
    ).resolves.toMatchObject({
      protocolVersion: EVE_DESIGN_PROTOCOL_VERSION,
      status: "error",
      faults: [{ code: "export_unavailable", retryable: false }],
    });
  });

  it("rejects adapter-generated IDs that cannot be used by the wire contract", async () => {
    const editor = createInMemoryDrawingEditor({ createId: () => "not-a-uuid" });
    const session = await editor.open({
      protocolVersion: EVE_DESIGN_PROTOCOL_VERSION,
      documentId: "drawing-1",
      createIfMissing: true,
    });

    await expect(
      session.apply({
        protocolVersion: EVE_DESIGN_PROTOCOL_VERSION,
        baseRevision: "memory:0",
        idempotencyKey: "invalid-id",
        operations: [
          {
            op: "create",
            kind: "rectangle",
            x: 0,
            y: 0,
            width: 100,
            height: 80,
          },
        ],
      }),
    ).resolves.toMatchObject({
      status: "error",
      faults: [{ code: "invalid_operation" }],
    });
  });
});
