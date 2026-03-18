import type { SessionManager } from "../../terminal/session-manager.js";
import type { McpToolResponse } from "../../types/index.js";
import { terminalCreateSchema } from "./schemas.js";

export async function handleTerminalCreate(
  params: unknown,
  sessionManager: SessionManager,
): Promise<McpToolResponse> {
  const input = terminalCreateSchema.parse(params);

  const sessionInfo = sessionManager.createSession({
    name: input.name,
    cwd: input.cwd,
    env: input.env,
    shell: input.shell,
    agentId: input.agentId,
  });

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            status: "created",
            sessionId: sessionInfo.sessionId,
            name: sessionInfo.name,
            cwd: sessionInfo.cwd,
            agentId: sessionInfo.agentId,
          },
          null,
          2,
        ),
      },
    ],
  };
}
