"use client";

import * as React from "react";
import { PanelRightClose, PanelRightOpen } from "lucide-react";
import { toast } from "sonner";
import {
  ChatShell,
  type ChatShellExtension,
} from "@evetools/chat-shell";
import { Button } from "@evetools/ui/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@evetools/ui/ui/tooltip";
import { BoardPanel } from "@/components/board-panel";
import { useBoard } from "@/components/board-context";

export function Chat() {
  const board = useBoard();
  const [boardOpen, setBoardOpen] = React.useState(false);

  const extension = React.useMemo<ChatShellExtension>(
    () => ({
      onToolEvent: (event) => {
        if (event.name !== "draw_on_board" || !event.input) return;
        setBoardOpen(true);
        void board.applyDraw(event.input).then((applied) => {
          if (!applied) {
            toast.error("The drawing tool returned an invalid canvas update.");
          }
        });
      },
      panel: boardOpen ? (
        <aside className="min-h-0 w-[48%] min-w-[360px] max-md:absolute max-md:inset-0 max-md:z-20 max-md:w-full max-md:min-w-0">
          <BoardPanel />
        </aside>
      ) : undefined,
      toolbar: (
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                aria-label={boardOpen ? "Close canvas" : "Open canvas"}
                className="pointer-events-auto"
                size="icon"
                variant="ghost"
                onClick={() => setBoardOpen((open) => !open)}
              />
            }
          >
            {boardOpen ? <PanelRightClose /> : <PanelRightOpen />}
          </TooltipTrigger>
          <TooltipContent>
            {boardOpen ? "Close canvas" : "Open canvas"}
          </TooltipContent>
        </Tooltip>
      ),
    }),
    [board, boardOpen],
  );

  return (
    <ChatShell
      exportFallback="evedraw"
      extension={extension}
      storageNamespace="evedraw"
    />
  );
}
