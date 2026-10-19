# Test the full app on GitHub Codespaces

GitHub Pages cannot execute the Node server, SQLite storage or OAuth/MCP endpoints. Use Codespaces for a temporary full-app test. Codespaces usage may incur charges beyond your included quota; review GitHub billing. It is not permanent production hosting and stops when idle.

1. Open https://github.com/amoghyadav81-collab/Dayweave and choose **Code → Codespaces → Create codespace on main**. You must be signed into GitHub and allowed to create Codespaces.
2. Wait for the included devcontainer setup. It installs Node 24 dependencies and creates a private `.env.local` with the Codespace's HTTPS origin, a local SQLite path and a random invitation. Existing `.env.local` is never overwritten.
3. Run `npm run dev` in the Codespace terminal. Keep it running.
4. In the **Ports** tab, find port **3000**, right-click and choose **Port visibility → Public**. Copy its forwarded HTTPS address. The devcontainer does not bypass organization policies or automatically expose a port. If public forwarding is prohibited, external ChatGPT connection cannot be tested through that Codespace.
5. Open the forwarded address. Privately open `.env.local` in the editor, retrieve SIGNUP_INVITE_CODE, then create your Dayweave account. Do not paste the code into chat or commit the file. Use disposable test records and unique test passwords.
6. In ChatGPT, create an OAuth custom app as described in START-HERE.md, with the forwarded address plus `/mcp`. Both ChatGPT accounts use this same endpoint. Separate Dayweave logins provide separate planners; the same login shares one planner. Check the identity shown at consent.
7. Verify a read, an approved write, isolation and revocation. Public visibility allows access to the login and OAuth endpoints; private planner routes still require authentication. Do not disable authentication for testing.
8. Stop the Codespace when finished. Its SQLite data remains in that Codespace's workspace across stops, but deleting/rebuilding the workspace can lose data. Export backups before deleting it. Do not use this test instance for important records or unattended reminders.

If a different Codespace is created, its public URL changes. Update APP_URL in its private `.env.local`, restart the app and recreate the ChatGPT connection. Do not copy an old environment file without reviewing the origin. Existing Codespaces can be resumed at https://github.com/codespaces.

The setup generator was locally checked. Actual Codespace provisioning, public forwarding, account billing and real ChatGPT connection remain unverified until performed in your account. Browser reminders are not reliable background phone alarms.
