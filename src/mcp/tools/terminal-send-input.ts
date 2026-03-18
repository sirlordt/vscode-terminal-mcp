import type { SessionManager } from "../../terminal/session-manager.js";
import type { McpToolResponse } from "../../types/index.js";
import { terminalSendInputSchema } from "./schemas.js";

export async function handleTerminalSendInput(
  params: unknown,
  sessionManager: SessionManager,
): Promise<McpToolResponse> {
  const input = terminalSendInputSchema.parse(params);

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

  session.sendInput(input.input, input.pressEnter ?? true);

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          status: "sent",
          sessionId: input.sessionId,
          inputLength: input.input.length,
          pressedEnter: input.pressEnter ?? true,
        }),
      },
    ],
  };
}
