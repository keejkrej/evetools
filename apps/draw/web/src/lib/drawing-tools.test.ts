import { describe, expect, it } from "vitest";
import {
  DRAWING_TOOL_NAMES,
  applyDrawingPatchToolInputSchema,
  exportDrawingToolInputSchema,
  inspectDrawingToolInputSchema,
  versionApplyDrawingPatchInput,
  versionExportDrawingInput,
  versionInspectDrawingInput,
} from "./drawing-tools";

describe("drawing agent tool contract", () => {
  it("exposes the three bounded protocol-free tools", () => {
    expect(DRAWING_TOOL_NAMES).toEqual({
      inspect: "inspect_drawing",
      apply: "apply_drawing_patch",
      export: "export_drawing",
    });
    expect(inspectDrawingToolInputSchema.safeParse({}).success).toBe(true);
    expect(exportDrawingToolInputSchema.safeParse({}).success).toBe(true);
    expect(
      applyDrawingPatchToolInputSchema.safeParse({
        baseRevision: "file:7:12",
        idempotencyKey: "agent-turn-42",
        operations: [{ op: "select", targets: [] }],
      }).success,
    ).toBe(true);
    expect(
      inspectDrawingToolInputSchema.safeParse({
        protocolVersion: "eve.design/v1",
      }).success,
    ).toBe(false);
  });

  it("injects the protocol version and materializes defaults", () => {
    expect(versionInspectDrawingInput({})).toEqual({
      protocolVersion: "eve.design/v1",
      scope: "current-page",
      maxDepth: 4,
      includeGeometry: true,
      includeStyle: true,
    });
    expect(
      versionApplyDrawingPatchInput({
        baseRevision: "file:7:12",
        idempotencyKey: "agent-turn-42",
        operations: [{ op: "select", targets: [] }],
      }),
    ).toEqual({
      protocolVersion: "eve.design/v1",
      baseRevision: "file:7:12",
      idempotencyKey: "agent-turn-42",
      operations: [{ op: "select", targets: [] }],
      await: "persisted",
    });
    expect(versionExportDrawingInput({})).toEqual({
      protocolVersion: "eve.design/v1",
      format: "penpot",
      scope: "document",
      libraries: "all",
    });
  });
});
