import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../config";
import { useAuth } from "../auth-context";

const money = (value) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(Number(value) || 0);

function useWorkspace() {
  const { user } = useAuth();
  const [state, setState] = useState({ groups: [], expenses: [], loading: true, error: "" });
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const groupResponse = await apiFetch("/api/groups");
        if (!groupResponse.ok) throw new Error("Unable to load your groups. Check the backend connection.");
        const groups = await groupResponse.json();
        const detailRows = await Promise.all(groups.map(async (group) => {
          const [membersResponse, expensesResponse, balancesResponse] = await Promise.all([
            apiFetch(`/api/groups/${group.group_id}/members`),
            apiFetch(`/api/groups/${group.group_id}/expenses`),
            apiFetch(`/api/groups/${group.group_id}/balances`),
          ]);
          if (!membersResponse.ok || !expensesResponse.ok || !balancesResponse.ok) throw new Error("Unable to load group activity.");
          const [members, expenses, balances] = await Promise.all([membersResponse.json(), expensesResponse.json(), balancesResponse.json()]);
          const personalBalance = balances.find((balance) => String(balance.user_id) === String(user?.user_id))?.balance || 0;
          return { ...group, members, balance: personalBalance, expenses: expenses.map((item) => ({ ...item, group_name: group.group_name, group_id: group.group_id })) };
        }));
        if (active) setState({ groups: detailRows, expenses: detailRows.flatMap((group) => group.expenses).sort((a, b) => new Date(b.expense_date) - new Date(a.expense_date)), loading: false, error: "" });
      } catch (error) {
        if (active) setState((current) => ({ ...current, loading: false, error: error.message || "Unable to load SmartSplit data." }));
      }
    }
    load();
    return () => { active = false; };
  }, [user?.user_id]);
  return state;
}

function ScreenHeader({ eyebrow, title, subtitle, back = "/personal" }) {
  return <><Link className="screen-back" to={back} aria-label="Back">‹</Link><header className="screen-heading"><p>{eyebrow}</p><h1>{title}</h1>{subtitle && <span>{subtitle}</span>}</header></>;
}

export function HistoryScreen() {
  const { expenses, loading, error } = useWorkspace();
  const [filter, setFilter] = useState("All");
  const shownExpenses = filter === "Settlements" ? [] : expenses;
  return <main className="phone-app reference-page"><ScreenHeader eyebrow="Your activity" title="Transaction History" subtitle="Every shared moment, in one place." />
    <div className="history-filter">{["All", "Expenses", "Settlements"].map((item) => <button key={item} className={filter === item ? "selected" : ""} onClick={() => setFilter(item)}>{item}</button>)}</div>
    <section className="reference-list">{loading ? <p className="home-state">Loading transactions…</p> : error ? <p className="home-state home-error">{error}</p> : shownExpenses.length ? shownExpenses.map((expense) => <article className="transaction-row" key={expense.expense_id}><span className="transaction-avatar">₹</span><div><strong>{expense.description}</strong><small>{new Date(expense.expense_date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} · {expense.group_name}</small></div><b>{money(expense.amount)}</b></article>) : <p className="home-state">{filter === "Settlements" ? "No settlement history is available here yet." : "Your group expenses will appear here."}</p>}</section>
  </main>;
}

export function GroupsScreen() {
  const { groups, loading, error } = useWorkspace();
  return <main className="phone-app reference-page groups-page"><ScreenHeader eyebrow="Your shared spaces" title="All groups" subtitle="Open a group to see its people, expenses, and balances." />
    {loading ? <p className="home-state">Loading your groups…</p> : error ? <p className="home-state home-error" role="alert">{error}</p> : groups.length ? <section className="all-groups-list">{groups.map((group) => <Link className="all-group-card" to={`/group/${group.group_id}`} key={group.group_id}><span className="all-group-mark" aria-hidden="true">👥</span><span className="all-group-copy"><strong>{group.group_name}</strong><small>{group.members.length} {group.members.length === 1 ? "member" : "members"} · {group.expenses.length} {group.expenses.length === 1 ? "expense" : "expenses"}</small></span><span className="all-group-balance"><strong>{money(Math.abs(group.balance))}</strong><small>{group.balance >= 0 ? "You're owed" : "You owe"}</small></span><span className="all-group-chevron" aria-hidden="true">›</span></Link>)}</section> : <section className="groups-empty-state"><span aria-hidden="true">♧</span><h2>No groups yet</h2><p>Create a group or open an invite link to get started.</p><Link to="/personal#groups">Go to home</Link></section>}
  </main>;
}

export function InsightsScreen() {
  const { groups, expenses, loading, error } = useWorkspace();
  const [period, setPeriod] = useState("30D");
  const [now] = useState(() => Date.now());
  const periodDays = { "7D": 7, "30D": 30, "3M": 90, "1Y": 365 }[period];
  const periodExpenses = useMemo(() => expenses.filter((item) => {
    const date = new Date(item.expense_date);
    return Number.isNaN(date.getTime()) || (now - date.getTime()) / 86400000 <= periodDays;
  }), [expenses, now, periodDays]);
  const total = periodExpenses.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const categories = useMemo(() => groups.map((group) => ({ name: group.group_name, total: periodExpenses.filter((expense) => expense.group_id === group.group_id).reduce((sum, item) => sum + Number(item.amount || 0), 0) })).filter((item) => item.total > 0).sort((a, b) => b.total - a.total).slice(0, 5), [groups, periodExpenses]);
  return <main className="phone-app reference-page"><ScreenHeader eyebrow="Your spending" title="Insights" subtitle="A clearer view of your shared spending." />
    {loading ? <p className="home-state">Building your insights…</p> : error ? <p className="home-state home-error">{error}</p> : <>
      <div className="insight-period">{["7D", "30D", "3M", "1Y"].map((item) => <button key={item} className={period === item ? "selected" : ""} onClick={() => setPeriod(item)}>{item}</button>)}</div>
      <section className="insight-total"><span>Total shared spend</span><strong>{money(total)}</strong><small>{periodExpenses.length} recorded {periodExpenses.length === 1 ? "expense" : "expenses"}</small><div className="insight-bars" aria-label="Spending by group">{categories.map((item) => <i key={item.name} style={{ height: `${Math.max(14, total ? item.total / total * 100 : 14)}%` }} title={item.name} />)}</div></section>
      <section className="reference-list"><h2>Spending by group</h2>{categories.length ? categories.map((item) => <article className="category-row" key={item.name}><span>{item.name}</span><strong>{money(item.total)}</strong><i style={{ width: `${total ? item.total / total * 100 : 0}%` }} /></article>) : <p className="home-state">Add a shared expense to see your spending breakdown.</p>}</section>
    </>}
  </main>;
}

export function ProfileScreen() {
  const { groups, loading, error } = useWorkspace();
  const { user, signOut, signOutAll } = useAuth();
  const [sessions, setSessions] = useState([]);
  const [sessionError, setSessionError] = useState("");
  const [actionError, setActionError] = useState("");
  const [mode, setMode] = useState(() => document.documentElement.dataset.mode || "light");
  const totalBalance = groups.reduce((sum, group) => sum + Number(group.balance || 0), 0);
  useEffect(() => {
    let active = true;
    apiFetch("/api/auth/sessions").then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load your signed-in devices.");
      if (active) setSessions(data);
    }).catch((loadError) => { if (active) setSessionError(loadError.message); });
    return () => { active = false; };
  }, []);
  async function removeSession(sessionId) {
    try {
      const response = await apiFetch(`/api/auth/sessions/${sessionId}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to sign out that device.");
      setSessions((current) => current.filter((session) => session.session_id !== sessionId));
      setSessionError("");
    } catch (error) { setSessionError(error.message || "Unable to sign out that device."); }
  }
  async function handleSignOut() { try { await signOut(); window.location.assign("/login"); } catch (error) { setActionError(error.message); } }
  async function handleSignOutAll() { try { await signOutAll(); window.location.assign("/login"); } catch (error) { setActionError(error.message); } }
  function toggleMode() {
    const next = mode === "dark" ? "light" : "dark";
    document.querySelector(".appearance-toggle")?.click();
    setMode(next);
  }
  return <main className="phone-app reference-page profile-page">
    <header className="profile-page-header"><h1>Profile</h1><button type="button" aria-label="Profile settings" onClick={() => document.querySelector(".profile-preferences")?.scrollIntoView({ behavior: "smooth" })}>⚙</button></header>
    <section className="profile-card"><span className="profile-avatar">{user?.name?.charAt(0)?.toUpperCase() || "S"}</span><div><strong>{user?.name || "SmartSplit member"}</strong><small>{user?.email || "Personal account"}</small></div></section>
    <section className="profile-balance-card"><span>Total balance</span><strong>{money(Math.abs(totalBalance))}</strong><small>{loading ? "Updating from your groups" : totalBalance >= 0 ? "Across your groups · you're owed" : "Across your groups · you owe"}</small><i aria-hidden="true">↗</i></section>
    {error && <p className="profile-note" role="alert">{error}</p>}
    <section className="profile-preferences"><h2 className="visually-hidden">Preferences</h2><Link to="/groups"><span>♙</span><span><strong>My Groups</strong></span><i>›</i></Link><button onClick={toggleMode} type="button"><span>◷</span><span><strong>Theme Settings</strong></span><i>{mode === "dark" ? "Dark" : "Light"} · Rotating　›</i></button><Link to="/history"><span>◷</span><span><strong>Transaction History</strong></span><i>›</i></Link><Link to="/insights"><span>ⓘ</span><span><strong>Spending Insights</strong></span><i>›</i></Link><button className="profile-logout-row" type="button" onClick={handleSignOut}><span>⇥</span><span><strong>Log Out</strong></span><i>›</i></button></section>
    <section className="profile-extra-links"><Link to="/themes">Palette collection <span>›</span></Link></section>
    <section className="profile-devices"><h2>Signed-in devices</h2>{sessionError && <p className="auth-error" role="alert">{sessionError}</p>}{actionError && <p className="auth-error" role="alert">{actionError}</p>}{sessions.map((session) => <div className="device-session" key={session.session_id}><span className="device-icon">▣</span><div><strong>{session.device_name}{session.current ? " · This device" : ""}</strong><small>Last active {new Date(session.last_seen).toLocaleString()}</small></div>{!session.current && <button type="button" onClick={() => removeSession(session.session_id)}>Sign out</button>}</div>)}{!sessions.length && !sessionError && <p className="profile-note">Loading signed-in devices…</p>}<button className="signout-button" type="button" onClick={handleSignOut}>Sign out on this device</button>{sessions.length > 1 && <button className="signout-all-button" type="button" onClick={handleSignOutAll}>Sign out of all devices</button>}{loading && <p className="profile-note">Loading your groups…</p>}{error && <p className="profile-note">{error}</p>}</section>
  </main>;
}

export function ThemeScreen() {
  const themes = [["obsidian", "Obsidian Gold"], ["arctic", "Arctic Blue"], ["emerald", "Emerald"], ["amethyst", "Amethyst"], ["rose", "Rose Quartz"], ["cyan", "Cyber Cyan"], ["sunset", "Sunset Amber"], ["crimson", "Crimson"]];
  const [current, setCurrent] = useState(() => document.documentElement.dataset.theme || "obsidian");
  function selectTheme(theme) {
    const applyTheme = () => { document.documentElement.dataset.theme = theme; setCurrent(theme); };
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (document.startViewTransition && !reduceMotion) document.startViewTransition(applyTheme);
    else applyTheme();
    try { localStorage.setItem("smartsplit:previous-palette", theme); } catch { /* Theme remains active for this visit. */ }
  }
  return <main className="phone-app reference-page theme-page"><ScreenHeader eyebrow="Make it yours" title="Dynamic Theme Rotation" subtitle="A new colour theme on every refresh." back="/profile" />
    <div className="theme-gallery">{themes.map(([id, label]) => <button key={id} className={current === id ? "theme-swatch selected" : "theme-swatch"} data-palette={id} onClick={() => selectTheme(id)} aria-pressed={current === id}><span /><strong>{label}</strong></button>)}</div>
    <button className="shuffle-action" onClick={() => { const others = themes.map(([id]) => id).filter((id) => id !== current); selectTheme(others[Math.floor(Math.random() * others.length)]); }}><span>◌</span><span><strong>Shuffle Theme</strong><small>Change the theme manually</small></span><i>↻</i></button>
    <p className="theme-note">Your palette stays consistent as you move through SmartSplit. Light and Dark modes share the same themes.</p>
  </main>;
}
