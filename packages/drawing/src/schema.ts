import { z } from "zod";

export const EVE_DESIGN_PROTOCOL_VERSION = "eve.design/v1" as const;
export const MAX_EVEDRAW_EXPORT_BYTES = 10_000_000;
const MAX_EVEDRAW_EXPORT_BASE64_LENGTH =
  Math.ceil(MAX_EVEDRAW_EXPORT_BYTES / 3) * 4;
/** @deprecated Use EVE_DESIGN_PROTOCOL_VERSION and `protocolVersion`. */
export const DESIGN_PROTOCOL = EVE_DESIGN_PROTOCOL_VERSION;

export const protocolVersionSchema = z.literal(EVE_DESIGN_PROTOCOL_VERSION);
const nonBlankString = (maximum: number) =>
  z
    .string()
    .min(1)
    .max(maximum)
    .refine((value) => value.trim().length > 0, {
      message: "Value cannot be blank.",
    });
const identifierSchema = nonBlankString(200);
export const shapeIdSchema = z
  .string()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  );
const revisionSchema = nonBlankString(500);
const coordinateSchema = z.number().finite();
const dimensionSchema = z.number().finite().positive();
const unitIntervalSchema = z.number().finite().min(0).max(1);
const colorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?$/);

export const eveDesignFaultSchema = z
  .object({
    code: nonBlankString(128),
    message: nonBlankString(2_000),
    retryable: z.boolean(),
    details: z.record(z.string(), z.json()).optional(),
  })
  .strict();

export function eveDesignOutcomeSchema<T extends z.ZodType>(dataSchema: T) {
  return z.discriminatedUnion("status", [
    z
      .object({
        protocolVersion: protocolVersionSchema,
        status: z.literal("ok"),
        data: dataSchema,
      })
      .strict(),
    z
      .object({
        protocolVersion: protocolVersionSchema,
        status: z.literal("partial"),
        data: dataSchema,
        faults: z.array(eveDesignFaultSchema).min(1).max(100),
      })
      .strict(),
    z
      .object({
        protocolVersion: protocolVersionSchema,
        status: z.literal("error"),
        faults: z.array(eveDesignFaultSchema).min(1).max(100),
      })
      .strict(),
  ]);
}

export const openDrawingRequestSchema = z
  .object({
    protocolVersion: protocolVersionSchema,
    documentId: identifierSchema,
    pageId: identifierSchema.optional(),
    createIfMissing: z.boolean().optional(),
  })
  .strict();

/** Protocol-free input exposed to AI and MCP callers. */
export const inspectDrawingToolInputSchema = z
  .object({
    scope: z.enum(["current-page", "selection", "shape-ids"]).default("current-page"),
    shapeIds: z.array(shapeIdSchema).max(100).optional(),
    maxDepth: z.number().int().min(0).max(20).default(4),
    includeGeometry: z.boolean().default(true),
    includeStyle: z.boolean().default(true),
  })
  .strict()
  .superRefine((request, context) => {
    if (request.scope === "shape-ids" && !request.shapeIds?.length) {
      context.addIssue({
        code: "custom",
        message: "shapeIds is required when scope is shape-ids.",
        path: ["shapeIds"],
      });
    }
  });

export const inspectDrawingRequestSchema =
  inspectDrawingToolInputSchema.safeExtend({
    protocolVersion: protocolVersionSchema,
  });

export const basicStyleSchema = z
  .object({
    fill: colorSchema.nullable().optional(),
    fillOpacity: unitIntervalSchema.optional(),
    stroke: colorSchema.nullable().optional(),
    strokeWidth: z.number().finite().positive().optional(),
    opacity: unitIntervalSchema.optional(),
  })
  .strict();

export const shapeSnapshotSchema = z
  .object({
    id: identifierSchema,
    type: z.enum([
      "board",
      "rectangle",
      "ellipse",
      "text",
      "path",
      "group",
      "unknown",
    ]),
    name: nonBlankString(500).optional(),
    parentId: identifierSchema.optional(),
    children: z.array(identifierSchema).max(10_000).optional(),
    x: coordinateSchema.optional(),
    y: coordinateSchema.optional(),
    width: dimensionSchema.optional(),
    height: dimensionSchema.optional(),
    rotation: z.number().finite().optional(),
    text: z.string().max(100_000).optional(),
    style: basicStyleSchema.optional(),
  })
  .strict();

export const inspectDrawingResultSchema = z
  .object({
    revision: revisionSchema,
    document: z
      .object({
        fileId: identifierSchema,
        name: nonBlankString(255).optional(),
      })
      .strict(),
    page: z
      .object({
        id: identifierSchema,
        name: nonBlankString(255).optional(),
      })
      .strict(),
    selectionIds: z.array(identifierSchema).max(10_000),
    shapes: z.array(shapeSnapshotSchema).max(500),
    truncated: z.boolean(),
  })
  .strict();

export const inspectDrawingOutcomeSchema = eveDesignOutcomeSchema(
  inspectDrawingResultSchema,
);

export const shapeReferenceSchema = z.union([
  z.object({ id: shapeIdSchema }).strict(),
  z.object({ clientId: identifierSchema }).strict(),
]);

export const createShapeOperationSchema = z
  .object({
    op: z.literal("create"),
    kind: z.enum(["board", "rectangle", "ellipse", "text"]),
    clientId: identifierSchema.optional(),
    parent: shapeReferenceSchema.optional(),
    x: coordinateSchema,
    y: coordinateSchema,
    width: dimensionSchema.optional(),
    height: dimensionSchema.optional(),
    text: z.string().max(100_000).optional(),
    name: nonBlankString(500).optional(),
    style: basicStyleSchema.optional(),
  })
  .strict()
  .superRefine((operation, context) => {
    if (operation.kind === "text") {
      if (!operation.text?.trim()) {
        context.addIssue({
          code: "custom",
          message: "text is required for a text shape.",
          path: ["text"],
        });
      }
      return;
    }
    if (operation.text !== undefined) {
      context.addIssue({
        code: "custom",
        message: `${operation.kind} does not accept text.`,
        path: ["text"],
      });
    }
    if (operation.width === undefined) {
      context.addIssue({
        code: "custom",
        message: "width is required for this shape kind.",
        path: ["width"],
      });
    }
    if (operation.height === undefined) {
      context.addIssue({
        code: "custom",
        message: "height is required for this shape kind.",
        path: ["height"],
      });
    }
  });

export const createPathOperationSchema = z
  .object({
    op: z.literal("createPath"),
    clientId: identifierSchema.optional(),
    parent: shapeReferenceSchema.optional(),
    content: nonBlankString(1_000_000),
    x: coordinateSchema.optional(),
    y: coordinateSchema.optional(),
    name: nonBlankString(500).optional(),
    style: basicStyleSchema.optional(),
  })
  .strict();

export const basicShapePatchSchema = z
  .object({
    x: coordinateSchema.optional(),
    y: coordinateSchema.optional(),
    width: dimensionSchema.optional(),
    height: dimensionSchema.optional(),
    rotation: z.number().finite().optional(),
    cornerRadius: z.number().finite().min(0).optional(),
    name: nonBlankString(500).optional(),
    text: z.string().max(100_000).optional(),
    fontFamily: nonBlankString(500).optional(),
    fontSize: z.number().finite().positive().optional(),
    textAlign: z.enum(["left", "center", "right", "justify"]).optional(),
    fill: colorSchema.nullable().optional(),
    fillOpacity: unitIntervalSchema.optional(),
    stroke: colorSchema.nullable().optional(),
    strokeWidth: z.number().finite().positive().optional(),
    opacity: unitIntervalSchema.optional(),
  })
  .strict()
  .refine((patch) => Object.keys(patch).length > 0, {
    message: "A shape patch must change at least one field.",
  });

export const patchShapeOperationSchema = z
  .object({
    op: z.literal("patch"),
    target: shapeReferenceSchema,
    patch: basicShapePatchSchema,
  })
  .strict();

const nonEmptyTargetsSchema = z.array(shapeReferenceSchema).min(1).max(100);

export const deleteShapeOperationSchema = z
  .object({ op: z.literal("delete"), targets: nonEmptyTargetsSchema })
  .strict();

export const groupShapeOperationSchema = z
  .object({
    op: z.literal("group"),
    targets: z.array(shapeReferenceSchema).min(2).max(100),
    clientId: identifierSchema.optional(),
    name: nonBlankString(500).optional(),
  })
  .strict();

export const ungroupShapeOperationSchema = z
  .object({ op: z.literal("ungroup"), targets: nonEmptyTargetsSchema })
  .strict();

export const reparentShapeOperationSchema = z
  .object({
    op: z.literal("reparent"),
    targets: nonEmptyTargetsSchema,
    parent: shapeReferenceSchema,
    index: z.number().int().min(0).max(100_000).optional(),
  })
  .strict();

export const selectShapeOperationSchema = z
  .object({
    op: z.literal("select"),
    targets: z.array(shapeReferenceSchema).max(100),
  })
  .strict();

export const drawingOperationSchema = z.discriminatedUnion("op", [
  createShapeOperationSchema,
  createPathOperationSchema,
  patchShapeOperationSchema,
  deleteShapeOperationSchema,
  groupShapeOperationSchema,
  ungroupShapeOperationSchema,
  reparentShapeOperationSchema,
  selectShapeOperationSchema,
]);

/** Protocol-free input exposed to AI and MCP callers. */
export const applyDrawingPatchToolInputSchema = z
  .object({
    baseRevision: revisionSchema,
    idempotencyKey: nonBlankString(200),
    operations: z.array(drawingOperationSchema).min(1).max(100),
    await: z.enum(["committed", "persisted"]).default("persisted"),
  })
  .strict()
  .superRefine((request, context) => {
    const knownClientIds = new Set<string>();
    request.operations.forEach((operation, operationIndex) => {
      const references: EveDesignShapeRef[] = [];
      if (operation.op === "create" || operation.op === "createPath") {
        if (operation.parent) references.push(operation.parent);
      } else if (operation.op === "patch") {
        references.push(operation.target);
      } else {
        references.push(...operation.targets);
        if (operation.op === "reparent") references.push(operation.parent);
      }
      for (const reference of references) {
        if ("clientId" in reference && !knownClientIds.has(reference.clientId)) {
          context.addIssue({
            code: "custom",
            message: `Unknown or forward clientId: ${reference.clientId}`,
            path: ["operations", operationIndex],
          });
        }
      }
      if (
        (operation.op === "create" ||
          operation.op === "createPath" ||
          operation.op === "group") &&
        operation.clientId
      ) {
        if (knownClientIds.has(operation.clientId)) {
          context.addIssue({
            code: "custom",
            message: `Duplicate clientId: ${operation.clientId}`,
            path: ["operations", operationIndex, "clientId"],
          });
        }
        knownClientIds.add(operation.clientId);
      }
    });
  });

export const applyDrawingPatchRequestSchema =
  applyDrawingPatchToolInputSchema.safeExtend({
    protocolVersion: protocolVersionSchema,
  });

export const applyDrawingPatchResultSchema = z
  .object({
    revision: revisionSchema,
    idMap: z.record(identifierSchema, identifierSchema),
    changedShapeIds: z.array(identifierSchema).max(10_000),
    persisted: z.boolean(),
    warnings: z.array(z.string().max(2_000)).max(100),
  })
  .strict();

export const applyDrawingPatchOutcomeSchema = eveDesignOutcomeSchema(
  applyDrawingPatchResultSchema,
);

/** Protocol-free input exposed to AI and MCP callers. */
export const exportDrawingToolInputSchema = z
  .object({
    format: z.literal("penpot").default("penpot"),
    scope: z.literal("document").default("document"),
    libraries: z.enum(["all", "merge", "detach"]).default("all"),
  })
  .strict();

export const exportDrawingRequestSchema = exportDrawingToolInputSchema.extend({
  protocolVersion: protocolVersionSchema,
});

export const exportDrawingResultSchema = z
  .object({
    revision: revisionSchema,
    artifact: z
      .object({
        format: z.literal("penpot"),
        mimeType: z.literal("application/zip"),
        fileName: nonBlankString(255),
        byteLength: z.number().int().min(0).max(MAX_EVEDRAW_EXPORT_BYTES),
        data: z
          .object({
            encoding: z.literal("base64"),
            data: z
              .string()
              .max(MAX_EVEDRAW_EXPORT_BASE64_LENGTH)
              .refine(
                (value) =>
                  value.length > MAX_EVEDRAW_EXPORT_BASE64_LENGTH ||
                  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
                    value,
                  ),
                { message: "Archive data must be valid base64." },
              ),
          })
          .strict(),
      })
      .strict(),
  })
  .strict();

export const exportDrawingOutcomeSchema = eveDesignOutcomeSchema(
  exportDrawingResultSchema,
);

export type EveDesignFault = z.infer<typeof eveDesignFaultSchema>;
export type EveDesignOutcome<T> =
  | { protocolVersion: typeof EVE_DESIGN_PROTOCOL_VERSION; status: "ok"; data: T }
  | {
      protocolVersion: typeof EVE_DESIGN_PROTOCOL_VERSION;
      status: "partial";
      data: T;
      faults: EveDesignFault[];
    }
  | {
      protocolVersion: typeof EVE_DESIGN_PROTOCOL_VERSION;
      status: "error";
      faults: EveDesignFault[];
    };
export type OpenDrawingRequest = z.infer<typeof openDrawingRequestSchema>;
export type InspectDrawingToolInput = z.input<
  typeof inspectDrawingToolInputSchema
>;
export type InspectDrawingRequest = {
  protocolVersion: typeof EVE_DESIGN_PROTOCOL_VERSION;
  scope: "current-page" | "selection" | "shape-ids";
  shapeIds?: string[];
  maxDepth?: number;
  includeGeometry?: boolean;
  includeStyle?: boolean;
};
export type NormalizedInspectDrawingRequest = z.output<
  typeof inspectDrawingRequestSchema
>;
export type InspectDrawingResult = z.infer<typeof inspectDrawingResultSchema>;
export type InspectDrawingOutcome = EveDesignOutcome<InspectDrawingResult>;
export type EveDesignBasicStyle = z.infer<typeof basicStyleSchema>;
export type EveDesignShapeSnapshot = z.infer<typeof shapeSnapshotSchema>;
export type EveDesignShapeRef = z.infer<typeof shapeReferenceSchema>;
export type EveDesignOperation =
  | {
      op: "create";
      kind: "board" | "rectangle" | "ellipse";
      clientId?: string;
      parent?: EveDesignShapeRef;
      x: number;
      y: number;
      width: number;
      height: number;
      name?: string;
      style?: EveDesignBasicStyle;
    }
  | {
      op: "create";
      kind: "text";
      clientId?: string;
      parent?: EveDesignShapeRef;
      x: number;
      y: number;
      width?: number;
      height?: number;
      text: string;
      name?: string;
      style?: EveDesignBasicStyle;
    }
  | {
      op: "createPath";
      clientId?: string;
      parent?: EveDesignShapeRef;
      content: string;
      x?: number;
      y?: number;
      name?: string;
      style?: EveDesignBasicStyle;
    }
  | {
      op: "patch";
      target: EveDesignShapeRef;
      patch: z.infer<typeof basicShapePatchSchema>;
    }
  | { op: "delete"; targets: EveDesignShapeRef[] }
  | {
      op: "group";
      targets: EveDesignShapeRef[];
      clientId?: string;
      name?: string;
    }
  | { op: "ungroup"; targets: EveDesignShapeRef[] }
  | {
      op: "reparent";
      targets: EveDesignShapeRef[];
      parent: EveDesignShapeRef;
      index?: number;
    }
  | { op: "select"; targets: EveDesignShapeRef[] };
export type ApplyDrawingPatchRequest = {
  protocolVersion: typeof EVE_DESIGN_PROTOCOL_VERSION;
  baseRevision: string;
  idempotencyKey: string;
  operations: EveDesignOperation[];
  await?: "committed" | "persisted";
};
export type ApplyDrawingPatchToolInput = z.input<
  typeof applyDrawingPatchToolInputSchema
>;
export type ApplyDrawingPatchResult = z.infer<
  typeof applyDrawingPatchResultSchema
>;
export type ApplyDrawingPatchOutcome = EveDesignOutcome<ApplyDrawingPatchResult>;
export type ExportDrawingRequest = {
  protocolVersion: typeof EVE_DESIGN_PROTOCOL_VERSION;
  format: "penpot";
  scope: "document";
  libraries?: "all" | "merge" | "detach";
};
export type ExportDrawingToolInput = z.input<
  typeof exportDrawingToolInputSchema
>;
export type ExportDrawingResult = z.infer<typeof exportDrawingResultSchema>;
export type ExportDrawingOutcome = EveDesignOutcome<ExportDrawingResult>;
