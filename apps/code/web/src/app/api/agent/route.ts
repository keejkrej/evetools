import { stepCountIs, streamText, tool, type ModelMessage } from "ai";
import { cursor } from "ai-sdk-provider-cursor-sdk";
import { createEveStreamResponse } from "@evetools/agent";
import { z } from "zod";
import { requestApproval } from "@/lib/approvals";
import { formatCodeSkills, listCodeSkills, loadCodeSkill } from "@/lib/skills";
import {
  listWorkspaceFiles,
  readWorkspaceFile,
  runWorkspaceCommand,
  workspaceRoot,
  writeWorkspaceFile,
} from "@/lib/workspace";

export const runtime = "nodejs";
export const maxDuration = 300;

const requestSchema = z.object({
  messages: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string().min(1).max(100_000),
  })).min(1).max(100),
  model: z.string().min(1).max(100).regex(/^[a-zA-Z0-9._:/-]+$/).default("auto"),
  threadId: z.string().uuid(),
  turnId: z.string().uuid(),
  permissionMode: z.enum(["ask", "trusted"]).default("ask"),
});

export async function POST(request: Request) {
  if (!process.env.CURSOR_API_KEY) {
    return Response.json({ error: "CURSOR_API_KEY is not configured." }, { status: 503 });
  }

  let root: string;
  try {
    root = workspaceRoot();
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Workspace unavailable." }, { status: 503 });
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid agent request." }, { status: 400 });

  const messages: ModelMessage[] = parsed.data.messages.map((message) => ({
    role: message.role,
    content: message.content,
  }));
  const skillCatalog = formatCodeSkills(await listCodeSkills());

  const result = streamText({
    model: cursor(parsed.data.model, {
      createNewAgentPerCall: true,
      mode: "agent",
      promptHistoryMode: "flatten",
      systemMessageMode: "prefix",
      cloud: {
        env: { type: "cloud" },
        repos: [],
        autoCreatePR: false,
        skipReviewerRequest: true,
      },
    }),
    system: `You are Evecode, a careful coding agent working in ${root}. Inspect relevant files before editing. Make focused changes, preserve existing style, run targeted validation, and report exactly what changed. Never access paths outside this workspace. Use tools rather than claiming actions you did not perform.${skillCatalog}`,
    messages,
    tools: {
      load_skill: tool({
        description: "Load a relevant coding skill or one of that skill's referenced resources. Omit path to load SKILL.md.",
        inputSchema: z.object({
          name: z.string().min(1).max(64),
          path: z.string().min(1).max(500).optional(),
        }),
        execute: async ({ name, path }) => loadCodeSkill(name, path),
      }),
      list_files: tool({
        description: "List files in the configured workspace.",
        inputSchema: z.object({}),
        execute: async () => ({ files: await listWorkspaceFiles() }),
      }),
      read_file: tool({
        description: "Read a UTF-8 text file relative to the workspace root.",
        inputSchema: z.object({ path: z.string().min(1) }),
        execute: async ({ path }) => ({ path, content: await readWorkspaceFile(path) }),
      }),
      write_file: tool({
        description: "Create or fully replace a UTF-8 text file relative to the workspace root.",
        inputSchema: z.object({ path: z.string().min(1), content: z.string().max(500_000) }),
        execute: async ({ path, content }) => {
          if (parsed.data.permissionMode === "ask") {
            const approved = await requestApproval({
              threadId: parsed.data.threadId,
              kind: "write_file",
              title: `Write ${path}`,
              detail: `${content.length.toLocaleString()} characters will be written`,
            }, request.signal);
            if (!approved) return { path, written: false, denied: true };
          }
          await writeWorkspaceFile(path, content);
          return { path, written: true };
        },
      }),
      run_command: tool({
        description: "Run a shell command in the workspace. Use for search, git inspection, tests, formatting, and builds.",
        inputSchema: z.object({ command: z.string().min(1).max(4_000) }),
        execute: async ({ command }) => {
          if (parsed.data.permissionMode === "ask") {
            const approved = await requestApproval({
              threadId: parsed.data.threadId,
              kind: "run_command",
              title: "Run shell command",
              detail: command,
            }, request.signal);
            if (!approved) return { output: "Command denied by the user.", exitCode: 126, denied: true };
          }
          return runWorkspaceCommand(command);
        },
      }),
    },
    stopWhen: stepCountIs(20),
    abortSignal: request.signal,
  });

  return createEveStreamResponse(result.fullStream, { signal: request.signal, turnId: parsed.data.turnId });
}
