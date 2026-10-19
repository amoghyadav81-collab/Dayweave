# Technical integration references

Primary source material consulted for this release:

- MCP 2025-11-25 authorization specification, official project source: https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/specification/2025-11-25/basic/authorization.mdx — protected-resource discovery, authorization metadata, PKCE, scope/resource binding and client onboarding. Retrieved from the official raw GitHub source in this workspace.
- MCP 2025-11-25 transports, official source: https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/specification/2025-11-25/basic/transports.mdx — stateless Streamable HTTP POST/JSON responses, authentication challenge and Origin checks. Retrieved.
- Maintained node-oauth server: https://github.com/node-oauth/node-oauth2-server and its official README; the locked 5.3.1 package's documented server/model adapters and authorization-code/refresh handlers were inspected. The library processes authorize, S256 PKCE/token exchange, bearer expiry/scope and refresh rotation. Application adapters retain exact trusted redirects, fixed `/mcp` resource binding, account consent and hashed SQLite storage.
- Temporal official timezone/ambiguity documentation: https://github.com/tc39/proposal-temporal/blob/main/docs/timezone.md — explicit gap/fold policies and elapsed-versus-wall-clock arithmetic. Retrieved. Implementation uses maintained `@js-temporal/polyfill` 0.5.1.
- OAuth standards referenced by MCP/library: RFC 6749, RFC 6750, RFC 7636, RFC 8414, RFC 7591, RFC 7009, RFC 8707 and RFC 9728 (official RFC Editor/Datatracker publications). No custom cryptographic primitive is implemented; password KDF, hashing, random tokens and constant-time comparison continue to use standard maintained Node crypto APIs.
- ChatGPT Tasks product reference: https://help.openai.com/en/articles/10291617-tasks-in-chatgpt. Direct retrieval was blocked by workspace egress policy, and no real account/Tasks session was available. No unsupported claim about unattended custom-MCP access is inferred from that. See RECURRING-WORKFLOW.md for the exact unverified gate.

Actual ChatGPT/Render UI availability and live acceptance are deliberately distinguished from local protocol and transport tests.
