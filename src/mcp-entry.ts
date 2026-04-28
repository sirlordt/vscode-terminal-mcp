#!/usr/bin/env node
/**
 * MCP Entry Point (stdio-to-IPC bridge)
 *
 * This is the process spawned by VSCode's MCP auto-discovery.
 * It reads JSON-RPC messages from stdin, forwards them to the
 * extension host via a Unix domain socket, and relays responses
 * back to stdout.
 */

import * as net from "net";
import * as path from "path";
import * as os from "os";

import * as fs from "fs";

function getSocketPath(): string {
  // Discovery file is written by the extension host on activation.
  // We read it fresh on every call so reconnect attempts pick up the
  // correct path even if the extension activates after mcp-entry starts.
  const discoveryPath = path.join(os.homedir(), ".vscode-terminal-mcp.discovery");
  try {
    const socketPath = fs.readFileSync(discoveryPath, "utf8").trim();
    // NOTE: Do NOT use fs.existsSync here – it returns false for Windows
    // Named Pipes (\\\\.\\ pipe\\...) even when the pipe is alive.
    if (socketPath) {
      return socketPath;
    }
  } catch {
    // Fall through to default
  }
  // Fallback: reconstruct the path the extension would have used
  const crypto = require("crypto");
  const hash = crypto.createHash("md5").update("").digest("hex").slice(0, 8);
  if (process.platform === "win32") {
    return `\\\\.\\pipe\\vscode-terminal-mcp-${hash}`;
  }
  return path.join(os.tmpdir(), `vscode-terminal-mcp-${hash}.sock`);
}
const RECONNECT_DELAY_MS = 1000;
const MAX_RECONNECT_ATTEMPTS = 30;

interface JsonRpcMessage {
  jsonrpc: "2.0";
  id?: string | number;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
}

class StdioToIpcBridge {
  private socket: net.Socket | null = null;
  private pendingRequests = new Map<string, PendingRequest>();
  private socketBuffer = "";
  private stdinBuffer = "";
  private connected = false;
  private reconnectAttempts = 0;

  async start(): Promise<void> {
    await this.connectToExtension();
    this.listenStdin();
  }

  private async connectToExtension(): Promise<void> {
    return new Promise((resolve, reject) => {
      const attempt = () => {
        // Re-read socket path on every attempt so we pick up the discovery
        // file written by the extension even if it activated late.
        const socketPath = getSocketPath();
        this.socket = net.createConnection(socketPath, () => {
          this.connected = true;
          this.reconnectAttempts = 0;
          this.setupSocketListeners();
          resolve();
        });

        this.socket.on("error", (err) => {
          this.connected = false;
          this.reconnectAttempts++;

          if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
            const errorMsg = `Failed to connect to extension host after ${MAX_RECONNECT_ATTEMPTS} attempts: ${err.message}`;
            process.stderr.write(errorMsg + "\n");
            reject(new Error(errorMsg));
            return;
          }

          setTimeout(attempt, RECONNECT_DELAY_MS);
        });
      };

      attempt();
    });
  }

  private setupSocketListeners(): void {
    if (!this.socket) return;

    this.socket.on("data", (data) => {
      this.socketBuffer += data.toString();

      let newlineIndex: number;
      while ((newlineIndex = this.socketBuffer.indexOf("\n")) !== -1) {
        const messageStr = this.socketBuffer.slice(0, newlineIndex);
        this.socketBuffer = this.socketBuffer.slice(newlineIndex + 1);

        if (!messageStr.trim()) continue;

        try {
          const ipcResponse = JSON.parse(messageStr);
          this.handleIpcResponse(ipcResponse);
        } catch {
          process.stderr.write(
            `Failed to parse IPC response: ${messageStr}\n`,
          );
        }
      }
    });

    this.socket.on("close", () => {
      this.connected = false;
      // Reject all pending requests
      for (const [id, pending] of this.pendingRequests) {
        pending.reject(new Error("IPC connection closed"));
        this.pendingRequests.delete(id);
      }
    });

    this.socket.on("error", (err) => {
      process.stderr.write(`IPC socket error: ${err.message}\n`);
    });
  }

  private handleIpcResponse(ipcResponse: {
    id: string | number;
    result?: unknown;
    error?: { code: number; message: string; data?: unknown };
  }): void {
    const pending = this.pendingRequests.get(String(ipcResponse.id));
    if (!pending) {
      // This might be a notification or unknown response
      return;
    }

    this.pendingRequests.delete(String(ipcResponse.id));

    if (ipcResponse.error) {
      // Build JSON-RPC error response
      const errorResponse: JsonRpcMessage = {
        jsonrpc: "2.0",
        id: ipcResponse.id,
        error: ipcResponse.error,
      };
      this.writeStdout(errorResponse);
    } else {
      // Build JSON-RPC success response
      const successResponse: JsonRpcMessage = {
        jsonrpc: "2.0",
        id: ipcResponse.id,
        result: ipcResponse.result,
      };
      this.writeStdout(successResponse);
    }
  }

  private listenStdin(): void {
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk: string) => {
      this.stdinBuffer += chunk;

      let newlineIndex: number;
      while ((newlineIndex = this.stdinBuffer.indexOf("\n")) !== -1) {
        const messageStr = this.stdinBuffer.slice(0, newlineIndex);
        this.stdinBuffer = this.stdinBuffer.slice(newlineIndex + 1);

        if (!messageStr.trim()) continue;

        try {
          const jsonRpc: JsonRpcMessage = JSON.parse(messageStr);
          this.handleJsonRpcRequest(jsonRpc);
        } catch {
          const errorResponse: JsonRpcMessage = {
            jsonrpc: "2.0",
            id: undefined,
            error: { code: -32700, message: "Parse error" },
          };
          this.writeStdout(errorResponse);
        }
      }
    });

    process.stdin.on("end", () => {
      this.shutdown();
    });
  }

  private handleJsonRpcRequest(message: JsonRpcMessage): void {
    if (!this.connected || !this.socket) {
      if (message.id !== undefined) {
        const errorResponse: JsonRpcMessage = {
          jsonrpc: "2.0",
          id: message.id,
          error: {
            code: -32603,
            message: "Extension host not connected",
          },
        };
        this.writeStdout(errorResponse);
      }
      return;
    }

    // Forward to extension host via IPC.
    // IMPORTANT: preserve the original id type (number or string).
    // Converting to String here causes a type mismatch: the MCP client
    // sends id:1 (number) and expects id:1 back, but if we stringify it
    // the response arrives as id:"1" and the client silently drops it,
    // resulting in tools never appearing in the agent.
    const rawId = message.id ?? `notif-${Date.now()}`;
    const ipcRequest = {
      id: rawId,
      method: message.method,
      params: message.params,
    };

    if (message.id !== undefined) {
      this.pendingRequests.set(String(rawId), {
        resolve: () => {},
        reject: (err) => {
          const errorResponse: JsonRpcMessage = {
            jsonrpc: "2.0",
            id: message.id,
            error: {
              code: -32603,
              message: err instanceof Error ? err.message : String(err),
            },
          };
          this.writeStdout(errorResponse);
        },
      });
    }

    this.socket.write(JSON.stringify(ipcRequest) + "\n");
  }

  private writeStdout(message: JsonRpcMessage): void {
    process.stdout.write(JSON.stringify(message) + "\n");
  }

  private shutdown(): void {
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
    process.exit(0);
  }
}

// Start the bridge
const bridge = new StdioToIpcBridge();
bridge.start().catch((err) => {
  process.stderr.write(`Fatal: ${err.message}\n`);
  process.exit(1);
});
