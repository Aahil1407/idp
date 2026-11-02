import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch, getDeviceName } from "./config";
import { AuthContext } from "./auth-context";

async function readResponse(response, fallback) {
  let body = {};
  try { body = await response.json(); } catch { /* use the contextual fallback */ }
  if (!response.ok) throw new Error(body.error || fallback);
  return body;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const response = await apiFetch("/api/auth/me");
      const data = await readResponse(response, "Unable to verify your sign-in.");
      setUser(data.user);
      return data.user;
    } catch {
      setUser(null);
      return null;
    } finally {
      setReady(true);
    }
  }, []);

  // oxlint-disable-next-line react/set-state-in-effect
  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    const handleUnauthorized = () => { setUser(null); setReady(true); };
    window.addEventListener("smartsplit:unauthorized", handleUnauthorized);
    return () => window.removeEventListener("smartsplit:unauthorized", handleUnauthorized);
  }, []);

  const signIn = useCallback(async (email, password) => {
    const response = await apiFetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, device_name: getDeviceName() }),
    });
    await readResponse(response, "Unable to sign in.");
    return refresh();
  }, [refresh]);

  const signUp = useCallback(async ({ name, email, password }) => {
    const response = await apiFetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password, device_name: getDeviceName() }),
    });
    await readResponse(response, "Unable to create your profile.");
    return refresh();
  }, [refresh]);

  const signOut = useCallback(async () => {
    const response = await apiFetch("/api/auth/logout", { method: "POST" });
    await readResponse(response, "Unable to sign out.");
    setUser(null);
  }, []);

  const signOutAll = useCallback(async () => {
    const response = await apiFetch("/api/auth/logout-all", { method: "POST" });
    await readResponse(response, "Unable to sign out devices.");
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, ready, signIn, signUp, signOut, signOutAll, refresh }), [user, ready, signIn, signUp, signOut, signOutAll, refresh]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
