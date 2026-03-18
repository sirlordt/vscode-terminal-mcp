# MCP SDK - Patterns and Architecture

## Base Protocol
- JSON-RPC 2.0 as message format
- 3-component architecture: **Server** (exposes capabilities), **Client** (consumes), **Host** (manages communication - Claude Desktop, VSCode)

## Package @modelcontextprotocol/sdk
- Core: `@modelcontextprotocol/server` and `@modelcontextprotocol/client`
- Transports: `@modelcontextprotocol/node` (HTTP), Express, Hono
- Requires `zod` as peer dependency for schema validation
- Setup with ES Modules (`"type": "module"`)

## 3 Protocol Primitives
1. **Tools** - Executable functions the LLM can invoke with structured parameters
2. **Resources** - Data sources (databases, APIs, filesystem)
3. **Prompts** - Predefined templates for interactions

## Request Structure (JSON-RPC 2.0)
```json
{
  "jsonrpc": "2.0",
  "id": "<unique-id>",
  "method": "tools/call",
  "params": {
    "name": "<tool-name>",
    "arguments": {}
  }
}
```

## Tool Definition
Each tool requires:
- `name` - Unique identifier
- `title` - Human-readable name
- `description` - Functionality explanation
- `inputSchema` - JSON Schema (defined with Zod)
- Handler function - Executes logic and returns results

## Supported Transports

### stdio (Standard I/O)
- Ideal for local servers
- Communication via process stdin/stdout
- Auto-discovery in VSCode extensions

### SSE (Server-Sent Events over HTTP)
- POST for client->server
- Supports streaming
- Standard HTTP authentication (bearer tokens, API keys, OAuth)

## Connection Lifecycle
1. **Initialization** - Capability exchange and version negotiation
2. **Operation** - Normal tool execution and resource access
3. **Termination** - Orderly connection shutdown
