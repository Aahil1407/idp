import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth-context";

function AuthPage({ signup = false }) {
  const navigate = useNavigate();
  const { signIn, signUp } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (signup) await signUp({ name, email, password });
      else await signIn(email, password);
      navigate("/personal", { replace: true });
    } catch (requestError) {
      setError(requestError.message || "Unable to continue. Check the connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return <main className="phone-app auth-page">
    <Link className="screen-back" to="/" aria-label="Back">‹</Link>
    <div className="auth-mark" aria-hidden="true">✦</div>
    <p className="auth-eyebrow">SmartSplit · your account</p>
    <h1>{signup ? "Create your profile" : "Welcome back"}</h1>
    <p className="auth-description">{signup ? "Create an account to keep your groups and activity with you." : "Sign in to see your groups and shared expenses."}</p>
    <form className="auth-form" onSubmit={submit}>
      {signup && <label htmlFor="account-name">Name<input id="account-name" autoComplete="name" maxLength={255} required value={name} onChange={(event) => setName(event.target.value)} placeholder="Your name" /></label>}
      <label htmlFor="account-email">Email<input id="account-email" type="email" autoComplete="email" maxLength={320} required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" /></label>
      <label htmlFor="account-password">Password<input id="account-password" type="password" autoComplete={signup ? "new-password" : "current-password"} minLength={signup ? 12 : undefined} maxLength={256} required value={password} onChange={(event) => setPassword(event.target.value)} placeholder={signup ? "At least 12 characters" : "Your password"} /></label>
      {error && <p className="auth-error" role="alert">{error}</p>}
      <button className="auth-submit" type="submit" disabled={busy}>{busy ? "Please wait…" : signup ? "Create account →" : "Sign in →"}</button>
    </form>
    <p className="auth-switch">{signup ? "Already have an account?" : "New to SmartSplit?"} <Link to={signup ? "/login" : "/signup"}>{signup ? "Sign in" : "Create a profile"}</Link></p>
    {signup && <p className="auth-device-note">This browser will be added as a signed-in device. You can review and sign out devices in your profile.</p>}
  </main>;
}

export function LoginPage() { return <AuthPage />; }
export function SignupPage() { return <AuthPage signup />; }
