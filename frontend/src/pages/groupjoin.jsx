import { useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { apiFetch } from "../config";
import { useAuth } from "../auth-context";

function GroupJoin() {
  const { token } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, ready } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function joinGroup() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await apiFetch(`/api/group-invites/${encodeURIComponent(token)}/join`, { method: "POST" });
      const result = await response.json();
      if (!response.ok || !result.group_id) throw new Error(result.error || "Unable to join this group.");
      navigate(`/group/${result.group_id}`, { replace: true, state: { joinedFromInvite: !result.already_member } });
    } catch (joinError) {
      setError(joinError.message || "Unable to join this group. Try again.");
      setBusy(false);
    }
  }

  if (!ready) return <main className="phone-app auth-loading" role="status">Checking your sign-in…</main>;

  return <main className="phone-app join-invite-page">
    <Link className="screen-back" to="/personal" aria-label="Back home">‹</Link>
    <section className="join-invite-card">
      <span className="join-invite-mark" aria-hidden="true">♧</span>
      <p className="auth-eyebrow">You’re invited</p>
      <h1>Join this group</h1>
      <p>Join your friends on SmartSplit to see shared expenses and keep track together.</p>
      {error && <p className="auth-error" role="alert">{error}</p>}
      {user ? <button className="auth-submit" type="button" onClick={joinGroup} disabled={busy}>{busy ? "Joining group…" : "Join group →"}</button> : <div className="join-auth-actions">
        <Link className="auth-submit join-auth-link" to="/signup" state={{ from: location }}>Create account to join →</Link>
        <p className="auth-switch">Already have an account? <Link to="/login" state={{ from: location }}>Sign in</Link></p>
      </div>}
    </section>
  </main>;
}

export default GroupJoin;
