# VSCode Extension as MCP Server

## Native Support (VSCode 1.99+)
- Extensions can serve as MCP servers
- Auto-discovery by Claude Code / Copilot without additional configuration
- Communication via **stdio** by default

## Declaration in package.json
```jsonc
{
  "contributes": {
    "mcpServers": {
      "server-name": {
        "type": "stdio",
        "command": "node",
        "args": ["${extensionPath}/dist/mcp-entry.js"]
      }
    }
  }
}
```

## Key Architectural Problem
`contributes.mcpServers` launches a **child process** separate from the extension host.
The VSCode Terminal API (`vscode.window.createTerminal`, Shell Integration) is only
available **within the extension host process**.

## Solution: IPC Bridge
```
[Claude Code] --stdio--> [mcp-entry.js (shim)] --IPC--> [Extension Host (Terminal API)]
```

- `mcp-entry.js`: Thin stdio-to-IPC bridge. Reads JSON-RPC from stdin, forwards via Unix socket.
- `extension.ts`: In activate(), creates IPC server (Unix domain socket), instantiates MCP Server with handlers, processes forwarded requests.

## Workspace Configuration
`.vscode/mcp.json` or `settings.json` file for per-team configuration.

## Existing MCP Servers in the Environment
1. **desktop-commander** (v0.2.38) - Command execution, files
2. **playwright-mcp** - Browser automation
3. **context7** - Contextual documentation
4. **chrome-devtools-mcp** (v0.20.2) - DevTools
