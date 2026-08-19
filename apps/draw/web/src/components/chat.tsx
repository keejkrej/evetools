"use client";

import * as React from "react";
import {
  ChatShell,
  type ChatArtifact,
  type ChatShellExtension,
} from "@evetools/chat-shell";
import { toast } from "sonner";

function downloadArtifact(artifact: ChatArtifact) {
  try {
    const binary = window.atob(artifact.data);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    const url = URL.createObjectURL(
      new Blob([bytes], { type: artifact.mediaType }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = artifact.fileName;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    toast.success(`${artifact.fileName} is ready.`);
  } catch {
    toast.error("The Penpot archive could not be downloaded.");
  }
}

export function Chat() {
  const extension = React.useMemo<ChatShellExtension>(
    () => ({ onArtifact: downloadArtifact }),
    [],
  );

  return (
    <ChatShell
      basePath="/evedraw"
      exportFallback="evedraw"
      extension={extension}
      storageNamespace="evedraw"
    />
  );
}
