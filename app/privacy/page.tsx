export default function Privacy() {
  return (
    <div className="authcard">
      <h1>Your data in Dayweave</h1>
      <p>
        Dayweave stores your account email, a salted password hash, planner
        activities, routine preferences, life brief and undo history on the
        operator’s server. Session and OAuth token values are stored as hashes.
        Data is protected by authenticated per-user access, but it is not
        end-to-end encrypted; the hosting operator controls the database and
        backups.
      </p>
      <p>
        Connecting an AI client requires your consent and lets that client read
        and update your planner and life brief. Its provider’s own privacy terms
        apply to information you share with it. You can revoke access in Account
        at any time.
      </p>
      <p>
        There are no advertising or analytics integrations. An optional device
        snapshot uses unencrypted browser storage; clear site storage on shared
        devices. Browser notifications are optional and are not reliable
        background phone alarms.
      </p>
      <p>
        Export your planner from Data &amp; backup settings. You can change your
        password or delete your live account and planner in Account. Server
        backups can retain older records until the operator’s configured
        retention period expires. The operator must disclose its actual
        identity, contact details and backup retention before opening
        registration broadly.
      </p>
      <p>
        Email is not verified and no email reset service is configured. If you
        lose access, contact the operator through the channel where you received
        your invitation. This release is intended for invited users, not
        unrestricted public registration.
      </p>
      <a href="/account">Account settings</a> · <a href="/">Planner</a>
    </div>
  );
}
