import type {
  ApplyDrawingPatchOutcome,
  ApplyDrawingPatchRequest,
  ApplyDrawingPatchToolInput,
  ExportDrawingOutcome,
  ExportDrawingRequest,
  ExportDrawingToolInput,
  InspectDrawingOutcome,
  InspectDrawingRequest,
  InspectDrawingToolInput,
  OpenDrawingRequest,
} from "./schema";

export type DrawingToolCallOptions = {
  signal?: AbortSignal;
};

/** Protocol-free active-workspace seam used by AI and MCP adapters. */
export interface DrawingToolClient {
  inspect(
    request: InspectDrawingToolInput,
    options?: DrawingToolCallOptions,
  ): Promise<InspectDrawingOutcome>;
  apply(
    request: ApplyDrawingPatchToolInput,
    options?: DrawingToolCallOptions,
  ): Promise<ApplyDrawingPatchOutcome>;
  export(
    request: ExportDrawingToolInput,
    options?: DrawingToolCallOptions,
  ): Promise<ExportDrawingOutcome>;
}

/** Editor-neutral session boundary implemented by Penpot, tests, or a fallback. */
export interface DrawingSession {
  readonly documentId: string;
  readonly pageId: string;
  inspect(request: InspectDrawingRequest): Promise<InspectDrawingOutcome>;
  apply(request: ApplyDrawingPatchRequest): Promise<ApplyDrawingPatchOutcome>;
  export(request: ExportDrawingRequest): Promise<ExportDrawingOutcome>;
}

/** Opens a document-bound drawing session without exposing editor internals. */
export interface DrawingEditor {
  open(request: OpenDrawingRequest): Promise<DrawingSession>;
}
