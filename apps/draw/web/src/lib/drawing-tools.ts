import {
  EVE_DESIGN_PROTOCOL_VERSION,
  applyDrawingPatchToolInputSchema,
  exportDrawingToolInputSchema,
  inspectDrawingToolInputSchema,
  type ApplyDrawingPatchRequest,
  type EveDesignOperation,
  type ExportDrawingRequest,
  type InspectDrawingRequest,
} from "@evetools/drawing";
import type { z } from "zod";

export const DRAWING_TOOL_NAMES = {
  inspect: "inspect_drawing",
  apply: "apply_drawing_patch",
  export: "export_drawing",
} as const;

export const DRAWING_TOOL_DESCRIPTIONS = {
  inspect:
    "Inspect the current drawing and return the opaque revision required by apply_drawing_patch.",
  apply:
    "Apply up to 100 bounded operations as one revision-checked, idempotent drawing transaction.",
  export: "Export the current document as a native Penpot archive.",
} as const;

export {
  applyDrawingPatchToolInputSchema,
  exportDrawingToolInputSchema,
  inspectDrawingToolInputSchema,
};

export type InspectDrawingToolInput = z.input<
  typeof inspectDrawingToolInputSchema
>;
export type ApplyDrawingPatchToolInput = z.input<
  typeof applyDrawingPatchToolInputSchema
>;
export type ExportDrawingToolInput = z.input<
  typeof exportDrawingToolInputSchema
>;

/** Inject the wire version after validating protocol-free model input. */
export function versionInspectDrawingInput(
  input: InspectDrawingToolInput,
): InspectDrawingRequest {
  return {
    protocolVersion: EVE_DESIGN_PROTOCOL_VERSION,
    ...inspectDrawingToolInputSchema.parse(input),
  };
}

/** Inject the wire version after validating protocol-free model input. */
export function versionApplyDrawingPatchInput(
  input: ApplyDrawingPatchToolInput,
): ApplyDrawingPatchRequest {
  const parsed = applyDrawingPatchToolInputSchema.parse(input);
  return {
    protocolVersion: EVE_DESIGN_PROTOCOL_VERSION,
    ...parsed,
    // The schema's create refinement supplies the stronger discriminated type.
    operations: parsed.operations as EveDesignOperation[],
  };
}

/** Inject the wire version after validating protocol-free model input. */
export function versionExportDrawingInput(
  input: ExportDrawingToolInput,
): ExportDrawingRequest {
  return {
    protocolVersion: EVE_DESIGN_PROTOCOL_VERSION,
    ...exportDrawingToolInputSchema.parse(input),
  };
}
