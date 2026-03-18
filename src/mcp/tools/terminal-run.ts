import type { SessionManager } from "../../terminal/session-manager.js";
import type { McpToolResponse } from "../../types/index.js";
import { terminalRunSchema } from "./schemas.js";

export async function handleTerminalRun(
  params: unknown,
  sessionManager: SessionManager,
): Promise<McpToolResponse> {
  const input = terminalRunSchema.parse(params);

  // Try to reuse an existing session matching cwd and agentId that is not busy
  let sessionId: string | undefined;
  const existing = sessionManager.listSessions(input.agentId);
  for (const s of existing) {
    if (!s.isActive || (input.cwd && s.cwd !== input.cwd)) continue;
    const session = sessionManager.getSession(s.sessionId);
    if (session && !session.isBusy) {
      sessionId = s.sessionId;
      break;
    }
  }

  // Create new session only if no compatible one exists
  if (!sessionId) {
    const sessionInfo = sessionManager.createSession({
      name: input.name ?? `run-${Date.now()}`,
      cwd: input.cwd,
      env: input.env,
      shell: input.shell,
      agentId: input.agentId,
    });
    sessionId = sessionInfo.sessionId;
  }

  const session = sessionManager.getSession(sessionId);
  if (!session) {
    return {
      content: [
        {
          type: "text",
          text: "Error: Failed to get terminal session.",
        },
      ],
      isError: true,
    };
  }

  // Validate command
  const validation = sessionManager.validateCommand(input.command);
  if (!validation.valid) {
    return {
      content: [
        {
          type: "text",
          text: `Command blocked: ${validation.reason}`,
        },
      ],
      isError: true,
    };
  }

  const timeoutMs = input.timeoutMs ?? sessionManager.getDefaultTimeout();
  const waitForCompletion = input.waitForCompletion ?? true;

  const result = await session.execute(
    input.command,
    timeoutMs,
    waitForCompletion,
  );

  // Strip ANSI escape codes and clean up output
  const cleanOutput = result.output
    .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "")
    .replace(/\x1b\][^\x07]*\x07/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "")
    .trim();

  const statusParts = [
    `exit: ${result.exitCode ?? "n/a"}`,
    `${result.durationMs}ms`,
    sessionId,
  ];

  let text = `$ ${input.command}\n${cleanOutput}\n\n[${statusParts.join(" | ")}]`;

  if (result.timedOut) {
    text += `\n[TIMED OUT after ${timeoutMs}ms - session still active, use read to get more output]`;
  }

  return {
    content: [
      {
        type: "text",
        text,
      },
    ],
    isError: result.exitCode !== null && result.exitCode !== 0,
  };
}
