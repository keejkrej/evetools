import type { DrawingEditor, DrawingSession } from "./contracts";
import {
  DRAWING_FAULT_CODES,
  DrawingOpenError,
  drawingFault,
  errorOutcome,
  okOutcome,
} from "./faults";
import {
  EVE_DESIGN_PROTOCOL_VERSION,
  applyDrawingPatchRequestSchema,
  exportDrawingRequestSchema,
  inspectDrawingRequestSchema,
  openDrawingRequestSchema,
  shapeIdSchema,
  type ApplyDrawingPatchOutcome,
  type ApplyDrawingPatchRequest,
  type ApplyDrawingPatchResult,
  type EveDesignShapeRef,
  type EveDesignShapeSnapshot,
  type ExportDrawingOutcome,
  type ExportDrawingRequest,
  type InspectDrawingOutcome,
  type InspectDrawingRequest,
  type NormalizedInspectDrawingRequest,
} from "./schema";

type StoredShape = EveDesignShapeSnapshot & {
  _editor?: {
    cornerRadius?: number;
    fontFamily?: string;
    fontSize?: number;
    textAlign?: "left" | "center" | "right" | "justify";
    pathContent?: string;
  };
};

type StoredDocument = {
  id: string;
  pageId: string;
  revision: number;
  shapes: StoredShape[];
  selectionIds: string[];
  receipts: Map<
    string,
    { request: string; outcome: ApplyDrawingPatchOutcome }
  >;
};

export type InMemoryDrawingEditorOptions = {
  createId?: () => string;
  defaultPageId?: string;
};

function revisionOf(document: StoredDocument): string {
  return `memory:${document.revision}`;
}

function invalidRequestOutcome<T>(message: string): ReturnType<typeof errorOutcome<T>> {
  return errorOutcome(
    drawingFault(DRAWING_FAULT_CODES.invalidRequest, message, {
      retryable: false,
    }),
  );
}

function childrenByParent(shapes: StoredShape[]) {
  const children = new Map<string, string[]>();
  for (const shape of shapes) {
    if (!shape.parentId) continue;
    const siblings = children.get(shape.parentId) ?? [];
    siblings.push(shape.id);
    children.set(shape.parentId, siblings);
  }
  return children;
}

function snapshotsForInspect(
  document: StoredDocument,
  request: NormalizedInspectDrawingRequest,
): { shapes: EveDesignShapeSnapshot[]; truncated: boolean } {
  const byId = new Map(document.shapes.map((shape) => [shape.id, shape]));
  const roots =
    request.scope === "current-page"
      ? document.shapes.map(({ id }) => id)
      : request.scope === "selection"
        ? document.selectionIds
        : (request.shapeIds ?? []);
  const maxDepth = request.maxDepth ?? 0;
  const childIds = childrenByParent(document.shapes);
  const selected = new Set<string>();
  const orderedIds: string[] = [];
  const queue = roots.map((id) => ({ id, depth: 0 }));
  while (queue.length) {
    const current = queue.shift();
    if (!current || selected.has(current.id) || !byId.has(current.id)) continue;
    selected.add(current.id);
    orderedIds.push(current.id);
    if (request.scope === "current-page" || current.depth >= maxDepth) continue;
    for (const child of childIds.get(current.id) ?? []) {
      queue.push({ id: child, depth: current.depth + 1 });
    }
  }

  const all = orderedIds
    .map((id) => byId.get(id))
    .filter((shape): shape is StoredShape => Boolean(shape))
    .map((shape) => {
      const { _editor: _ignored, ...publicShape } = structuredClone(shape);
      const snapshot: EveDesignShapeSnapshot = publicShape;
      const children = childIds.get(snapshot.id);
      if (children?.length) snapshot.children = [...children];
      if (request.includeGeometry === false) {
        delete snapshot.x;
        delete snapshot.y;
        delete snapshot.width;
        delete snapshot.height;
        delete snapshot.rotation;
      }
      if (request.includeStyle === false) delete snapshot.style;
      return snapshot;
    });
  return { shapes: all.slice(0, 500), truncated: all.length > 500 };
}

function resolveReference(
  reference: EveDesignShapeRef,
  document: StoredDocument,
  idMap: Record<string, string>,
): string | undefined {
  if ("id" in reference) {
    return document.shapes.some(({ id }) => id === reference.id)
      ? reference.id
      : undefined;
  }
  const id = idMap[reference.clientId];
  return id && document.shapes.some((shape) => shape.id === id) ? id : undefined;
}

function markChanged(changedShapeIds: string[], id: string) {
  if (!changedShapeIds.includes(id)) changedShapeIds.push(id);
}

function allocateShapeId(
  document: StoredDocument,
  createId: () => string,
): string | undefined {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const id = createId();
    if (
      shapeIdSchema.safeParse(id).success &&
      !document.shapes.some((shape) => shape.id === id)
    ) {
      return id;
    }
  }
  return undefined;
}

function idAllocationFault() {
  return errorOutcome(
    drawingFault(
      DRAWING_FAULT_CODES.invalidOperation,
      "The adapter could not allocate a unique UUID for the new shape.",
      { retryable: false },
    ),
  );
}

class InMemoryDrawingSession implements DrawingSession {
  readonly documentId: string;
  readonly pageId: string;

  constructor(
    private readonly document: StoredDocument,
    private readonly createId: () => string,
  ) {
    this.documentId = document.id;
    this.pageId = document.pageId;
  }

  async inspect(request: InspectDrawingRequest): Promise<InspectDrawingOutcome> {
    const parsed = inspectDrawingRequestSchema.safeParse(request);
    if (!parsed.success) {
      return invalidRequestOutcome("The drawing inspection request is invalid.");
    }
    const { shapes, truncated } = snapshotsForInspect(this.document, parsed.data);
    return okOutcome({
      revision: revisionOf(this.document),
      document: { fileId: this.document.id },
      page: { id: this.document.pageId },
      selectionIds: [...this.document.selectionIds],
      shapes,
      truncated,
    });
  }

  async apply(
    request: ApplyDrawingPatchRequest,
  ): Promise<ApplyDrawingPatchOutcome> {
    const parsed = applyDrawingPatchRequestSchema.safeParse(request);
    if (!parsed.success) {
      return invalidRequestOutcome("The drawing patch request is invalid.");
    }
    const normalized = JSON.stringify(parsed.data);
    const prior = this.document.receipts.get(parsed.data.idempotencyKey);
    if (prior) {
      if (prior.request === normalized) return structuredClone(prior.outcome);
      return errorOutcome(
        drawingFault(
          DRAWING_FAULT_CODES.idempotencyConflict,
          "The idempotency key was already used for another patch.",
          { retryable: false },
        ),
      );
    }
    const currentRevision = revisionOf(this.document);
    if (parsed.data.baseRevision !== currentRevision) {
      return errorOutcome(
        drawingFault(
          DRAWING_FAULT_CODES.revisionConflict,
          "The drawing changed since it was inspected.",
          {
            retryable: true,
            details: {
              expectedRevision: parsed.data.baseRevision,
              actualRevision: currentRevision,
            },
          },
        ),
      );
    }

    const draft = structuredClone(this.document) as StoredDocument;
    draft.receipts = this.document.receipts;
    const idMap: Record<string, string> = {};
    const changedShapeIds: string[] = [];
    for (const operation of parsed.data.operations) {
      if (operation.op === "delete") {
        const deletedIds: string[] = [];
        const queue: string[] = [];
        for (const targetReference of operation.targets) {
          const targetId = resolveReference(targetReference, draft, idMap);
          if (!targetId) {
            return errorOutcome(
              drawingFault(
                DRAWING_FAULT_CODES.shapeNotFound,
                "A shape to delete does not exist.",
                { retryable: false },
              ),
            );
          }
          queue.push(targetId);
        }
        while (queue.length) {
          const id = queue.shift();
          if (!id || deletedIds.includes(id)) continue;
          deletedIds.push(id);
          for (const child of draft.shapes) {
            if (child.parentId === id) queue.push(child.id);
          }
        }
        draft.shapes = draft.shapes.filter(
          ({ id }) => !deletedIds.includes(id),
        );
        draft.selectionIds = draft.selectionIds.filter(
          (id) => !deletedIds.includes(id),
        );
        for (const id of deletedIds) markChanged(changedShapeIds, id);
        continue;
      }
      if (operation.op === "ungroup") {
        const groupIds: string[] = [];
        for (const targetReference of operation.targets) {
          const groupId = resolveReference(targetReference, draft, idMap);
          const group = draft.shapes.find(({ id }) => id === groupId);
          if (!group) {
            return errorOutcome(
              drawingFault(
                DRAWING_FAULT_CODES.shapeNotFound,
                "A group to ungroup does not exist.",
                { retryable: false },
              ),
            );
          }
          if (group.type !== "group") {
            return errorOutcome(
              drawingFault(
                DRAWING_FAULT_CODES.invalidOperation,
                `Shape ${group.id} is not a group.`,
                { retryable: false },
              ),
            );
          }
          if (!groupIds.includes(group.id)) groupIds.push(group.id);
        }
        for (const groupId of groupIds) {
          const group = draft.shapes.find(({ id }) => id === groupId);
          if (!group) continue;
          for (const child of draft.shapes.filter(
            ({ parentId }) => parentId === groupId,
          )) {
            if (group.parentId) child.parentId = group.parentId;
            else delete child.parentId;
            markChanged(changedShapeIds, child.id);
          }
          draft.shapes = draft.shapes.filter(({ id }) => id !== groupId);
          draft.selectionIds = draft.selectionIds.filter((id) => id !== groupId);
          markChanged(changedShapeIds, groupId);
        }
        continue;
      }
      if (operation.op === "group") {
        if (operation.clientId && idMap[operation.clientId]) {
          return errorOutcome(
            drawingFault(
              DRAWING_FAULT_CODES.invalidOperation,
              `Duplicate clientId: ${operation.clientId}`,
              { retryable: false },
            ),
          );
        }
        const targetIds: string[] = [];
        for (const targetReference of operation.targets) {
          const targetId = resolveReference(targetReference, draft, idMap);
          if (!targetId) {
            return errorOutcome(
              drawingFault(
                DRAWING_FAULT_CODES.shapeNotFound,
                "A shape to group does not exist.",
                { retryable: false },
              ),
            );
          }
          if (!targetIds.includes(targetId)) targetIds.push(targetId);
        }
        if (targetIds.length < 2) {
          return errorOutcome(
            drawingFault(
              DRAWING_FAULT_CODES.invalidOperation,
              "A group requires at least two distinct shapes.",
              { retryable: false },
            ),
          );
        }
        const targets = targetIds.flatMap((id) => {
          const shape = draft.shapes.find((candidate) => candidate.id === id);
          return shape ? [shape] : [];
        });
        const parentId = targets[0]?.parentId;
        if (targets.some((shape) => shape.parentId !== parentId)) {
          return errorOutcome(
            drawingFault(
              DRAWING_FAULT_CODES.invalidOperation,
              "Shapes must have the same parent before they can be grouped.",
              { retryable: false },
            ),
          );
        }
        const id = allocateShapeId(draft, this.createId);
        if (!id) return idAllocationFault();
        const boxes = targets.flatMap((shape) =>
          shape.x !== undefined &&
          shape.y !== undefined &&
          shape.width !== undefined &&
          shape.height !== undefined
            ? [
                {
                  left: shape.x,
                  top: shape.y,
                  right: shape.x + shape.width,
                  bottom: shape.y + shape.height,
                },
              ]
            : [],
        );
        const left = boxes.length ? Math.min(...boxes.map((box) => box.left)) : undefined;
        const top = boxes.length ? Math.min(...boxes.map((box) => box.top)) : undefined;
        const right = boxes.length ? Math.max(...boxes.map((box) => box.right)) : undefined;
        const bottom = boxes.length ? Math.max(...boxes.map((box) => box.bottom)) : undefined;
        draft.shapes.push({
          id,
          type: "group",
          ...(operation.name ? { name: operation.name } : {}),
          ...(parentId ? { parentId } : {}),
          ...(left !== undefined ? { x: left } : {}),
          ...(top !== undefined ? { y: top } : {}),
          ...(left !== undefined && right !== undefined
            ? { width: right - left }
            : {}),
          ...(top !== undefined && bottom !== undefined
            ? { height: bottom - top }
            : {}),
        });
        for (const target of targets) {
          target.parentId = id;
          markChanged(changedShapeIds, target.id);
        }
        if (operation.clientId) idMap[operation.clientId] = id;
        markChanged(changedShapeIds, id);
        continue;
      }
      if (operation.op === "reparent") {
        const parentId = resolveReference(operation.parent, draft, idMap);
        if (!parentId) {
          return errorOutcome(
            drawingFault(
              DRAWING_FAULT_CODES.shapeNotFound,
              "The requested parent shape does not exist.",
              { retryable: false },
            ),
          );
        }
        const targetIds: string[] = [];
        for (const targetReference of operation.targets) {
          const targetId = resolveReference(targetReference, draft, idMap);
          if (!targetId) {
            return errorOutcome(
              drawingFault(
                DRAWING_FAULT_CODES.shapeNotFound,
                "A shape to reparent does not exist.",
                { retryable: false },
              ),
            );
          }
          targetIds.push(targetId);
        }
        for (const targetId of targetIds) {
          let ancestorId: string | undefined = parentId;
          while (ancestorId) {
            if (ancestorId === targetId) {
              return errorOutcome(
                drawingFault(
                  DRAWING_FAULT_CODES.invalidOperation,
                  "A shape cannot be reparented beneath itself or a descendant.",
                  { retryable: false },
                ),
              );
            }
            ancestorId = draft.shapes.find(({ id }) => id === ancestorId)?.parentId;
          }
        }
        for (const targetId of targetIds) {
          const target = draft.shapes.find(({ id }) => id === targetId);
          if (!target) continue;
          target.parentId = parentId;
          markChanged(changedShapeIds, target.id);
        }
        continue;
      }
      if (operation.op === "select") {
        const selectionIds: string[] = [];
        for (const target of operation.targets) {
          const id = resolveReference(target, draft, idMap);
          if (!id) {
            return errorOutcome(
              drawingFault(
                DRAWING_FAULT_CODES.shapeNotFound,
                "A shape to select does not exist.",
                { retryable: false },
              ),
            );
          }
          if (!selectionIds.includes(id)) selectionIds.push(id);
        }
        draft.selectionIds = selectionIds;
        continue;
      }
      if (operation.op === "createPath") {
        const parentId = operation.parent
          ? resolveReference(operation.parent, draft, idMap)
          : undefined;
        if (operation.parent && !parentId) {
          return errorOutcome(
            drawingFault(
              DRAWING_FAULT_CODES.shapeNotFound,
              "The requested parent shape does not exist.",
              { retryable: false },
            ),
          );
        }
        if (operation.clientId && idMap[operation.clientId]) {
          return errorOutcome(
            drawingFault(
              DRAWING_FAULT_CODES.invalidOperation,
              `Duplicate clientId: ${operation.clientId}`,
              { retryable: false },
            ),
          );
        }
        const id = allocateShapeId(draft, this.createId);
        if (!id) return idAllocationFault();
        if (operation.clientId) idMap[operation.clientId] = id;
        markChanged(changedShapeIds, id);
        draft.shapes.push({
          id,
          type: "path",
          ...(operation.name ? { name: operation.name } : {}),
          ...(parentId ? { parentId } : {}),
          ...(operation.x !== undefined ? { x: operation.x } : {}),
          ...(operation.y !== undefined ? { y: operation.y } : {}),
          ...(operation.style ? { style: structuredClone(operation.style) } : {}),
          _editor: { pathContent: operation.content },
        });
        continue;
      }
      if (operation.op === "patch") {
        const targetId = resolveReference(operation.target, draft, idMap);
        const target = draft.shapes.find(({ id }) => id === targetId);
        if (!target) {
          return errorOutcome(
            drawingFault(
              DRAWING_FAULT_CODES.shapeNotFound,
              "The shape to patch does not exist.",
              { retryable: false },
            ),
          );
        }
        const {
          fill,
          fillOpacity,
          stroke,
          strokeWidth,
          opacity,
          cornerRadius,
          fontFamily,
          fontSize,
          textAlign,
          ...shapeFields
        } = operation.patch;
        Object.assign(target, shapeFields);
        if (
          fill !== undefined ||
          fillOpacity !== undefined ||
          stroke !== undefined ||
          strokeWidth !== undefined ||
          opacity !== undefined
        ) {
          target.style = {
            ...(target.style ?? {}),
            ...(fill !== undefined ? { fill } : {}),
            ...(fillOpacity !== undefined ? { fillOpacity } : {}),
            ...(stroke !== undefined ? { stroke } : {}),
            ...(strokeWidth !== undefined ? { strokeWidth } : {}),
            ...(opacity !== undefined ? { opacity } : {}),
          };
        }
        if (
          cornerRadius !== undefined ||
          fontFamily !== undefined ||
          fontSize !== undefined ||
          textAlign !== undefined
        ) {
          target._editor = {
            ...(target._editor ?? {}),
            ...(cornerRadius !== undefined ? { cornerRadius } : {}),
            ...(fontFamily !== undefined ? { fontFamily } : {}),
            ...(fontSize !== undefined ? { fontSize } : {}),
            ...(textAlign !== undefined ? { textAlign } : {}),
          };
        }
        markChanged(changedShapeIds, target.id);
        continue;
      }
      const parentId = operation.parent
        ? resolveReference(operation.parent, draft, idMap)
        : undefined;
      if (operation.parent && !parentId) {
        return errorOutcome(
          drawingFault(
            DRAWING_FAULT_CODES.shapeNotFound,
            "The requested parent shape does not exist.",
            { retryable: false },
          ),
        );
      }
      if (operation.clientId && idMap[operation.clientId]) {
        return errorOutcome(
          drawingFault(
            DRAWING_FAULT_CODES.invalidOperation,
            `Duplicate clientId: ${operation.clientId}`,
            { retryable: false },
          ),
        );
      }
      const id = allocateShapeId(draft, this.createId);
      if (!id) return idAllocationFault();
      if (operation.clientId) idMap[operation.clientId] = id;
      markChanged(changedShapeIds, id);
      draft.shapes.push({
        id,
        type: operation.kind,
        ...(operation.name ? { name: operation.name } : {}),
        ...(parentId ? { parentId } : {}),
        x: operation.x,
        y: operation.y,
        ...(operation.width !== undefined ? { width: operation.width } : {}),
        ...(operation.height !== undefined ? { height: operation.height } : {}),
        ...(operation.text !== undefined ? { text: operation.text } : {}),
        ...(operation.style ? { style: structuredClone(operation.style) } : {}),
      });
    }

    draft.revision += 1;
    this.document.revision = draft.revision;
    this.document.shapes = draft.shapes;
    this.document.selectionIds = draft.selectionIds;
    const result: ApplyDrawingPatchResult = {
      revision: revisionOf(this.document),
      idMap,
      changedShapeIds,
      persisted: parsed.data.await === "persisted",
      warnings: [],
    };
    const outcome = okOutcome(result);
    this.document.receipts.set(parsed.data.idempotencyKey, {
      request: normalized,
      outcome,
    });
    return structuredClone(outcome);
  }

  async export(request: ExportDrawingRequest): Promise<ExportDrawingOutcome> {
    const parsed = exportDrawingRequestSchema.safeParse(request);
    if (!parsed.success) {
      return invalidRequestOutcome("The drawing export request is invalid.");
    }
    return errorOutcome(
      drawingFault(
        DRAWING_FAULT_CODES.exportUnavailable,
        "The in-memory adapter cannot produce a native Penpot archive.",
        { retryable: false },
      ),
    );
  }
}

export function createInMemoryDrawingEditor(
  options: InMemoryDrawingEditorOptions = {},
): DrawingEditor {
  const documents = new Map<string, StoredDocument>();
  const createId = options.createId ?? (() => crypto.randomUUID());
  const defaultPageId = options.defaultPageId ?? "page-1";
  return {
    async open(rawRequest) {
      const parsed = openDrawingRequestSchema.safeParse(rawRequest);
      if (!parsed.success) {
        throw new DrawingOpenError(
          drawingFault(
            DRAWING_FAULT_CODES.invalidRequest,
            "The open drawing request is invalid.",
            { retryable: false },
          ),
        );
      }
      let document = documents.get(parsed.data.documentId);
      if (!document && !parsed.data.createIfMissing) {
        throw new DrawingOpenError(
          drawingFault(
            DRAWING_FAULT_CODES.documentNotFound,
            `Drawing ${parsed.data.documentId} does not exist.`,
            { retryable: false },
          ),
        );
      }
      if (!document) {
        document = {
          id: parsed.data.documentId,
          pageId: parsed.data.pageId ?? defaultPageId,
          revision: 0,
          shapes: [],
          selectionIds: [],
          receipts: new Map(),
        };
        documents.set(document.id, document);
      }
      return new InMemoryDrawingSession(document, createId);
    },
  };
}
