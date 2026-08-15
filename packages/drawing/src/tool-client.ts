import type { DrawingSession, DrawingToolClient } from "./contracts";
import {
  EVE_DESIGN_PROTOCOL_VERSION,
  applyDrawingPatchToolInputSchema,
  exportDrawingToolInputSchema,
  inspectDrawingToolInputSchema,
  type EveDesignOperation,
} from "./schema";

/** Adapt a document-bound session to the protocol-free tool seam. */
export function drawingToolClientFromSession(
  session: DrawingSession,
): DrawingToolClient {
  return {
    inspect(input, options) {
      options?.signal?.throwIfAborted();
      return session.inspect({
        protocolVersion: EVE_DESIGN_PROTOCOL_VERSION,
        ...inspectDrawingToolInputSchema.parse(input),
      });
    },
    apply(input, options) {
      options?.signal?.throwIfAborted();
      const parsed = applyDrawingPatchToolInputSchema.parse(input);
      return session.apply({
        protocolVersion: EVE_DESIGN_PROTOCOL_VERSION,
        ...parsed,
        // The create-operation refinement supplies this stronger union.
        operations: parsed.operations as EveDesignOperation[],
      });
    },
    export(input, options) {
      options?.signal?.throwIfAborted();
      return session.export({
        protocolVersion: EVE_DESIGN_PROTOCOL_VERSION,
        ...exportDrawingToolInputSchema.parse(input),
      });
    },
  };
}
