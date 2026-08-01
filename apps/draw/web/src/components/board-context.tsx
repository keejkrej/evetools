"use client";

import { createContext, useCallback, useContext, useMemo, useRef, type ReactNode } from "react";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { drawOnBoardInputSchema, toExcalidrawSkeletons } from "@/lib/board-schema";

type BoardBridge = {
  setApi: (api: ExcalidrawImperativeAPI | null) => void;
  applyDraw: (input: unknown) => Promise<boolean>;
};
const BoardContext = createContext<BoardBridge | null>(null);

export function BoardProvider({ children }: { children: ReactNode }) {
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const setApi = useCallback((api: ExcalidrawImperativeAPI | null) => { apiRef.current = api; }, []);
  const applyDraw = useCallback(async (input: unknown) => {
    const parsed = drawOnBoardInputSchema.safeParse(input);
    if (!parsed.success || !apiRef.current) return false;
    const { convertToExcalidrawElements, CaptureUpdateAction } = await import("@excalidraw/excalidraw");
    const converted = convertToExcalidrawElements(toExcalidrawSkeletons(parsed.data.elements) as never, { regenerateIds: false });
    const next = parsed.data.mode === "replace" ? converted : [...apiRef.current.getSceneElements(), ...converted];
    apiRef.current.updateScene({ elements: next, captureUpdate: CaptureUpdateAction.IMMEDIATELY });
    apiRef.current.scrollToContent(converted, { fitToContent: true, animate: false });
    return true;
  }, []);
  const value = useMemo(() => ({ setApi, applyDraw }), [setApi, applyDraw]);
  return <BoardContext.Provider value={value}>{children}</BoardContext.Provider>;
}

export function useBoard() {
  const board = useContext(BoardContext);
  if (!board) throw new Error("useBoard must be used inside BoardProvider");
  return board;
}
