import { describe, expect, it } from "vitest";
import {
  EVE_DESIGN_PROTOCOL_VERSION,
  MAX_EVEDRAW_EXPORT_BYTES,
  applyDrawingPatchRequestSchema,
  applyDrawingPatchToolInputSchema,
  drawingOperationSchema,
  exportDrawingToolInputSchema,
  exportDrawingResultSchema,
  inspectDrawingToolInputSchema,
} from "./index";

const SHAPE_1 = "00000000-0000-4000-8000-000000000001";
const SHAPE_2 = "00000000-0000-4000-8000-000000000002";
const GROUP_1 = "00000000-0000-4000-8000-000000000003";

describe("eve.design/v1 schemas", () => {
  it("bounds patch size and shape geometry at the transport boundary", () => {
    const createRectangle = {
      op: "create" as const,
      kind: "rectangle" as const,
      clientId: "rectangle-a",
      x: 0,
      y: 0,
      width: 100,
      height: 80,
    };

    expect(
      applyDrawingPatchRequestSchema.safeParse({
        protocolVersion: EVE_DESIGN_PROTOCOL_VERSION,
        baseRevision: "memory:0",
        idempotencyKey: "turn-1:tool-1",
        await: "persisted",
        operations: [createRectangle],
      }).success,
    ).toBe(true);
    expect(
      applyDrawingPatchRequestSchema.safeParse({
        protocolVersion: EVE_DESIGN_PROTOCOL_VERSION,
        baseRevision: "memory:0",
        idempotencyKey: "turn-1:tool-1",
        await: "persisted",
        operations: Array.from({ length: 101 }, () => createRectangle),
      }).success,
    ).toBe(false);
    expect(
      applyDrawingPatchRequestSchema.safeParse({
        protocolVersion: EVE_DESIGN_PROTOCOL_VERSION,
        baseRevision: "memory:0",
        idempotencyKey: "turn-1:tool-1",
        await: "persisted",
        operations: [
          {
            ...createRectangle,
            width: -1,
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("accepts the bounded basic-shape and mutation vocabulary", () => {
    const operations = [
      {
        op: "create",
        kind: "rectangle",
        clientId: "rectangle-a",
        x: 0,
        y: 0,
        width: 100,
        height: 80,
      },
      {
        op: "create",
        kind: "ellipse",
        clientId: "ellipse-a",
        x: 120,
        y: 0,
        width: 80,
        height: 80,
      },
      {
        op: "create",
        kind: "board",
        clientId: "frame-a",
        x: 0,
        y: 120,
        width: 400,
        height: 300,
      },
      {
        op: "create",
        kind: "text",
        clientId: "text-a",
        x: 20,
        y: 20,
        text: "Hello",
      },
      {
        op: "createPath",
        clientId: "path-a",
        content: "M 0 0 L 50 75 L 100 0 Z",
      },
      {
        op: "patch",
        target: { id: SHAPE_1 },
        patch: { x: 32, fill: "#ff00aa" },
      },
      {
        op: "reparent",
        targets: [{ id: SHAPE_1 }],
        parent: { clientId: "frame-a" },
        index: 0,
      },
      {
        op: "delete",
        targets: [{ id: SHAPE_2 }],
      },
      {
        op: "group",
        targets: [{ id: SHAPE_1 }, { id: SHAPE_2 }],
        clientId: "group-a",
      },
      {
        op: "ungroup",
        targets: [{ id: GROUP_1 }],
      },
      {
        op: "select",
        targets: [{ id: SHAPE_1 }],
      },
    ];

    for (const operation of operations) {
      expect(drawingOperationSchema.safeParse(operation).success).toBe(true);
    }
  });

  it("rejects forward and duplicate client references within a batch", () => {
    const base = {
      protocolVersion: EVE_DESIGN_PROTOCOL_VERSION,
      baseRevision: "opaque-revision",
      idempotencyKey: "turn-1:tool-1",
    };
    const rectangle = {
      op: "create" as const,
      kind: "rectangle" as const,
      clientId: "card",
      x: 0,
      y: 0,
      width: 100,
      height: 80,
    };

    expect(
      applyDrawingPatchRequestSchema.safeParse({
        ...base,
        operations: [
          {
            op: "patch",
            target: { clientId: "card" },
            patch: { x: 10 },
          },
          rectangle,
        ],
      }).success,
    ).toBe(false);
    expect(
      applyDrawingPatchRequestSchema.safeParse({
        ...base,
        operations: [rectangle, rectangle],
      }).success,
    ).toBe(false);
  });

  it("mirrors Penpot's strict basic-shape validation", () => {
    expect(
      drawingOperationSchema.safeParse({
        op: "create",
        kind: "rectangle",
        x: 0,
        y: 0,
      }).success,
    ).toBe(false);
    expect(
      drawingOperationSchema.safeParse({
        op: "create",
        kind: "text",
        x: 0,
        y: 0,
        text: "   ",
      }).success,
    ).toBe(false);
    expect(
      drawingOperationSchema.safeParse({
        op: "create",
        kind: "rectangle",
        x: 0,
        y: 0,
        width: 100,
        height: 80,
        style: { fill: "#fff", strokeWidth: 0 },
      }).success,
    ).toBe(false);
    expect(
      drawingOperationSchema.safeParse({
        op: "createPath",
        content: "M 0 0 L 10 10",
        x: 20,
        y: 30,
      }).success,
    ).toBe(true);
    expect(
      drawingOperationSchema.safeParse({
        op: "group",
        targets: [{ id: SHAPE_1 }],
      }).success,
    ).toBe(false);
    expect(
      drawingOperationSchema.safeParse({
        op: "delete",
        targets: [{ id: "not-a-uuid" }],
      }).success,
    ).toBe(false);
  });

  it("exports protocol-free tool inputs and applies their defaults", () => {
    expect(inspectDrawingToolInputSchema.parse({})).toEqual({
      scope: "current-page",
      maxDepth: 4,
      includeGeometry: true,
      includeStyle: true,
    });
    expect(exportDrawingToolInputSchema.parse({})).toEqual({
      format: "penpot",
      scope: "document",
      libraries: "all",
    });
    expect(
      applyDrawingPatchToolInputSchema.parse({
        baseRevision: "opaque-revision",
        idempotencyKey: "turn-1:tool-1",
        operations: [{ op: "select", targets: [] }],
      }),
    ).toEqual({
      baseRevision: "opaque-revision",
      idempotencyKey: "turn-1:tool-1",
      operations: [{ op: "select", targets: [] }],
      await: "persisted",
    });
    expect(
      applyDrawingPatchToolInputSchema.safeParse({
        baseRevision: "opaque-revision",
        idempotencyKey: "turn-1:tool-2",
        operations: [
          {
            op: "patch",
            target: { clientId: "not-created-yet" },
            patch: { x: 10 },
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("preserves opaque revisions and idempotency keys verbatim", () => {
    const parsed = applyDrawingPatchToolInputSchema.parse({
      baseRevision: " revision supplied by adapter ",
      idempotencyKey: " turn-1:tool-1 ",
      operations: [{ op: "select", targets: [] }],
    });

    expect(parsed.baseRevision).toBe(" revision supplied by adapter ");
    expect(parsed.idempotencyKey).toBe(" turn-1:tool-1 ");
  });

  it("caps native archive payloads at the v1 transport ceiling", () => {
    expect(
      exportDrawingResultSchema.safeParse({
        revision: "opaque:1",
        artifact: {
          format: "penpot",
          mimeType: "application/zip",
          fileName: "drawing.penpot",
          byteLength: MAX_EVEDRAW_EXPORT_BYTES + 1,
          data: { encoding: "base64", data: "" },
        },
      }).success,
    ).toBe(false);
    expect(
      exportDrawingResultSchema.safeParse({
        revision: "opaque:1",
        artifact: {
          format: "penpot",
          mimeType: "application/zip",
          fileName: "drawing.penpot",
          byteLength: 0,
          data: {
            encoding: "base64",
            data: "A".repeat(Math.ceil(MAX_EVEDRAW_EXPORT_BYTES / 3) * 4 + 4),
          },
        },
      }).success,
    ).toBe(false);
  });
});
