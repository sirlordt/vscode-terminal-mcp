import type { SessionManager } from "../../terminal/session-manager.js";
import type { McpToolResponse } from "../../types/index.js";
import { terminalListSchema } from "./schemas.js";

export async function handleTerminalList(
  params: unknown,
  sessionManager: SessionManager,
): Promise<McpToolResponse> {
  const input = terminalListSchema.parse(params ?? {});

  const sessions = sessionManager.listSessions(input.agentId);

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            count: sessions.length,
            sessions,
          },
          null,
          2,
        ),
      },
    ],
  };
}
