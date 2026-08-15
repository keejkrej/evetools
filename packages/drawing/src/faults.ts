import {
  EVE_DESIGN_PROTOCOL_VERSION,
  type EveDesignFault,
  type EveDesignOutcome,
} from "./schema";

export const DRAWING_FAULT_CODES = {
  invalidRequest: "invalid_request",
  documentNotFound: "document_not_found",
  revisionConflict: "revision_conflict",
  idempotencyConflict: "idempotency_conflict",
  shapeNotFound: "shape_not_found",
  invalidOperation: "invalid_operation",
  unsupportedOperation: "unsupported_operation",
  exportUnavailable: "export_unavailable",
} as const;

export type DrawingFaultCode =
  (typeof DRAWING_FAULT_CODES)[keyof typeof DRAWING_FAULT_CODES];

export function drawingFault(
  code: DrawingFaultCode,
  message: string,
  options: Pick<EveDesignFault, "details" | "retryable"> = {
    retryable: false,
  },
): EveDesignFault {
  return {
    code,
    message,
    retryable: options.retryable,
    ...(options.details ? { details: options.details } : {}),
  };
}

export function okOutcome<T>(data: T): EveDesignOutcome<T> {
  return {
    protocolVersion: EVE_DESIGN_PROTOCOL_VERSION,
    status: "ok",
    data,
  };
}

export function errorOutcome<T = never>(
  fault: EveDesignFault,
  ...additionalFaults: EveDesignFault[]
): EveDesignOutcome<T> {
  return {
    protocolVersion: EVE_DESIGN_PROTOCOL_VERSION,
    status: "error",
    faults: [fault, ...additionalFaults],
  };
}

export function partialOutcome<T>(
  data: T,
  fault: EveDesignFault,
  ...additionalFaults: EveDesignFault[]
): EveDesignOutcome<T> {
  return {
    protocolVersion: EVE_DESIGN_PROTOCOL_VERSION,
    status: "partial",
    data,
    faults: [fault, ...additionalFaults],
  };
}

/** Used only by `open`, whose successful value is a session rather than JSON. */
export class DrawingOpenError extends Error {
  readonly fault: EveDesignFault;

  constructor(fault: EveDesignFault) {
    super(fault.message);
    this.name = "DrawingOpenError";
    this.fault = fault;
  }
}
