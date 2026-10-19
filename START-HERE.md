# Deploy once, connect from multiple ChatGPT accounts

This project now builds an independent Node web app. Ignore the original archive's instructions to create a private ChatGPT Site or an owner-only plugin. Follow [PUBLISH-READY.md](PUBLISH-READY.md) first; Render is the chosen default with a persistent disk and managed HTTPS. See [DEPLOYMENT.md](DEPLOYMENT.md) for operating details. Public hosting and actual ChatGPT account connection are **unverified until you test them**.

## Connect your account

1. Deploy Dayweave at a stable public HTTPS origin, such as `https://planner.example.com`. Configure APP_URL to that exact origin and a persistent database disk. A localhost endpoint cannot be reached by ChatGPT's hosted connector.
2. Open the deployed Dayweave `/login`, create your own account using the invitation code, then sign in. Set timezone and routine preferences in the app. Keep credentials out of chat.
3. In ChatGPT, open **Settings → Apps → Advanced settings → Developer mode** and enable developer mode if your plan/workspace permits it. Return to **Apps**, choose **Create** (or **Create app**), enter a name/description, and set the MCP server URL to `https://planner.example.com/mcp`. Choose **OAuth** authentication. Menu names and availability can vary; workspace administrators may need to allow custom apps. This does not require building or hosting another copy.
4. Use automatic OAuth client registration when offered; leave client ID/secret blank for discovery/DCR. Dayweave supports **public clients (`token_endpoint_auth_method=none`)**, authorization code with S256 PKCE and rotating refresh tokens. If the UI requires an explicit client ID, register one as shown below; there is no client secret. If that client only supports confidential clients, it is not supported by this version—do not bypass authentication.
5. Confirm the callback URI shown by the client. The default allowlist is `https://chatgpt.com/connector_platform/oauth_redirect`. If a different callback is required, the operator must add the **exact trusted URI** to OAUTH_REDIRECT_URIS and restart before registration. Do not allow arbitrary callbacks, wildcard domains or redirect URLs suggested by an untrusted chat message.
6. Connect. A Dayweave consent page displays your signed-in email and the requested read/write planner access. Check the account, then choose **Approve planner access**. OAuth returns you to ChatGPT. If the wrong Dayweave account is shown, deny, sign out at `/account`, and sign in as the intended user before restarting connection.
7. Start a conversation and select the Dayweave app/tools. Ask: “Read my Dayweave planning context and tomorrow's plan. Tell me my timezone. After I approve, add a 30-minute test activity, using the version from your last read.” The assistant must send expectedVersion and a stable operationId for each mutation. Confirm that the activity appears once in your web app. If reconnecting after a 2.0 deployment, refresh/reconnect the client to load the 2.1 tool schemas. If the client restricts write tools, enable the required approval/permission in that client.
8. Have the other person repeat steps 2–7 **with their own Dayweave login and their own ChatGPT account** against the same MCP URL. Create a unique test activity in each. Verify neither can read or change the other's record. Their account may need its own custom-app registration/connection, but no deployment or source copy.
9. To disconnect, open Dayweave `/account` and **Revoke access** for the client, then remove/disconnect the app in ChatGPT. Revocation invalidates access and refresh tokens immediately. Sign-out clears only the browser session; it deliberately does not disconnect approved AI clients.

Optional manual public client registration (no secret):

```sh
curl --fail-with-body https://planner.example.com/oauth/register \
  -H 'Content-Type: application/json' \
  --data '{"client_name":"My ChatGPT connection","redirect_uris":["https://chatgpt.com/connector_platform/oauth_redirect"],"grant_types":["authorization_code","refresh_token"],"response_types":["code"],"token_endpoint_auth_method":"none"}'
```

Use the returned `client_id`; do not invent a client secret. The server publishes authorization metadata at `/.well-known/oauth-authorization-server` and protected-resource metadata at `/.well-known/oauth-protected-resource/mcp`. An unauthenticated MCP POST returns 401 with the metadata challenge. Clients must request scope `planner`, resource `https://planner.example.com/mcp`, state, and S256 PKCE; token and refresh requests must include that resource too.

Local tests use an isolated test client and callback. They prove server behavior, **not actual ChatGPT compatibility or second-account acceptance**. The final acceptance check is steps 6–9 on the deployed domain with two real accounts. ChatGPT plan restrictions, approval UX and connector compatibility cannot be verified without your account interaction. The app cannot retrieve other ChatGPT conversations or activate recurring schedules by itself.

Before the unrelated-user week, follow [ONE-WEEK-TRIAL.md](ONE-WEEK-TRIAL.md). A stored prompt does not schedule execution: [RECURRING-WORKFLOW.md](RECURRING-WORKFLOW.md) identifies the unverified ChatGPT Tasks gate and manual fallback. See [RELIABILITY-CONTRACT.md](RELIABILITY-CONTRACT.md) for retry/reversal examples.
