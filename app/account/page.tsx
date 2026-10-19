import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { sessionUser } from "@/lib/security.mjs";
import { getDatabase } from "@/lib/database.mjs";
export const dynamic = "force-dynamic";
export default async function Account({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const { notice } = await searchParams;
  const u = sessionUser(await headers());
  if (!u) redirect("/login");
  const grants = getDatabase()
    .prepare(
      "SELECT grants.id,clients.name FROM grants JOIN clients ON clients.id=grants.client_id WHERE user_id=? AND revoked=0",
    )
    .all(u.id);
  return (
    <div className="authcard">
      <h1>Your account</h1>
      <p>{String(u.email)}</p>
      {notice === "password-changed" && (
        <p role="status">
          Password changed. Other sessions and all AI connections were signed
          out. Reconnect your AI client.
        </p>
      )}
      {notice === "action-failed" && (
        <p role="alert">
          The action failed. Check your current password and confirmation. If
          you tried repeatedly, wait 15 minutes.
        </p>
      )}
      <a href="/">Back to planner</a>
      <h2>Connected clients</h2>
      {grants.map((g) => (
        <form key={String(g.id)} method="post" action="/auth/revoke">
          <input type="hidden" name="grant" value={String(g.id)} />
          <p>{String(g.name)}</p>
          <button className="primary">Revoke access</button>
        </form>
      ))}
      {!grants.length && <p>No AI clients are connected yet.</p>}
      <h2>Change password</h2>
      <form method="post" action="/auth/password">
        <label>
          Current password
          <input
            name="current_password"
            type="password"
            autoComplete="current-password"
            maxLength={256}
            required
          />
        </label>
        <label>
          New password
          <input
            name="new_password"
            type="password"
            autoComplete="new-password"
            minLength={12}
            maxLength={256}
            required
          />
        </label>
        <p>
          Changing your password signs out other sessions and revokes AI
          connections.
        </p>
        <button className="primary">Change password</button>
      </form>
      <details>
        <summary>Delete my account and planner</summary>
        <p>
          Export a JSON backup in Data &amp; backup settings first. This
          permanently removes your live planner, history, account and AI
          authorizations. Operator backups expire according to the hosting
          operator’s retention policy.
        </p>
        <form method="post" action="/auth/delete">
          <label>
            Password
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              maxLength={256}
              required
            />
          </label>
          <label>
            Type DELETE to confirm
            <input
              name="confirmation"
              autoComplete="off"
              pattern="DELETE"
              required
            />
          </label>
          <button className="secondary">Permanently delete my account</button>
        </form>
      </details>
      <p>
        <a href="/privacy">Privacy and data</a>
      </p>
      <form method="post" action="/auth/logout">
        <button className="secondary">Sign out</button>
      </form>
    </div>
  );
}
