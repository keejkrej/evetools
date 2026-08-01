"use client";

import dynamic from "next/dynamic";
import { useTheme } from "next-themes";
import { useEffect, useMemo, useRef } from "react";
import type { BinaryFiles, ExcalidrawImperativeAPI, ExcalidrawInitialDataState } from "@excalidraw/excalidraw/types";
import { useBoard } from "@/components/board-context";
import "@excalidraw/excalidraw/index.css";

const Excalidraw = dynamic(async () => (await import("@excalidraw/excalidraw")).Excalidraw, { ssr: false });
const STORAGE_KEY = "evedraw-board-v1";

export function BoardPanel() {
  const { setApi } = useBoard();
  const { resolvedTheme } = useTheme();
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => setApi(null), [setApi]);
  const initialData = useMemo(() => async (): Promise<ExcalidrawInitialDataState> => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return JSON.parse(saved) as ExcalidrawInitialDataState;
    } catch { /* start with a clean board */ }
    return { elements: [], appState: { viewBackgroundColor: "#ffffff" } };
  }, []);
  return (
    <div className="h-full min-h-0 overflow-hidden border-l bg-background">
      <Excalidraw
        excalidrawAPI={(api: ExcalidrawImperativeAPI) => setApi(api)}
        initialData={initialData}
        theme={resolvedTheme === "dark" ? "dark" : "light"}
        onChange={(elements, appState, files: BinaryFiles) => {
          clearTimeout(saveTimer.current);
          saveTimer.current = setTimeout(() => {
            try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ elements, appState: { viewBackgroundColor: appState.viewBackgroundColor, scrollX: appState.scrollX, scrollY: appState.scrollY, zoom: appState.zoom }, files })); } catch { /* storage may be unavailable */ }
          }, 400);
        }}
        UIOptions={{ canvasActions: { loadScene: true, export: { saveFileToDisk: true }, toggleTheme: false } }}
      />
    </div>
  );
}
