# vscode-terminal-mcp

[![npm version](https://img.shields.io/npm/v/vscode-terminal-mcp.svg)](https://npmjs.org/package/vscode-terminal-mcp)

MCP server that executes commands in **visible VSCode terminal tabs** with full output capture. Unlike inline execution, every command runs in a real terminal you can see, scroll, and interact with.

## Key Features

- **Visible Terminals**: Commands run in real VSCode terminal tabs, not hidden processes. You see everything in real time.
- **Session Reuse**: The `run` tool automatically reuses idle sessions, creating new terminals only when needed.
- **Long-Running Support**: Fire-and-forget execution with `waitForCompletion: false`, then poll output incrementally with `read`.
- **Subagent Isolation**: Tag sessions with `agentId` to keep parallel agent workloads separated.

## Requirements

- VS Code 1.93+ (for Shell Integration API)
- Node.js 20+

## Getting Started

### Claude Code

```bash
claude mcp add BashTerm -- npx vscode-terminal-mcp@latest
```

### VS Code / Copilot

Add to your `.vscode/mcp.json`:

```json
{
  "servers": {
    "BashTerm": {
      "type": "stdio",
      "command": "npx",
      "args": ["vscode-terminal-mcp@latest"]
    }
  }
}
```

<details>
<summary>Cursor</summary>

Add to your `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "BashTerm": {
      "command": "npx",
      "args": ["-y", "vscode-terminal-mcp@latest"]
    }
  }
}
```

</details>

<details>
<summary>Claude Desktop</summary>

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "BashTerm": {
      "command": "npx",
      "args": ["-y", "vscode-terminal-mcp@latest"]
    }
  }
}
```

</details>

### Your First Prompt

After installation, try asking:

> Run `ls -la` in the terminal

You should see a new terminal tab open in VSCode with the command output.

## Tools

### Quick Execution

| Tool | Description |
|------|-------------|
| `run` | Create (or reuse) a terminal and execute a command in one step. Returns clean output with exit code. |

### Session Management

| Tool | Description |
|------|-------------|
| `create` | Create a new visible terminal session. Returns a `sessionId`. |
| `exec` | Execute a command in an existing session and capture output. |
| `read` | Read output from a session with pagination. Supports incremental reads and tail mode (`offset: -N`). |
| `input` | Send text to an interactive terminal (prompts, REPLs, confirmations). |
| `list` | List active sessions. Optionally filter by `agentId`. |
| `close` | Close a terminal session and its VSCode tab. |

## Usage Patterns

### Simple Command

The `run` tool handles everything — creates a terminal if needed, executes, and returns clean output:

```
> Run npm test
```

```
$ npm test
PASS src/utils.test.ts (3 tests)
PASS src/index.test.ts (5 tests)

[exit: 0 | 1243ms | session-abc123]
```

### Long-Running Process

For builds, deployments, or any command that takes a while:

```
> Start `npm run build` without waiting, then check progress
```

The agent will:
1. Call `run` with `waitForCompletion: false` — returns immediately
2. Call `read` with `offset: -10` to check the last 10 lines
3. Repeat until the process completes

### Interactive Commands

For commands that need user input:

```
> Run npm init and answer the prompts
```

The agent will:
1. Call `run` with `npm init`
2. Call `read` to see the prompt
3. Call `input` to send the answer

### Parallel Agents

Subagents can work in isolated terminals using `agentId`:

```
> Have one agent run tests while another runs the linter
```

Each subagent gets its own terminal tagged with its `agentId`, preventing output from mixing.

## Configuration

The extension reads configuration from VSCode settings under `terminalMcp.*`:

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `terminalMcp.maxSessions` | number | 10 | Maximum concurrent terminal sessions |
| `terminalMcp.commandTimeout` | number | 30000 | Default command timeout in ms |
| `terminalMcp.maxOutputLines` | number | 5000 | Max lines kept in output buffer per session |
| `terminalMcp.idleTimeout` | number | 1800000 | Close idle sessions after this many ms (0 = disabled) |
| `terminalMcp.blockedCommands` | string[] | `["rm -rf /"]` | Commands that will be rejected |

## Recommended: Set as Preferred Tool

LLM agents like Claude Code have a built-in `Bash` tool that executes commands inline within the chat. The output is embedded in the conversation and hard to read, especially for commands with verbose output. **We recommend telling the agent to prefer this MCP over its built-in Bash tool.**

Add the following to your project's `CLAUDE.md` (or equivalent instructions file):

```markdown
## Terminal Execution

Prefer the BashTerm MCP tools (`run`, `exec`, `read`, etc.) over the built-in Bash tool for executing commands.
BashTerm runs commands in visible VSCode terminal tabs where the user can see output in real time.
Only fall back to the built-in Bash tool for simple, non-interactive operations like reading environment variables.

For commands that may take longer than 30 seconds or produce large amounts of output (builds, test suites,
deployments, installs), use the pull mode pattern:
1. Call `run` with `waitForCompletion: false` to launch the command without blocking.
2. Call `read` with `offset: -10` to check the last 10 lines of output.
3. Repeat step 2 until you see the command has finished (look for exit messages, prompts, or "Done").
4. Report the final result to the user.

This prevents conversation timeouts and lets the user watch progress in the terminal in real time.
```

**Why this matters:**

| | Built-in Bash | BashTerm MCP |
|---|---|---|
| Output visibility | Embedded in chat, hard to scroll | Visible in VSCode terminal tab |
| Real-time feedback | User sees nothing until command finishes | User watches output live |
| Long-running commands | Blocks the conversation until timeout | Fire-and-forget + polling |
| Session state | Each command is isolated | Persistent sessions with history |
| Interactive commands | Not supported | Send input to prompts/REPLs |

## How It Works

1. The **VSCode extension** activates and starts an IPC server on a Unix socket
2. The **MCP entry point** (`mcp-entry.js`) is spawned by the MCP client and bridges JSON-RPC stdio with the IPC socket
3. Commands execute in real VSCode terminals using the **Shell Integration API** for reliable output capture and exit code detection
4. Output is stored in circular buffers with pagination support for efficient reading

## License

MIT
