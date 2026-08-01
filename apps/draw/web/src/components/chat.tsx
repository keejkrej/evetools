"use client";

import * as React from "react";
import Image from "next/image";
import {
  Anthropic,
  Cursor,
  DeepSeek,
  Gemini,
  Meta,
  Grok,
  Minimax,
  Mistral,
  Moonshot,
  Ollama,
  OpenAI,
  Qwen,
  Zhipu,
  ZAI,
} from "@lobehub/icons";
import {
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clipboard,
  Download,
  ExternalLink,
  Loader2,
  LogOut,
  Maximize2,
  Menu,
  Minimize2,
  Moon,
  MoreHorizontal,
  Pencil,
  Pin,
  Plus,
  RefreshCw,
  Search,
  Share2,
  Sun,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  TriangleAlert,
  Wrench,
  X,
  PanelRightClose,
  PanelRightOpen,
} from "lucide-react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import useSWR from "swr";
import { useClerk } from "@clerk/nextjs";
import { Alert, AlertDescription, AlertTitle } from "@evetools/ui/ui/alert";
import { Button } from "@evetools/ui/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@evetools/ui/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@evetools/ui/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@evetools/ui/ui/dropdown-menu";
import { ScrollArea } from "@evetools/ui/ui/scroll-area";
import { Input } from "@evetools/ui/ui/input";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@evetools/ui/ui/sheet";
import { Textarea } from "@evetools/ui/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@evetools/ui/ui/tooltip";
import {
  Conversation as AIConversation,
  ConversationContent,
  ConversationScrollButton,
} from "@evetools/ui/ai-elements/conversation";
import {
  Message as AIMessage,
  MessageAction,
  MessageActions,
  MessageContent,
  MessageResponse,
} from "@evetools/ui/ai-elements/message";
import {
  PromptInput,
  PromptInputBody,
  PromptInputButton,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from "@evetools/ui/ai-elements/prompt-input";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@evetools/ui/ai-elements/reasoning";
import { BoardPanel } from "@/components/board-panel";
import { useBoard } from "@/components/board-context";

type Attachment = {
  id: string;
  name: string;
  mediaType: string;
  data: string;
};
type ToolActivity = {
  id: string;
  name: string;
  title?: string;
  status: "running" | "complete" | "error";
  input?: unknown;
};
type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  attachments?: Attachment[];
  reasoning?: string;
  activities?: ToolActivity[];
};
type Conversation = {
  id: string;
  title: string;
  messages: Message[];
  updatedAt: number;
  pinned?: boolean;
};

const STORAGE_KEY = "evedraw-conversations-v1";
const PROVIDER_KEY = "evedraw-provider-v1";
const modelKey = (provider: Provider) => `evedraw-model-${provider}-v1`;
type Provider = "cursor" | "ollama";
type ModelOption = { id: string; displayName: string; description?: string };
type Health = {
  status?: string;
  providers?: Record<Provider, boolean>;
};
const CURSOR_FALLBACK_MODELS: ModelOption[] = [
  { id: "default", displayName: "Auto" },
  { id: "composer-2.5", displayName: "Composer 2.5" },
];
const OLLAMA_FALLBACK_MODELS: ModelOption[] = [
  { id: "gpt-oss:120b", displayName: "gpt-oss:120b" },
];
const fallbackModels = (provider: Provider) =>
  provider === "ollama" ? OLLAMA_FALLBACK_MODELS : CURSOR_FALLBACK_MODELS;

const MODEL_CATALOG_STALE_TIME = 5 * 60 * 1000;
const fetchModelCatalog = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Could not load models.");
  return response.json() as Promise<{ models?: ModelOption[] }>;
};

type ChatStreamEvent =
  | { type: "text"; delta: string }
  | { type: "reasoning"; delta: string }
  | ({ type: "tool" } & ToolActivity)
  | { type: "error"; message: string };

function EveMark({ className }: { className?: string }) {
  return (
    <Image
      alt=""
      aria-hidden="true"
      className={`${className ?? ""} dark:invert`}
      height={102}
      src="/eve-logo.svg"
      width={102}
    />
  );
}

function EveAvatar() {
  return (
    <div className="flex size-9 shrink-0 items-center justify-center rounded-full border border-sidebar-border bg-sidebar-accent">
      <EveMark className="size-6" />
    </div>
  );
}

function ModelProviderIcon({ provider, modelId }: { provider: Provider; modelId: string }) {
  const className = "size-5 shrink-0";

  if (provider === "ollama") {
    if (modelId.startsWith("gpt-oss")) return <OpenAI className={className} />;
    if (modelId.startsWith("minimax")) return <Minimax className={className} />;
    if (modelId.startsWith("kimi-")) return <Moonshot className={className} />;
    if (modelId.startsWith("glm-")) return <Zhipu className={className} />;
    if (modelId.startsWith("gemma")) return <Gemini className={className} />;
    if (modelId.startsWith("qwen")) return <Qwen className={className} />;
    if (modelId.startsWith("deepseek")) return <DeepSeek className={className} />;
    if (modelId.startsWith("llama")) return <Meta className={className} />;
    if (modelId.startsWith("mistral") || modelId.startsWith("mixtral")) {
      return <Mistral className={className} />;
    }
    return <OpenAI className={className} />;
  }
  if (modelId === "default" || modelId.startsWith("composer-")) {
    return <Cursor className={className} />;
  }
  if (modelId.startsWith("claude-")) {
    return <Anthropic className={className} />;
  }
  if (modelId.startsWith("gpt-")) {
    return <OpenAI className={className} />;
  }
  if (modelId.startsWith("gemini-")) {
    return <Gemini className={className} />;
  }
  if (modelId.startsWith("grok-")) {
    return <Grok className={className} />;
  }
  if (modelId.startsWith("kimi-")) {
    return <Moonshot className={className} />;
  }
  if (modelId.startsWith("glm-")) {
    return <ZAI className={className} />;
  }

  return <Cursor className={className} />;
}

function createConversation(): Conversation {
  return {
    id: crypto.randomUUID(),
    title: "New chat",
    messages: [],
    updatedAt: Date.now(),
  };
}

function formatRelativeTime(timestamp: number) {
  const elapsed = Math.max(0, Date.now() - timestamp);
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} ${days === 1 ? "day" : "days"} ago`;
}

async function prepareImage(file: File): Promise<Attachment> {
  const source = URL.createObjectURL(file);
  try {
    const image = new window.Image();
    image.src = source;
    await image.decode();
    const longestSide = Math.max(image.width, image.height);
    const scale = Math.min(1, 1600 / longestSide);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser cannot prepare the image.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (result) =>
          result ? resolve(result) : reject(new Error("Could not prepare image.")),
        "image/jpeg",
        0.82,
      );
    });
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("Could not read image."));
      reader.readAsDataURL(blob);
    });
    return {
      id: crypto.randomUUID(),
      name: file.name.replace(/\.[^.]+$/, "") + ".jpg",
      mediaType: "image/jpeg",
      data,
    };
  } finally {
    URL.revokeObjectURL(source);
  }
}

function Sidebar({
  conversations,
  activeId,
  collapsed,
  onSelect,
  onNew,
  onDelete,
  onRename,
  onExport,
  onSearch,
  onToggle,
  onToggleTheme,
  onSignOut,
  resolvedTheme,
  themeMounted,
}: {
  conversations: Conversation[];
  activeId: string;
  collapsed?: boolean;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onRename: (conversation: Conversation) => void;
  onExport: (conversation: Conversation) => void;
  onSearch: () => void;
  onToggle: () => void;
  onToggleTheme: () => void;
  onSignOut: () => void;
  resolvedTheme?: string;
  themeMounted: boolean;
}) {
  const [historyOpen, setHistoryOpen] = React.useState(true);

  if (collapsed) {
    return (
      <div className="flex h-full w-14 flex-col items-center border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
        <div className="flex h-14 w-full shrink-0 items-center justify-start pl-3.5">
          <EveMark className="size-7" />
        </div>
        <div className="flex w-full flex-1 flex-col items-start gap-1 pt-0.5 pl-2.5">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  aria-label="Search conversations"
                  className="size-9 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  size="icon"
                  variant="ghost"
                  onClick={onSearch}
                />
              }
            >
              <Search className="size-[18px]" />
            </TooltipTrigger>
            <TooltipContent side="right">Search</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  aria-label="New chat"
                  className="size-9 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  size="icon"
                  variant="ghost"
                  onClick={onNew}
                />
              }
            >
              <Pencil className="size-[18px]" />
            </TooltipTrigger>
            <TooltipContent side="right">New chat</TooltipContent>
          </Tooltip>
        </div>
        <Button
          aria-label="Expand sidebar"
          className="mb-4 ml-2.5 self-start text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          size="icon"
          variant="ghost"
          onClick={onToggle}
        >
          <ChevronRight />
        </Button>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                aria-label="Toggle theme"
                className="mb-3 ml-2.5 self-start text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                size="icon"
                variant="ghost"
                onClick={onToggleTheme}
              />
            }
          >
            {themeMounted && resolvedTheme === "dark" ? <Sun /> : <Moon />}
          </TooltipTrigger>
          <TooltipContent side="right">Toggle theme</TooltipContent>
        </Tooltip>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                aria-label="Open profile menu"
                className="mb-3 ml-2 size-10 self-start rounded-full p-0 hover:bg-sidebar-accent data-popup-open:bg-transparent!"
                variant="ghost"
              />
            }
          >
            <EveAvatar />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            className="w-44 rounded-2xl bg-popover/55 p-2 shadow-lg backdrop-blur-xl"
            side="right"
          >
            <DropdownMenuItem className="gap-3 rounded-xl py-2.5" onClick={onSignOut}>
              <LogOut />
              Sign Out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <div className="flex h-14 shrink-0 items-center justify-between px-3.5">
        <EveMark className="size-7" />
        <Button
          aria-label="Collapse sidebar"
          className="text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          size="icon"
          variant="ghost"
          onClick={onToggle}
        >
          <ChevronLeft />
        </Button>
      </div>
      <div className="space-y-1 px-2.5 pt-0.5">
        <Button
          className="h-9 w-full justify-start gap-2 px-2 text-sm leading-[21px] text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          variant="ghost"
          onClick={onSearch}
        >
          <Search className="size-[18px]" />
          Search
        </Button>
        <Button
          className="h-9 w-full justify-start gap-2 rounded-xl bg-sidebar-accent px-2 text-sm leading-[21px] text-sidebar-accent-foreground hover:bg-sidebar-accent/80"
          variant="ghost"
          onClick={onNew}
        >
          <Pencil className="size-[18px]" />
          New Chat
        </Button>
      </div>
      <div className="mt-4 flex min-h-0 flex-1 flex-col">
        <Button
          aria-expanded={historyOpen}
          className="ml-3.5 h-auto w-fit justify-start gap-2 rounded-lg border-0 px-2 py-1 text-[13px] leading-[19.5px] font-[550] text-sidebar-foreground hover:bg-transparent aria-expanded:bg-transparent dark:hover:bg-transparent dark:aria-expanded:bg-transparent"
          variant="ghost"
          onClick={() => setHistoryOpen((open) => !open)}
        >
          History
          <ChevronDown
            className={`size-3 transition-transform ${
              historyOpen ? "" : "-rotate-90"
            }`}
          />
        </Button>
        {historyOpen && (
          <ScrollArea className="min-h-0 flex-1 pr-5 pl-2.5">
            <p className="flex items-center gap-2 px-3 pt-3 pb-1 text-[11px] leading-[16.5px] text-sidebar-foreground/70">
              Today
              <span className="h-px flex-1 bg-sidebar-border" />
            </p>
            <div className="space-y-px pb-4">
            {conversations.map((conversation) => (
              <div
                className={`group relative flex items-center rounded-xl transition-colors hover:bg-sidebar-accent focus-within:bg-sidebar-accent dark:hover:bg-muted/50 dark:focus-within:bg-muted/50 ${
                  conversation.id === activeId ? "bg-sidebar-accent" : ""
                }`}
                key={conversation.id}
              >
                <Button
                  className="h-9 min-w-0 flex-1 justify-start border-0 px-3 text-sm leading-[21px] font-normal text-sidebar-foreground hover:bg-transparent hover:text-sidebar-accent-foreground dark:hover:bg-transparent"
                  variant="ghost"
                  onClick={() => onSelect(conversation.id)}
                >
                  <span className="truncate text-sm">{conversation.title}</span>
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                      aria-label={`Options for ${conversation.title}`}
                    className="absolute top-1 right-1 text-sidebar-foreground/60 opacity-0 hover:bg-sidebar-foreground/10 hover:text-sidebar-accent-foreground dark:hover:bg-sidebar-foreground/10 group-hover:opacity-100 focus:opacity-100"
                      size="icon-sm"
                      variant="ghost"
                      />
                    }
                  >
                    <MoreHorizontal />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onRename(conversation)}>
                      <Pencil />
                      Rename
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onExport(conversation)}>
                      <Download />
                      Export
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => onDelete(conversation.id)}
                    >
                      <Trash2 />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))}
            </div>
          </ScrollArea>
        )}
      </div>
      <div className="mx-2 flex shrink-0 items-center border-t border-sidebar-border px-0.5 py-3">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                aria-label="Open profile menu"
                className="-ml-1.5 h-auto min-w-0 flex-1 justify-start gap-3 rounded-xl px-1.5 py-1 text-left hover:bg-sidebar-accent data-popup-open:bg-transparent!"
                variant="ghost"
              />
            }
          >
            <EveAvatar />
            <div className="min-w-0">
              <p className="text-sm font-semibold">Eve</p>
              <p className="truncate text-xs text-sidebar-foreground/55">
                eve@eve.dev
              </p>
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            className="w-52 rounded-2xl bg-popover/55 p-2 shadow-lg backdrop-blur-xl"
            side="top"
          >
            <DropdownMenuItem className="gap-3 rounded-xl py-2.5" onClick={onSignOut}>
              <LogOut />
              Sign Out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                aria-label="Toggle theme"
                className="ml-auto text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                size="icon"
                variant="ghost"
                onClick={onToggleTheme}
              />
            }
          >
            {themeMounted && resolvedTheme === "dark" ? <Sun /> : <Moon />}
          </TooltipTrigger>
          <TooltipContent>Toggle theme</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}

export function Chat() {
  const board = useBoard();
  const [boardOpen, setBoardOpen] = React.useState(false);
  const [conversations, setConversations] = React.useState<Conversation[]>([]);
  const [activeId, setActiveId] = React.useState("");
  const [input, setInput] = React.useState("");
  const [composerMultiline, setComposerMultiline] = React.useState(false);
  const [provider, setProvider] = React.useState<Provider>("ollama");
  const [model, setModel] = React.useState("gpt-oss:120b");
  const [streaming, setStreaming] = React.useState(false);
  const [copiedId, setCopiedId] = React.useState("");
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(false);
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [searchExpanded, setSearchExpanded] = React.useState(false);
  const [searchPreviewId, setSearchPreviewId] = React.useState("");
  const [searchActionId, setSearchActionId] = React.useState("");
  const [renameTarget, setRenameTarget] = React.useState<Conversation | null>(null);
  const [renameValue, setRenameValue] = React.useState("");
  const [editingId, setEditingId] = React.useState("");
  const [editingValue, setEditingValue] = React.useState("");
  const [editingAttachments, setEditingAttachments] = React.useState<Attachment[]>([]);
  const [attachments, setAttachments] = React.useState<Attachment[]>([]);
  const [configurationStatus, setConfigurationStatus] = React.useState<
    "checking" | "ready" | "missing" | "offline"
  >("checking");
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const storageWarningRef = React.useRef(false);
  const abortRef = React.useRef<AbortController | null>(null);
  const { signOut } = useClerk();
  const { resolvedTheme, setTheme } = useTheme();
  const [themeMounted, setThemeMounted] = React.useState(false);
  const [availableProviders, setAvailableProviders] = React.useState<
    Record<Provider, boolean> | null
  >(null);
  const { data: modelCatalog } = useSWR<{ models?: ModelOption[] }>(
    `/api/models?provider=${provider}`,
    fetchModelCatalog,
    {
      dedupingInterval: MODEL_CATALOG_STALE_TIME,
      revalidateIfStale: false,
      revalidateOnFocus: false,
    },
  );
  const models = modelCatalog?.models?.length
    ? modelCatalog.models
    : fallbackModels(provider);

  const active =
    conversations.find((conversation) => conversation.id === activeId) ??
    conversations[0];

  React.useEffect(() => {
    queueMicrotask(() => setThemeMounted(true));
  }, []);

  React.useEffect(() => {
    const saved = localStorage.getItem(PROVIDER_KEY);
    if (saved === "cursor" || saved === "ollama") {
      queueMicrotask(() => setProvider(saved));
    }
  }, []);

  React.useEffect(() => {
    queueMicrotask(() => {
      let parsed: Conversation[] = [];
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        parsed = saved ? (JSON.parse(saved) as Conversation[]) : [];
      } catch {
        localStorage.removeItem(STORAGE_KEY);
      }
      const initial = parsed.length ? parsed : [createConversation()];
      const requestedId = new URLSearchParams(window.location.search).get(
        "conversation",
      );
      setConversations(initial);
      setActiveId(
        requestedId &&
          initial.some((conversation) => conversation.id === requestedId)
          ? requestedId
          : initial[0].id,
      );
    });
  }, []);

  React.useEffect(() => {
    const controller = new AbortController();
    fetch("/api/health", { cache: "no-store", signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("Health check failed.");
        return response.json() as Promise<Health>;
      })
      .then((payload) => {
        setAvailableProviders(payload.providers ?? null);
        setConfigurationStatus(
          payload.status === "ready" ? "ready" : "missing",
        );
        const enabled = (["ollama", "cursor"] as const).filter(
          (item) => payload.providers?.[item] !== false,
        );
        if (enabled.length) {
          setProvider((current) =>
            payload.providers?.[current] === false ? enabled[0] : current,
          );
        }
      })
      .catch((error) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setConfigurationStatus("offline");
        }
      });
    return () => controller.abort();
  }, []);

  React.useEffect(() => {
    queueMicrotask(() => {
      const saved = localStorage.getItem(modelKey(provider));
      if (saved && models.some((item) => item.id === saved)) {
        setModel(saved);
      } else if (!models.some((item) => item.id === model)) {
        setModel(models[0].id);
      }
    });
  }, [model, models, provider]);

  React.useEffect(() => {
    if (!conversations.length) return;
    const timeout = window.setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
        storageWarningRef.current = false;
      } catch {
        if (!storageWarningRef.current) {
          storageWarningRef.current = true;
          toast.error(
            "Browser storage is full. Export important chats before clearing older ones.",
          );
        }
      }
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [conversations]);

  const updateActive = React.useCallback(
    (updater: (conversation: Conversation) => Conversation) => {
      setConversations((current) =>
        current.map((conversation) =>
          conversation.id === activeId ? updater(conversation) : conversation,
        ),
      );
    },
    [activeId],
  );

  function newChat() {
    const conversation = createConversation();
    setConversations((current) => [conversation, ...current]);
    setActiveId(conversation.id);
    setMobileOpen(false);
    setInput("");
    setComposerMultiline(false);
    setAttachments([]);
  }

  function deleteChat(id: string) {
    const remaining = conversations.filter((conversation) => conversation.id !== id);
    if (remaining.length) {
      setConversations(remaining);
      if (id === activeId) setActiveId(remaining[0].id);
    } else {
      const replacement = createConversation();
      setConversations([replacement]);
      setActiveId(replacement.id);
    }
  }

  function togglePin(id: string) {
    setConversations((current) =>
      current
        .map((conversation) =>
          conversation.id === id
            ? { ...conversation, pinned: !conversation.pinned }
            : conversation,
        )
        .sort(
          (a, b) =>
            Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) ||
            b.updatedAt - a.updatedAt,
        ),
    );
  }

  function startRename(conversation: Conversation) {
    setRenameTarget(conversation);
    setRenameValue(conversation.title);
  }

  function saveRename() {
    const title = renameValue.trim();
    if (!renameTarget || !title) return;
    setConversations((current) =>
      current.map((conversation) =>
        conversation.id === renameTarget.id
          ? { ...conversation, title, updatedAt: Date.now() }
          : conversation,
      ),
    );
    setRenameTarget(null);
    toast.success("Conversation renamed");
  }

  function exportConversation(conversation: Conversation) {
    const markdown = [
      `# ${conversation.title}`,
      "",
      ...conversation.messages.flatMap((message) => [
        `## ${message.role === "assistant" ? "Eve" : "You"}`,
        "",
        message.content,
        "",
      ]),
    ].join("\n");
    const url = URL.createObjectURL(
      new Blob([markdown], { type: "text/markdown;charset=utf-8" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${conversation.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "evedraw"}.md`;
    anchor.click();
    URL.revokeObjectURL(url);
    toast.success("Conversation exported");
  }

  async function send(
    content: string,
    baseMessages = active?.messages ?? [],
    messageAttachments = attachments,
  ) {
    const trimmed = content.trim();
    if (!trimmed || streaming || !active) return;
    if (configurationStatus !== "ready") {
      toast.error(
        configurationStatus === "missing"
          ? "CURSOR_API_KEY is not configured."
          : "Eve is not connected to the server yet.",
      );
      return;
    }

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmed,
      attachments: messageAttachments.length ? messageAttachments : undefined,
    };
    const assistantMessage: Message = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
    };
    const requestMessages = [...baseMessages, userMessage];
    setInput("");
    setComposerMultiline(false);
    setAttachments([]);
    setStreaming(true);
    updateActive((conversation) => ({
      ...conversation,
      title:
        conversation.messages.length === 0
          ? trimmed.slice(0, 48)
          : conversation.title,
      messages: [...requestMessages, assistantMessage],
      updatedAt: Date.now(),
    }));

    const controller = new AbortController();
    abortRef.current = controller;
    let receivedText = "";
    let receivedAny = false;
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          model,
          messages: requestMessages.map(
            ({ role, content: text, attachments: files }, index) => ({
              role,
              content: text,
              attachments:
                index === requestMessages.length - 1
                  ? files?.map(({ name, mediaType, data }) => ({
                      name,
                      mediaType,
                      data,
                    }))
                  : undefined,
            }),
          ),
        }),
        signal: controller.signal,
      });
      if (!response.ok || !response.body) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error ?? "The assistant could not respond.");
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      const applyEvent = (event: ChatStreamEvent) => {
        if (event.type === "error") throw new Error(event.message);
        receivedAny = true;
        if (event.type === "tool" && event.name === "draw_on_board" && event.input) {
          setBoardOpen(true);
          void board.applyDraw(event.input).then((applied) => {
            if (!applied) toast.error("The drawing tool returned an invalid canvas update.");
          });
        }
        if (event.type === "text") receivedText += event.delta;
        updateActive((conversation) => ({
          ...conversation,
          messages: conversation.messages.map((message) => {
            if (message.id !== assistantMessage.id) return message;
            if (event.type === "text") {
              return { ...message, content: receivedText };
            }
            if (event.type === "reasoning") {
              return {
                ...message,
                reasoning: `${message.reasoning ?? ""}${event.delta}`,
              };
            }
            const activities = message.activities ?? [];
            const existing = activities.findIndex((item) => item.id === event.id);
            return {
              ...message,
              activities:
                existing >= 0
                  ? activities.map((item) =>
                      item.id === event.id ? { ...item, ...event } : item,
                    )
                  : [...activities, event],
            };
          }),
        }));
      };
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (line.trim()) applyEvent(JSON.parse(line) as ChatStreamEvent);
        }
      }
      buffer += decoder.decode();
      if (buffer.trim()) applyEvent(JSON.parse(buffer) as ChatStreamEvent);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        updateActive((conversation) => ({
          ...conversation,
          messages: conversation.messages
            .map((message) =>
              message.id === assistantMessage.id && receivedAny && !message.content
                ? { ...message, content: "_Generation stopped._" }
                : message,
            )
            .filter(
              (message) => message.id !== assistantMessage.id || receivedAny,
            ),
        }));
        return;
      }
      const message = error instanceof Error ? error.message : "Something went wrong.";
      toast.error(message);
      updateActive((conversation) => ({
        ...conversation,
        messages: conversation.messages
          .map((item) =>
            item.id === assistantMessage.id && receivedAny && !item.content
              ? { ...item, content: "_The response ended before completion._" }
              : item,
          )
          .filter((item) => item.id !== assistantMessage.id || receivedAny),
      }));
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }

  function regenerate() {
    if (!active || streaming) return;
    const lastUserIndex = active.messages.findLastIndex(
      (message) => message.role === "user",
    );
    if (lastUserIndex < 0) return;
    const prompt = active.messages[lastUserIndex].content;
    const base = active.messages.slice(0, lastUserIndex);
    updateActive((conversation) => ({ ...conversation, messages: base }));
    void send(prompt, base);
  }

  function startEditing(message: Message) {
    setEditingId(message.id);
    setEditingValue(message.content);
    setEditingAttachments(message.attachments ?? []);
  }

  function submitEdit() {
    if (!active || streaming) return;
    const index = active.messages.findIndex((message) => message.id === editingId);
    const content = editingValue.trim();
    if (index < 0 || !content) return;
    const base = active.messages.slice(0, index);
    const files = editingAttachments;
    setEditingId("");
    setEditingValue("");
    setEditingAttachments([]);
    updateActive((conversation) => ({ ...conversation, messages: base }));
    void send(content, base, files);
  }

  async function addImages(files: FileList | null) {
    if (!files?.length) return;
    const available = 3 - attachments.length;
    if (available <= 0) {
      toast.error("You can attach up to three images.");
      return;
    }
    try {
      const prepared = await Promise.all(
        Array.from(files).slice(0, available).map(prepareImage),
      );
      const totalSize = [...attachments, ...prepared].reduce(
        (total, attachment) => total + attachment.data.length,
        0,
      );
      if (totalSize > 3_800_000) {
        toast.error("Those images are too large. Try fewer or smaller images.");
        return;
      }
      setAttachments((current) => [...current, ...prepared]);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not attach that image.",
      );
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function selectModel(id: string) {
    setModel(id);
    localStorage.setItem(modelKey(provider), id);
  }

  function selectProvider(nextProvider: Provider) {
    if (nextProvider === provider) return;
    setProvider(nextProvider);
    localStorage.setItem(PROVIDER_KEY, nextProvider);
    const catalog = fallbackModels(nextProvider);
    const saved = localStorage.getItem(modelKey(nextProvider));
    setModel(
      saved && catalog.some((item) => item.id === saved)
        ? saved
        : catalog[0].id,
    );
  }

  async function copy(message: Message) {
    await navigator.clipboard.writeText(message.content);
    setCopiedId(message.id);
    setTimeout(() => setCopiedId(""), 1500);
  }

  const filteredConversations = conversations.filter((conversation) => {
    const needle = searchQuery.trim().toLowerCase();
    if (!needle) return true;
    return `${conversation.title} ${conversation.messages
      .map((message) => message.content)
      .join(" ")}`
      .toLowerCase()
      .includes(needle);
  });
  const searchPreview =
    filteredConversations.find(
      (conversation) => conversation.id === searchPreviewId,
    ) ?? filteredConversations.find((conversation) => conversation.id === activeId);
  const searchAction = conversations.find(
    (conversation) => conversation.id === searchActionId,
  );

  const sidebarProps = {
    conversations,
    activeId,
    onSelect: (id: string) => {
      setActiveId(id);
      setMobileOpen(false);
    },
    onNew: newChat,
    onDelete: deleteChat,
    onRename: startRename,
    onExport: exportConversation,
    onSearch: () => {
      setSearchPreviewId(activeId);
      setSearchOpen(true);
      setMobileOpen(false);
    },
    onToggle: () => setSidebarCollapsed((current) => !current),
    onToggleTheme: () =>
      setTheme(resolvedTheme === "dark" ? "light" : "dark"),
    onSignOut: () => void signOut({ redirectUrl: "/login" }),
    resolvedTheme,
    themeMounted,
  };

  const composer = (
    <div className="relative w-full max-w-[800px]">
      {!!attachments.length && (
        <div className="absolute bottom-full left-5 mb-3 flex flex-wrap gap-2">
          {attachments.map((attachment) => (
            <div className="relative" key={attachment.id}>
              <Image
                alt={attachment.name}
                className="size-16 rounded-xl border object-cover shadow-lg"
                height={64}
                src={attachment.data}
                unoptimized
                width={64}
              />
              <Button
                aria-label={`Remove ${attachment.name}`}
                className="absolute -top-2 -right-2 rounded-full"
                size="icon-xs"
                type="button"
                variant="secondary"
                onClick={() =>
                  setAttachments((current) =>
                    current.filter((item) => item.id !== attachment.id),
                  )
                }
              >
                <X />
              </Button>
            </div>
          ))}
        </div>
      )}
      <input
        accept="image/png,image/jpeg,image/webp"
        className="sr-only"
        multiple
        onChange={(event) => void addImages(event.target.files)}
        ref={fileInputRef}
        type="file"
      />
      <PromptInput
        className={`[&_[data-slot=input-group]]:h-auto [&_[data-slot=input-group]]:min-h-[60px] [&_[data-slot=input-group]]:rounded-[32px] [&_[data-slot=input-group]]:border-border/70 [&_[data-slot=input-group]]:bg-muted/55 [&_[data-slot=input-group]]:px-2 [&_[data-slot=input-group]]:shadow-sm [&_[data-slot=input-group]]:backdrop-blur-xl ${
          composerMultiline && input
            ? "[&_[data-slot=input-group]]:flex-wrap [&_[data-slot=input-group]]:items-end [&_[data-slot=input-group]]:gap-y-2 [&_[data-slot=input-group]]:pb-2 [&_[data-slot=input-group-control]]:order-first [&_[data-slot=input-group-control]]:w-full [&_[data-slot=input-group-control]]:basis-full [&_[data-slot=input-group-control]]:flex-none"
            : "[&_[data-slot=input-group]]:items-center"
        }`}
        onSubmit={({ text }) => void send(text)}
      >
        <PromptInputBody>
          <PromptInputButton
            aria-label="Attach images"
            className="size-11 shrink-0 rounded-full"
            disabled={
              configurationStatus !== "ready" ||
              streaming ||
              attachments.length >= 3
            }
            size="icon-sm"
            tooltip="Attach images"
            onClick={() => fileInputRef.current?.click()}
          >
            <Plus className="size-5" />
          </PromptInputButton>
          <PromptInputTextarea
            aria-label="Ask Eve anything"
            data-eve-composer-textarea
            className={`min-h-11 max-h-[400px] flex-1 resize-none border-0 bg-transparent px-2 text-base leading-7 tracking-[-0.1px] shadow-none focus-visible:ring-0 md:text-base [scrollbar-color:var(--border)_transparent] [&::-webkit-scrollbar]:w-2.5 [&::-webkit-scrollbar-button]:hidden [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border ${
              composerMultiline && input ? "pt-4 pb-0" : "py-2"
            }`}
            placeholder={active?.messages.length ? "Ask anything" : "What's on your mind?"}
            value={input}
            onChange={(event) => {
              setInput(event.target.value);
              setComposerMultiline(event.currentTarget.scrollHeight > 60);
            }}
          />
          <PromptInputTools
            className={`shrink-0 gap-0 ${
              composerMultiline && input ? "ml-auto" : ""
            }`}
          >
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <PromptInputButton
                    aria-label="Select model"
                    className="hidden h-10 rounded-full px-3 font-semibold sm:flex"
                    tooltip="Model"
                  />
                }
              >
                {models.find((item) => item.id === model)?.displayName ?? model}
                <ChevronDown className="size-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="max-h-none w-80 overflow-hidden rounded-2xl bg-popover/55 p-2 shadow-lg backdrop-blur-xl"
              >
                <div aria-label="Model provider" className="mb-2 grid grid-cols-2 gap-1 px-1" role="group">
                  {(["ollama", "cursor"] as const).map((item) => (
                    <Button
                      aria-label={item === "cursor" ? "Cursor" : "Ollama Cloud"}
                      aria-pressed={provider === item}
                      className="h-9 w-full rounded-lg"
                      disabled={availableProviders?.[item] === false}
                      key={item}
                      size="icon-sm"
                      variant={provider === item ? "secondary" : "ghost"}
                      onClick={() => selectProvider(item)}
                    >
                      {item === "cursor" ? (
                        <Cursor className="size-5" />
                      ) : (
                        <Ollama className="size-5" />
                      )}
                      <span className="sr-only">
                        {item === "cursor" ? "Cursor" : "Ollama Cloud"}
                      </span>
                    </Button>
                  ))}
                </div>
                <ScrollArea className="h-[min(28rem,calc(var(--available-height)-1rem))]">
                  <div className="pr-2">
                    {models.map((item) => (
                      <DropdownMenuItem
                        className="gap-3 rounded-xl py-2.5"
                        key={item.id}
                        onClick={() => selectModel(item.id)}
                      >
                        <ModelProviderIcon modelId={item.id} provider={provider} />
                        <span className="min-w-0 flex-1 truncate font-semibold">
                          {item.displayName}
                        </span>
                        {item.id === model && <Check className="ml-auto" />}
                      </DropdownMenuItem>
                    ))}
                  </div>
                </ScrollArea>
              </DropdownMenuContent>
            </DropdownMenu>
            <PromptInputSubmit
              className="size-11 rounded-full"
              disabled={
                configurationStatus !== "ready" ||
                (!input.trim() && !streaming)
              }
              status={streaming ? "streaming" : "ready"}
              onStop={() => abortRef.current?.abort()}
            />
          </PromptInputTools>
        </PromptInputBody>
      </PromptInput>
    </div>
  );

  return (
    <main className="flex h-dvh overflow-hidden bg-background text-foreground">
      <Dialog
        open={renameTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRenameTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename conversation</DialogTitle>
            <DialogDescription>
              Choose a short name that will be easy to find later.
            </DialogDescription>
          </DialogHeader>
          <form
            id="rename-conversation"
            onSubmit={(event) => {
              event.preventDefault();
              saveRename();
            }}
          >
            <Input
              autoFocus
              aria-label="Conversation name"
              maxLength={80}
              value={renameValue}
              onChange={(event) => setRenameValue(event.target.value)}
            />
          </form>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameTarget(null)}>
              Cancel
            </Button>
            <Button
              disabled={!renameValue.trim()}
              form="rename-conversation"
              type="submit"
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={searchOpen}
        onOpenChange={(open) => {
          setSearchOpen(open);
          if (open) setSearchPreviewId(activeId);
          if (!open) setSearchActionId("");
        }}
      >
        <DialogContent
          showCloseButton={false}
          overlayClassName="bg-transparent supports-backdrop-filter:backdrop-blur-none"
          className={`grid grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden rounded-3xl bg-popover/55 p-0 shadow-2xl backdrop-blur-xl transition-[width,height] duration-150 ${
            searchExpanded
              ? "h-[calc(100dvh-5rem)] w-[calc(100dvw-2rem)] max-w-[1600px] sm:max-w-[1600px] lg:w-5/6"
              : "h-[60dvh] min-h-[32rem] w-[calc(100dvw-2rem)] max-w-3xl sm:max-w-3xl"
          }`}
        >
          <DialogHeader className="sr-only">
            <DialogTitle>Search conversations</DialogTitle>
            <DialogDescription>
              Find, open, rename, or delete a conversation.
            </DialogDescription>
          </DialogHeader>
          <div className="relative border-b p-2">
            <Search className="absolute top-1/2 right-5 size-5 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              aria-label="Search conversations"
              className="h-10 border-0 bg-transparent pr-10 text-base shadow-none focus-visible:ring-0 dark:bg-transparent"
              placeholder="Search..."
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
          </div>
          <div
            className={`grid min-h-0 ${
              searchExpanded ? "md:grid-cols-[minmax(20rem,40%)_1fr]" : ""
            }`}
          >
            <ScrollArea
              className={`min-h-0 ${
                searchExpanded ? "border-r border-border" : ""
              }`}
            >
              <div className="p-3">
                <p className="px-3 py-2 text-sm text-muted-foreground">Today</p>
                {filteredConversations.map((conversation) => (
                  <div
                    className={`group flex h-13 items-center rounded-xl hover:bg-muted ${
                      searchExpanded && conversation.id === searchPreview?.id
                        ? "bg-muted"
                        : ""
                    }`}
                    key={conversation.id}
                    onFocusCapture={() => {
                      setSearchActionId(conversation.id);
                      if (searchExpanded) setSearchPreviewId(conversation.id);
                    }}
                    onMouseEnter={() => {
                      setSearchActionId(conversation.id);
                      if (searchExpanded) setSearchPreviewId(conversation.id);
                    }}
                  >
                    <Button
                      className="h-full min-w-0 flex-1 justify-start px-3 font-normal hover:bg-transparent dark:hover:bg-transparent"
                      variant="ghost"
                      onClick={() => {
                        setActiveId(conversation.id);
                        setSearchOpen(false);
                      }}
                    >
                      <span className="truncate">{conversation.title}</span>
                    </Button>
                    <span className="mr-3 shrink-0 text-sm text-muted-foreground group-hover:hidden group-focus-within:hidden">
                      {formatRelativeTime(conversation.updatedAt)}
                    </span>
                    <div className="mr-1 hidden shrink-0 items-center gap-1 group-hover:flex group-focus-within:flex">
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <Button
                              aria-label={`Open ${conversation.title} in a new tab`}
                              size="icon-sm"
                              variant="ghost"
                              onClick={() =>
                                window.open(
                                  `${window.location.origin}${window.location.pathname}?conversation=${encodeURIComponent(conversation.id)}`,
                                  "_blank",
                                  "noopener,noreferrer",
                                )
                              }
                            />
                          }
                        >
                          <ExternalLink />
                        </TooltipTrigger>
                        <TooltipContent>Open in new tab</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <Button
                              aria-label={`Rename ${conversation.title}`}
                              size="icon-sm"
                              variant="ghost"
                              onClick={() => startRename(conversation)}
                            />
                          }
                        >
                          <Pencil />
                        </TooltipTrigger>
                        <TooltipContent>Rename</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <Button
                              aria-label={`Delete ${conversation.title}`}
                              size="icon-sm"
                              variant="ghost"
                              onClick={() => deleteChat(conversation.id)}
                            />
                          }
                        >
                          <Trash2 />
                        </TooltipTrigger>
                        <TooltipContent>Delete</TooltipContent>
                      </Tooltip>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
            {searchExpanded && (
              <ScrollArea className="hidden min-h-0 md:block">
                {searchPreview ? (
                  <div className="mx-auto max-w-3xl space-y-6 p-8">
                    {searchPreview.messages.length ? (
                      searchPreview.messages.map((message) => (
                        <div
                          className={
                            message.role === "user"
                              ? "ml-auto max-w-[80%] rounded-2xl bg-muted px-4 py-3"
                              : "leading-7"
                          }
                          key={message.id}
                        >
                          <p className="whitespace-pre-wrap">{message.content}</p>
                        </div>
                      ))
                    ) : (
                      <p className="text-muted-foreground">
                        This conversation has no messages yet.
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="flex h-full items-center justify-center text-muted-foreground">
                    Select a conversation to preview
                  </div>
                )}
              </ScrollArea>
            )}
          </div>
          <div className="flex h-12 items-center justify-between border-t px-2">
            <Button
              aria-label={
                searchExpanded
                  ? "Hide conversation previews"
                  : "Show conversation previews"
              }
              size="icon-sm"
              variant="ghost"
              onClick={() => setSearchExpanded((expanded) => !expanded)}
            >
              {searchExpanded ? <Minimize2 /> : <Maximize2 />}
            </Button>
            {searchAction && (
              <div className="flex items-center gap-2">
                <Button
                  className="h-8 gap-2 rounded-[12px] py-0 pr-1.5 pl-3 text-[13px]"
                  variant="ghost"
                  onClick={() => {
                    setActiveId(searchAction.id);
                    setSearchOpen(false);
                  }}
                >
                  Go
                  <span className="rounded-[6px] border px-1.5 text-[13px] leading-[19.5px] text-muted-foreground">
                    ⏎
                  </span>
                </Button>
                <Button
                  className="h-8 gap-2 rounded-[12px] py-0 pr-1.5 pl-3 text-[13px]"
                  variant="ghost"
                  onClick={() => {
                    setSearchOpen(false);
                    startRename(searchAction);
                  }}
                >
                  Edit
                  <span className="rounded-[6px] border px-1.5 text-[13px] leading-[19.5px] text-muted-foreground">
                    Ctrl+ ⇧ E
                  </span>
                </Button>
                <Button
                  className="h-8 gap-2 rounded-[12px] py-0 pr-1.5 pl-3 text-[13px]"
                  variant="ghost"
                  onClick={() => deleteChat(searchAction.id)}
                >
                  Delete
                  <span className="rounded-[6px] border px-1.5 text-[13px] leading-[19.5px] text-muted-foreground">
                    Ctrl+ ⇧ D
                  </span>
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <aside
        className={`hidden shrink-0 transition-[width] duration-200 md:block ${
          sidebarCollapsed ? "w-14" : "w-64"
        }`}
      >
        <Sidebar {...sidebarProps} collapsed={sidebarCollapsed} />
      </aside>

      <section className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="pointer-events-none absolute inset-x-0 top-0 z-30 flex h-16 items-center justify-between px-4">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger
              render={
                <Button
                  className="pointer-events-auto md:hidden"
                  size="icon"
                  variant="ghost"
                />
              }
            >
              <Menu />
              <span className="sr-only">Open conversations</span>
            </SheetTrigger>
            <SheetContent className="w-64 border-0 p-0" side="left">
              <SheetTitle className="sr-only">Conversations</SheetTitle>
              <Sidebar
                {...sidebarProps}
                collapsed={false}
                onToggle={() => setMobileOpen(false)}
              />
            </SheetContent>
          </Sheet>
          <div className="ml-auto flex items-center gap-1">
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
              <TooltipContent>{boardOpen ? "Close canvas" : "Open canvas"}</TooltipContent>
            </Tooltip>
            {!!active?.messages.length && active && (
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                  <Button
                    aria-label="More conversation options"
                    className="pointer-events-auto"
                    size="icon"
                    variant="ghost"
                  />
                  }
                >
                  <MoreHorizontal />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 rounded-2xl p-2">
                  <DropdownMenuItem
                    className="gap-3 rounded-xl py-2.5"
                    onClick={() => togglePin(active.id)}
                  >
                    <Pin />
                    {active.pinned ? "Unpin" : "Pin"}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="gap-3 rounded-xl py-2.5"
                    variant="destructive"
                    onClick={() => deleteChat(active.id)}
                  >
                    <Trash2 />
                    Delete Chat
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </header>

        {configurationStatus !== "ready" && (
          <div className="pointer-events-none absolute top-16 right-3 left-3 z-20">
            <Alert
              className="pointer-events-auto mx-auto max-w-xl bg-background/90 py-2 backdrop-blur"
              variant={configurationStatus === "checking" ? "default" : "destructive"}
            >
              <TriangleAlert />
              <AlertTitle>
                {configurationStatus === "checking"
                  ? "Connecting"
                  : configurationStatus === "missing"
                    ? "Cursor API key required"
                    : "Eve is offline"}
              </AlertTitle>
              <AlertDescription className="sr-only">
                {configurationStatus === "missing"
                  ? "Add CURSOR_API_KEY and restart or redeploy."
                  : "The API is unavailable."}
              </AlertDescription>
            </Alert>
          </div>
        )}

        <div className="flex min-h-0 flex-1">
        <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
        {!active?.messages.length ? (
          <div className="relative flex min-h-0 flex-1 flex-col items-center px-3">
            <div className="mt-[32vh] text-center sm:mt-[27.5vh]">
              <h1 className="flex justify-center">
                <span className="sr-only">eve</span>
                <EveMark className="h-12 w-[150px]" />
              </h1>
            </div>
            <div className="absolute right-2 bottom-5 left-2 flex justify-center sm:static sm:mt-12 sm:w-full">
              {composer}
            </div>
          </div>
        ) : (
          <>
            <AIConversation className="min-h-0 flex-1">
              <ConversationContent className="mx-auto w-full max-w-[768px] gap-0 px-4 pt-20 pb-36 sm:px-0">
                {active.messages.map((message) => (
                  <AIMessage
                    className={`max-w-full gap-0 ${
                      message.role === "user" ? "pb-2.5" : ""
                    }`}
                    from={message.role}
                    key={message.id}
                  >
                    {message.role === "assistant" && message.reasoning && (
                      <Reasoning
                        className="mb-3"
                        isStreaming={streaming && message === active.messages.at(-1)}
                      >
                        <ReasoningTrigger
                          className="w-fit gap-1 pt-3 pb-0 leading-6"
                          getThinkingMessage={(isStreaming) =>
                            isStreaming ? "Working..." : "Worked for a few seconds"
                          }
                        />
                        <ReasoningContent>{message.reasoning}</ReasoningContent>
                      </Reasoning>
                    )}

                    {message.role === "assistant" &&
                      !!message.activities?.length && (
                        <Collapsible className="mb-1">
                          <CollapsibleTrigger
                            render={
                              <Button
                                className="h-auto gap-2 px-0 text-muted-foreground hover:bg-transparent hover:text-foreground"
                                variant="ghost"
                              />
                            }
                          >
                            {message.activities.some(
                              (activity) => activity.status === "running",
                            ) ? (
                              <Loader2 className="animate-spin" />
                            ) : (
                              <Wrench />
                            )}
                            {message.activities.length} tool update
                            {message.activities.length === 1 ? "" : "s"}
                            <ChevronDown />
                          </CollapsibleTrigger>
                          <CollapsibleContent className="mt-3 space-y-2 border-l pl-4 text-sm">
                            {message.activities.map((activity) => (
                              <div className="flex items-center gap-2" key={activity.id}>
                                {activity.status === "running" ? (
                                  <Loader2 className="size-4 animate-spin" />
                                ) : activity.status === "complete" ? (
                                  <CheckCircle2 className="size-4" />
                                ) : (
                                  <X className="size-4 text-destructive" />
                                )}
                                {activity.title ??
                                  activity.name.replace(/[_-]+/g, " ")}
                              </div>
                            ))}
                          </CollapsibleContent>
                        </Collapsible>
                      )}

                    {editingId === message.id ? (
                      <div className="ml-auto w-full max-w-[85%] space-y-2">
                        <Textarea
                          aria-label="Edit message"
                          autoFocus
                          className="min-h-24 rounded-2xl"
                          value={editingValue}
                          onChange={(event) => setEditingValue(event.target.value)}
                        />
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setEditingId("")}
                          >
                            Cancel
                          </Button>
                          <Button
                            disabled={!editingValue.trim()}
                            size="sm"
                            onClick={submitEdit}
                          >
                            Send
                          </Button>
                        </div>
                      </div>
                    ) : message.content ? (
                      <MessageContent
                        className={
                          message.role === "user"
                            ? "max-w-[95%] border border-border/70 bg-muted px-4 py-2 text-[15px] leading-[22.5px] group-[.is-user]:rounded-[24px] group-[.is-user]:rounded-br-[8px] group-[.is-user]:bg-muted group-[.is-user]:px-4 group-[.is-user]:py-2 dark:bg-[#141414] dark:group-[.is-user]:bg-[#141414] sm:max-w-[90%]"
                            : "w-full max-w-full overflow-visible bg-transparent p-0 text-[15px] leading-[22.5px]"
                        }
                      >
                        {!!message.attachments?.length && (
                          <div className="mb-3 flex flex-wrap gap-2">
                            {message.attachments.map((attachment) => (
                              <Image
                                alt={attachment.name}
                                className="h-36 w-auto rounded-xl border object-cover"
                                height={144}
                                key={attachment.id}
                                src={attachment.data}
                                unoptimized
                                width={192}
                              />
                            ))}
                          </div>
                        )}
                        <MessageResponse className="[&_h2]:mt-7 [&_h2]:text-2xl [&_h2]:font-semibold [&_h3]:mt-6 [&_h3]:text-xl [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:space-y-1 [&_ol]:pl-6">
                          {message.content}
                        </MessageResponse>
                      </MessageContent>
                    ) : (
                      <div className="flex gap-1 py-2" aria-label="Eve is responding">
                        <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground" />
                        <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:120ms]" />
                        <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:240ms]" />
                      </div>
                    )}

                    {message.content && editingId !== message.id && (
                      <MessageActions
                        className={
                          message.role === "user"
                            ? "mt-0.5 ml-auto opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
                            : "-ml-2 mt-0.5 text-muted-foreground"
                        }
                      >
                        {message.role === "assistant" ? (
                          <>
                            <MessageAction
                              label="Copy response"
                              tooltip="Copy"
                              onClick={() => void copy(message)}
                            >
                              {copiedId === message.id ? <Check /> : <Clipboard />}
                            </MessageAction>
                            <MessageAction label="Share response" tooltip="Share">
                              <Share2 />
                            </MessageAction>
                            <MessageAction label="Like response" tooltip="Like">
                              <ThumbsUp />
                            </MessageAction>
                            <MessageAction label="Dislike response" tooltip="Dislike">
                              <ThumbsDown />
                            </MessageAction>
                            <MessageAction
                              label="Regenerate response"
                              tooltip="Regenerate"
                              disabled={streaming}
                              onClick={regenerate}
                            >
                              <RefreshCw />
                            </MessageAction>
                            <MessageAction label="More actions" tooltip="More">
                              <MoreHorizontal />
                            </MessageAction>
                          </>
                        ) : (
                          <MessageAction
                            label="Edit message"
                            tooltip="Edit"
                            disabled={streaming}
                            onClick={() => startEditing(message)}
                          >
                            <Pencil />
                          </MessageAction>
                        )}
                      </MessageActions>
                    )}
                  </AIMessage>
                ))}
              </ConversationContent>
              <ConversationScrollButton className="right-[max(1rem,calc(50%-400px))] bottom-28 left-auto translate-x-0" />
            </AIConversation>
            <div className="absolute right-2 bottom-3 left-2 z-20 flex justify-center sm:right-3 sm:left-3">
              {composer}
            </div>
          </>
        )}
        </div>
        {boardOpen && (
          <aside className="min-h-0 w-[48%] min-w-[360px] max-md:absolute max-md:inset-0 max-md:z-20 max-md:w-full max-md:min-w-0">
            <BoardPanel />
          </aside>
        )}
        </div>
      </section>
    </main>
  );
}
