export const dynamic = "force-dynamic";
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const p = await searchParams;
  return (
    <div className="authcard">
      <h1>Dayweave</h1>
      <p>Sign in to your private planner.</p>
      {p.notice === "sign-in-failed" && (
        <p role="alert">
          Sign-in or registration failed. Check your email, password and
          invitation. If you tried repeatedly, wait 15 minutes.
        </p>
      )}
      {p.notice === "account-deleted" && (
        <p role="status">Your account and live planner were deleted.</p>
      )}
      <form method="post" action="/auth/login">
        <input type="hidden" name="return_to" value={p.return_to || "/"} />
        <label>
          Email
          <input name="email" type="email" autoComplete="email" required />
        </label>
        <label>
          Password
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            minLength={12}
            maxLength={256}
            required
          />
        </label>
        <button className="primary">Sign in</button>
      </form>
      <details>
        <summary>Create an account with an invitation</summary>
        <form method="post" action="/auth/signup">
          <label>
            Email
            <input name="email" type="email" required />
          </label>
          <label>
            Password (12+ characters)
            <input
              name="password"
              type="password"
              minLength={12}
              maxLength={256}
              required
            />
          </label>
          <label>
            Invitation code
            <input name="invite" type="password" required />
          </label>
          <button className="primary">Create account</button>
        </form>
      </details>
      <p>
        Browser reminders need an open, executing page. They are not reliable
        background phone alarms.
      </p>
      <p>
        <a href="/privacy">Privacy and data</a>
      </p>
    </div>
  );
}
