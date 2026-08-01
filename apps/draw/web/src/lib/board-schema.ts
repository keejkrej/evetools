import { z } from "zod";

const numberish = z.coerce.number();
const labelSchema = z.preprocess(
  (value) => (typeof value === "string" ? { text: value } : value),
  z.object({ text: z.string().min(1) }),
);
const bindSchema = z.preprocess(
  (value) => (typeof value === "string" ? { id: value } : value),
  z.object({ id: z.string().min(1) }),
);

export const boardElementSchema = z.object({
  type: z.enum(["rectangle", "ellipse", "diamond", "text", "arrow", "line"]),
  id: z.string().min(1).optional(),
  x: numberish.optional(),
  y: numberish.optional(),
  width: numberish.optional(),
  height: numberish.optional(),
  text: z.string().optional(),
  fontSize: numberish.optional(),
  label: labelSchema.optional(),
  start: bindSchema.optional(),
  end: bindSchema.optional(),
  strokeColor: z.string().optional(),
  backgroundColor: z.string().optional(),
  strokeWidth: numberish.optional(),
});

export const drawOnBoardInputSchema = z.object({
  mode: z.enum(["append", "replace"]).default("replace"),
  elements: z.array(boardElementSchema).min(1).max(100),
});

export type DrawOnBoardInput = z.infer<typeof drawOnBoardInputSchema>;
export type BoardElement = z.infer<typeof boardElementSchema>;

type Box = { x: number; y: number; width: number; height: number };
const boxFor = (element: BoardElement): Box | null => {
  if (["arrow", "line"].includes(element.type) || element.x === undefined || element.y === undefined) return null;
  return { x: element.x, y: element.y, width: element.width ?? 200, height: element.height ?? (element.type === "text" ? 40 : 100) };
};

export function toExcalidrawSkeletons(elements: BoardElement[]) {
  const byId = new Map(elements.filter((element) => element.id).map((element) => [element.id!, element]));
  return elements.map((element) => {
    if (element.type === "text") {
      return { type: "text" as const, id: element.id, x: element.x ?? 0, y: element.y ?? 0, text: element.text ?? element.label?.text ?? "", fontSize: element.fontSize ?? 20, strokeColor: element.strokeColor };
    }
    if (element.type === "arrow" || element.type === "line") {
      const start = element.start?.id ? boxFor(byId.get(element.start.id)!) : null;
      const end = element.end?.id ? boxFor(byId.get(element.end.id)!) : null;
      const x = start ? start.x + start.width / 2 : element.x ?? 0;
      const y = start ? start.y + start.height / 2 : element.y ?? 0;
      return { type: element.type, id: element.id, x, y, width: end ? end.x + end.width / 2 - x : element.width ?? 160, height: end ? end.y + end.height / 2 - y : element.height ?? 0, label: element.label ?? (element.text ? { text: element.text } : undefined), start: element.start, end: element.end, strokeColor: element.strokeColor ?? "#1e1e1e", strokeWidth: element.strokeWidth ?? 2 };
    }
    return { type: element.type, id: element.id, x: element.x ?? 0, y: element.y ?? 0, width: element.width ?? 200, height: element.height ?? 100, label: element.label ?? (element.text ? { text: element.text } : undefined), strokeColor: element.strokeColor ?? "#1e1e1e", backgroundColor: element.backgroundColor ?? "#ffffff", strokeWidth: element.strokeWidth ?? 2, fillStyle: "solid" as const };
  });
}
