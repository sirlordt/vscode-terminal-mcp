import type { SessionManager } from "../../terminal/session-manager.js";
import type { McpToolResponse } from "../../types/index.js";
import { terminalExecuteSchema } from "./schemas.js";

export async function handleTerminalExecute(
  params: unknown,
  sessionManager: SessionManager,
): Promise<McpToolResponse> {
  const input = terminalExecuteSchema.parse(params);

  const session = sessionManager.getSession(input.sessionId);
  if (!session) {
    return {
      content: [
        {
          type: "text",
          text: `Error: Session "${input.sessionId}" not found. Use terminal_list to see active sessions.`,
        },
      ],
      isError: true,
    };
  }

  // Validate command against blocklist
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

  const response: Record<string, unknown> = {
    sessionId: input.sessionId,
    commandId: result.commandId,
    exitCode: result.exitCode,
    timedOut: result.timedOut,
    durationMs: result.durationMs,
    output: result.output,
  };

  if (result.timedOut) {
    response.warning = `Command timed out after ${timeoutMs}ms. Output may be incomplete. The terminal session is still active.`;
  }

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(response, null, 2),
      },
    ],
  };
}
