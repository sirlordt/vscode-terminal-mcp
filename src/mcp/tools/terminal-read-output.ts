import type { SessionManager } from "../../terminal/session-manager.js";
import type { McpToolResponse } from "../../types/index.js";
import { terminalReadOutputSchema } from "./schemas.js";

export async function handleTerminalReadOutput(
  params: unknown,
  sessionManager: SessionManager,
): Promise<McpToolResponse> {
  const input = terminalReadOutputSchema.parse(params);

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

  const result = session.readOutput(input.offset, input.lines);

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            sessionId: input.sessionId,
            readFrom: result.readFrom,
            readCount: result.readCount,
            totalLines: result.totalLines,
            remaining: result.remaining,
            isComplete: result.isComplete,
            output: result.lines.join("\n"),
          },
          null,
          2,
        ),
      },
    ],
  };
}
