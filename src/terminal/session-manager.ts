import * as vscode from "vscode";
import { TerminalSession } from "./session.js";
import type {
  TerminalSessionConfig,
  TerminalSessionInfo,
  SecurityConfig,
} from "../types/index.js";
import { log, logError } from "../utils/logger.js";

export class SessionManager {
  private sessions = new Map<string, TerminalSession>();
  private onSessionsChangedEmitter = new vscode.EventEmitter<void>();
  readonly onSessionsChanged = this.onSessionsChangedEmitter.event;
  private idleReaperInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // Start idle session reaper
    this.startIdleReaper();

    // Listen for terminals being closed externally
    vscode.window.onDidCloseTerminal((terminal) => {
      for (const [id, session] of this.sessions) {
        if (session.getTerminal() === terminal) {
          log(`Terminal closed externally for session ${id}`);
          session.dispose();
          this.sessions.delete(id);
          this.onSessionsChangedEmitter.fire();
          break;
        }
      }
    });
  }

  private getConfig(): SecurityConfig {
    const config = vscode.workspace.getConfiguration("terminalMcp");
    return {
      blockedCommands: config.get<string[]>("blockedCommands", [
        "rm -rf /",
        "mkfs",
        "dd if=",
        ":(){ :|:& };:",
      ]),
      allowedDirectories: config.get<string[]>("allowedDirectories", []),
      defaultTimeoutMs: config.get<number>("defaultTimeoutMs", 30000),
      maxConcurrentSessions: config.get<number>("maxConcurrentSessions", 10),
      maxOutputLines: config.get<number>("maxOutputLines", 10000),
      idleTimeoutMs: config.get<number>("idleTimeoutMs", 300000),
    };
  }

  private startIdleReaper(): void {
    // Check every 60 seconds for idle sessions
    this.idleReaperInterval = setInterval(() => {
      const config = this.getConfig();
      if (config.idleTimeoutMs <= 0) return;

      for (const [id, session] of this.sessions) {
        if (session.isIdle(config.idleTimeoutMs)) {
          log(`Reaping idle session ${id}`);
          session.dispose();
          this.sessions.delete(id);
          this.onSessionsChangedEmitter.fire();
        }
      }
    }, 60000);
  }

  /**
   * Create a new terminal session.
   */
  createSession(config: TerminalSessionConfig): TerminalSessionInfo {
    const secConfig = this.getConfig();

    // Check concurrent session limit
    if (this.sessions.size >= secConfig.maxConcurrentSessions) {
      throw new Error(
        `Maximum concurrent sessions (${secConfig.maxConcurrentSessions}) reached. Close existing sessions first.`,
      );
    }

    // Validate working directory
    if (config.cwd && secConfig.allowedDirectories.length > 0) {
      const path = require("path");
      const resolvedCwd = path.resolve(config.cwd);
      const isAllowed = secConfig.allowedDirectories.some((dir) =>
        resolvedCwd.startsWith(path.resolve(dir)),
      );
      if (!isAllowed) {
        throw new Error(
          `Working directory "${config.cwd}" is not in the allowed directories list.`,
        );
      }
    }

    const session = new TerminalSession(config, secConfig.maxOutputLines);
    this.sessions.set(session.sessionId, session);
    this.onSessionsChangedEmitter.fire();

    return session.getInfo();
  }

  /**
   * Get a session by ID.
   */
  getSession(sessionId: string): TerminalSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * List all active sessions, optionally filtered by agentId.
   */
  listSessions(agentId?: string): TerminalSessionInfo[] {
    const sessions: TerminalSessionInfo[] = [];
    for (const session of this.sessions.values()) {
      const info = session.getInfo();
      if (agentId === undefined || info.agentId === agentId) {
        sessions.push(info);
      }
    }
    return sessions;
  }

  /**
   * Close and remove a session.
   */
  closeSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    session.dispose();
    this.sessions.delete(sessionId);
    this.onSessionsChangedEmitter.fire();
    return true;
  }

  /**
   * Validate a command against the security blocklist.
   */
  validateCommand(command: string): { valid: boolean; reason?: string } {
    const config = this.getConfig();

    for (const blocked of config.blockedCommands) {
      if (command.includes(blocked)) {
        return {
          valid: false,
          reason: `Command contains blocked pattern: "${blocked}"`,
        };
      }
    }

    return { valid: true };
  }

  /**
   * Get default timeout from config.
   */
  getDefaultTimeout(): number {
    return this.getConfig().defaultTimeoutMs;
  }

  /**
   * Get the number of active sessions.
   */
  getActiveSessionCount(): number {
    return this.sessions.size;
  }

  /**
   * Find a session by its VSCode terminal instance.
   */
  findByTerminal(terminal: vscode.Terminal): TerminalSession | undefined {
    for (const session of this.sessions.values()) {
      if (session.getTerminal() === terminal) {
        return session;
      }
    }
    return undefined;
  }

  /**
   * Dispose all sessions and cleanup.
   */
  dispose(): void {
    if (this.idleReaperInterval) {
      clearInterval(this.idleReaperInterval);
      this.idleReaperInterval = null;
    }

    for (const [id, session] of this.sessions) {
      session.dispose();
    }
    this.sessions.clear();
    this.onSessionsChangedEmitter.dispose();

    log("SessionManager disposed");
  }
}
