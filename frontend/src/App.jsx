import { useCallback, useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, useNavigate, Link, useLocation, Navigate, Outlet } from "react-router-dom";
import "./App.css";

import { apiFetch } from "./config";
import { AuthProvider } from "./auth";
import { useAuth } from "./auth-context";
import { LoginPage, SignupPage } from "./pages/authpages";
import GroupJoin from "./pages/groupjoin";
import GroupDetails from "./pages/groupdetails";
import AddExpense from "./pages/addexpense";
import Balances from "./pages/balances";
import Settlement from "./pages/settlement";
import { GroupsScreen, HistoryScreen, InsightsScreen, ProfileScreen, ThemeScreen } from "./pages/referencepages";

const formatAmount = (amount) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(amount) || 0);

const sumAmounts = (items) =>
  items.reduce((totalCents, item) => {
    return totalCents + Math.round(Number(item.amount || 0) * 100);
  }, 0) / 100;

async function responseError(response, fallback) {
  let body = {};
  try {
    body = await response.json();
  } catch {
    // Keep a useful fallback for non-JSON responses.
  }
  return body.error || body.message || fallback;
}

function Home() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [groups, setGroups] = useState([]);
  const [recentExpenses, setRecentExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [createSuccess, setCreateSuccess] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const loadGroups = useCallback(async () => {
    try {
      const response = await apiFetch("/api/groups");
      if (!response.ok) {
        throw new Error(await responseError(response, "Unable to load groups."));
      }

      const groupRows = await response.json();
      const groupSummaries = await Promise.all(
        groupRows.map(async (group) => {
          const [membersResponse, expensesResponse] = await Promise.all([
            apiFetch(`/api/groups/${group.group_id}/members`),
            apiFetch(`/api/groups/${group.group_id}/expenses`),
          ]);

          if (!membersResponse.ok) {
            throw new Error(await responseError(membersResponse, "Unable to load group members."));
          }
          if (!expensesResponse.ok) {
            throw new Error(await responseError(expensesResponse, "Unable to load group expenses."));
          }

          const [members, expenses] = await Promise.all([
            membersResponse.json(),
            expensesResponse.json(),
          ]);

          return {
            ...group,
            memberCount: members.length,
            expenses,
            totalSpent: sumAmounts(expenses),
          };
        })
      );

      setError("");
      setGroups(groupSummaries);
      setRecentExpenses(
        groupSummaries
          .flatMap((group) =>
            group.expenses.map((expense) => ({ ...expense, group_name: group.group_name }))
          )
          .sort((left, right) => new Date(right.expense_date) - new Date(left.expense_date))
          .slice(0, 2)
      );
    } catch (loadError) {
      console.error(loadError);
      setError(loadError.message || "Unable to load groups. Check the backend connection and try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Fetches are asynchronous; state updates happen after the network response.
    // oxlint-disable-next-line react/set-state-in-effect
    loadGroups();
  }, [loadGroups]);

  async function handleCreateGroup(event) {
    event.preventDefault();
    const normalizedName = groupName.trim();
    if (!normalizedName) {
      setCreateError("Enter a group name to continue.");
      return;
    }
    try {
      setCreating(true);
      setCreateError("");
      setCreateSuccess("");
      const response = await apiFetch("/api/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ group_name: normalizedName }),
      });
      if (!response.ok) {
        throw new Error(await responseError(response, "Unable to create the group."));
      }

      const result = await response.json();
      if (!result.group_id) throw new Error("The server did not return the new group ID.");
      setCreateSuccess("Group created and creator added. Opening your group…");
      await loadGroups();
      window.setTimeout(() => navigate(`/group/${result.group_id}`), 500);
    } catch (createFailure) {
      setCreateError(createFailure.message || "Unable to create the group. Please try again.");
      setCreating(false);
    }
  }

  const totalSpent = groups.reduce((totalCents, group) => {
    return totalCents + Math.round(group.totalSpent * 100);
  }, 0) / 100;

  return (
    <div className="phone-app dashboard-page">
      <header className="header">
        <div className="brand">
          <div className="brand-icon">✦</div>
          <span>
            Smart<span>Split</span>
          </span>
        </div>
      </header>

      <Link className="mode-back-link" to="/">← All SmartSplit modes</Link>

      <section className="greeting">
  <p className="dashboard-eyebrow">PERSONAL SPACE <span /> OVERVIEW</p>
  <h2>Good morning,<br />{user?.name || "welcome back"}.</h2>
  <p>Your groups and shared expenses, all in one place.</p>
</section>

      <label className="dashboard-search"><span aria-hidden="true">⌕</span><input aria-label="Search groups and expenses" placeholder="Search groups, expenses…" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} /><span aria-hidden="true">⌕</span></label>

      <section className="overview-card" id="overview" aria-label="Spending overview">
  <div className="overview-item overview-primary"><p>Total shared spending</p><h1>{formatAmount(totalSpent)}</h1><span className="overview-footnote">Across all your groups</span></div>
  <div className="overview-item overview-secondary"><span className="overview-stat-icon" aria-hidden="true">▦</span><p>Active groups</p><h2>{groups.length}</h2></div>
  <span className="overview-orbit" aria-hidden="true" />
</section>

      <button className="create-group-trigger" type="button" onClick={() => {
        setCreateOpen(true);
        setCreateError("");
        setCreateSuccess("");
      }}>
        <span className="create-group-plus" aria-hidden="true">+</span>
        <span><strong>Create a group</strong><small>Start sharing expenses together</small></span>
        <span className="create-group-arrow" aria-hidden="true">→</span>
      </button>

      {createOpen && (
        <div className="group-dialog-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !creating) setCreateOpen(false);
        }}>
          <section className="group-dialog" role="dialog" aria-modal="true" aria-labelledby="create-group-title">
            <button className="group-dialog-close" type="button" aria-label="Close create group form" disabled={creating} onClick={() => setCreateOpen(false)}>×</button>
            <div className="group-dialog-mark" aria-hidden="true">✦</div>
            <p className="group-dialog-eyebrow">A new shared space</p>
            <h2 id="create-group-title">Create a group</h2>
            <p className="group-dialog-copy">Give your group a name. Your profile will be added as its creator.</p>

            <form onSubmit={handleCreateGroup}>
              <label className="group-field-label" htmlFor="new-group-name">Group name</label>
              <input id="new-group-name" className="group-field" autoFocus maxLength={255} placeholder="e.g. Goa weekend" value={groupName} onChange={(event) => setGroupName(event.target.value)} disabled={creating} />

              {createError && <p className="group-form-message group-form-error" role="alert">{createError}</p>}
              {createSuccess && <p className="group-form-message group-form-success" role="status">{createSuccess}</p>}

              <button className="group-create-submit" type="submit" disabled={creating}>
                {creating ? <><span className="group-spinner" aria-hidden="true" /> Creating your group…</> : "Create group"}
              </button>
            </form>
          </section>
        </div>
      )}

      <div className="dashboard-grid">
      <section className="section groups-panel" id="groups">
        <div className="section-heading"><h3>Your Groups</h3><Link to="/groups">{groups.length ? "See all →" : "Browse groups →"}</Link></div>
        {loading ? (
          <p className="home-state" role="status">Loading groups…</p>
        ) : error ? (
          <p className="home-state home-error" role="alert">{error}</p>
        ) : groups.length === 0 ? (
          <p className="home-state" role="status">No groups are available yet.</p>
        ) : (
          <div className="groups-scroll">
            {groups.filter((group) => group.group_name.toLowerCase().includes(searchQuery.toLowerCase())).map((group) => (
              <button
                className="group-card"
                key={group.group_id}
                onClick={() => navigate(`/group/${group.group_id}`)}
                type="button"
              >
                <span className="group-title">
                  <span className="group-emoji" aria-hidden="true">👥</span>
                  <span>{group.group_name}</span>
                </span>
                <span className="group-card-detail">
                  {group.memberCount} {group.memberCount === 1 ? "member" : "members"}
                </span>
                <span className="group-card-detail">Total spent</span>
                <strong>{formatAmount(group.totalSpent)}</strong>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="section activity-section" id="activity">
        <div className="section-heading"><h3>Recent Activity</h3><Link to="/history">See all →</Link></div>
        {loading ? (
          <p className="home-state" role="status">Loading expenses…</p>
        ) : error ? null : recentExpenses.filter((expense) => `${expense.description} ${expense.group_name}`.toLowerCase().includes(searchQuery.toLowerCase())).length === 0 ? (
          <p className="home-state" role="status">No expenses yet.</p>
        ) : (
          recentExpenses.filter((expense) => `${expense.description} ${expense.group_name}`.toLowerCase().includes(searchQuery.toLowerCase())).map((expense) => (
            <div className="activity-row" key={expense.expense_id}>
              <div className="activity-icon" aria-hidden="true">₹</div>
              <div className="activity-info">
                <strong>{expense.description}</strong>
                <span>{expense.group_name} · {new Date(expense.expense_date).toLocaleDateString()}</span>
              </div>
              <strong className="activity-amount">{formatAmount(expense.amount)}</strong>
            </div>
          ))
        )}
      </section>
      </div>
    </div>
  );
}

function ModeChoice() {
  return (
    <main className="phone-app mode-page">
      <Link className="mode-back-link" to="/">←</Link>
      <header className="header">
        <div className="brand">
          <div className="brand-icon" aria-hidden="true">✦</div>
          <span>Smart<span>Split</span></span>
        </div>
      </header>
      <section className="mode-intro">
        <p className="mode-eyebrow">Shared expenses, made simple</p>
        <h1>How will you use SmartSplit?</h1>
        <p>Choose a space to get started.</p>
      </section>
      <nav className="mode-options" aria-label="Choose SmartSplit mode">
        <Link className="mode-option personal-option" to="/personal">
          <span className="mode-option-icon" aria-hidden="true">↗</span>
          <span><strong>Personal</strong><small>Groups, shared expenses and balances</small></span>
          <span className="mode-chevron" aria-hidden="true">→</span>
        </Link>
        <Link className="mode-option business-option" to="/business">
          <span className="mode-option-icon" aria-hidden="true">▦</span>
          <span><strong>Business <i>Coming soon</i></strong><small>Business expense tools are on the way</small></span>
          <span className="mode-chevron" aria-hidden="true">→</span>
        </Link>
      </nav>
    </main>
  );
}

function BusinessComingSoon() {
  return (
    <main className="phone-app mode-page">
      <Link className="mode-back-link" to="/">← All SmartSplit modes</Link>
      <section className="business-placeholder">
        <span className="mode-option-icon" aria-hidden="true">▦</span>
        <p className="mode-eyebrow">Business</p>
        <h1>Coming soon</h1>
        <p>Business expense management is planned for a future release.</p>
        <Link className="mode-return-button" to="/choose">Back to mode choice</Link>
      </section>
    </main>
  );
}

function Welcome() {
  const { user } = useAuth();
  const faces = ["👩🏻", "👨🏽", "👴🏻", "👩🏾", "👦🏼"];
  return (
    <main className="welcome-page">
      <section className="welcome-showcase" aria-label="SmartSplit shared bill introduction">
        <span className="welcome-skip">SmartSplit</span>
        <div className="welcome-orbit-scene" aria-hidden="true">
          <span className="welcome-orbit-ring welcome-orbit-outer" />
          <span className="welcome-orbit-ring welcome-orbit-inner" />
          {faces.map((face, index) => <span className={`welcome-face welcome-face-${index + 1}`} key={`${face}-${index}`}>{face}</span>)}
          <span className="welcome-money">₹</span>
        </div>
        <div className="welcome-copy">
          <h1>Easy way<br />to share <em>bill</em></h1>
          <p>Easy to share bills with your friends and anyone.</p>
          <div className="welcome-slide-controls" aria-hidden="true"><i /><i /><b /></div>
        </div>
        <div className="welcome-actions">
          <Link className="welcome-cta" to={user ? "/personal" : "/signup"}>{user ? "Continue" : "Get Started"} <span aria-hidden="true">→</span></Link>
          {!user && <Link className="welcome-login-link" to="/login">I already have an account · Sign in</Link>}
        </div>
      </section>
    </main>
  );
}

const PALETTES = ["obsidian", "arctic", "emerald", "amethyst", "rose", "cyan", "sunset", "crimson"];
const PALETTE_LABELS = {
  obsidian: "Obsidian Gold", arctic: "Arctic Blue", emerald: "Emerald", amethyst: "Amethyst",
  rose: "Rose Quartz", cyan: "Cyber Cyan", sunset: "Sunset Amber", crimson: "Crimson",
};
const LAST_PALETTE_KEY = "smartsplit:previous-palette";

function ThemeShuffle() {
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme || "obsidian");

  function shuffleTheme() {
    let previous = "";
    try { previous = window.localStorage.getItem(LAST_PALETTE_KEY) || ""; } catch { /* Storage can be disabled. */ }
    const choices = PALETTES.filter((palette) => palette !== theme && palette !== previous);
    const next = choices[Math.floor(Math.random() * choices.length)] || PALETTES.find((palette) => palette !== theme);
    if (!next) return;
    const applyTheme = () => {
      document.documentElement.dataset.theme = next;
      setTheme(next);
    };
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (document.startViewTransition && !prefersReducedMotion) {
      document.startViewTransition(applyTheme);
    } else {
      applyTheme();
    }
    try { window.localStorage.setItem(LAST_PALETTE_KEY, next); } catch { /* The theme still works for this visit. */ }
  }

  return (
    <button className="theme-shuffle" type="button" onClick={shuffleTheme} aria-label={`Change colour theme. Current palette: ${PALETTE_LABELS[theme]}`} title={`Current palette: ${PALETTE_LABELS[theme]}`}>
      <span className="theme-shuffle-icon" aria-hidden="true">✳</span>
      <span>{PALETTE_LABELS[theme]}</span>
      <span aria-hidden="true">↻</span>
    </button>
  );
}

const APPEARANCE_KEY = "smartsplit:appearance";

function AppearanceToggle() {
  const [mode, setMode] = useState(() => document.documentElement.dataset.mode || "light");

  function toggleMode() {
    const nextMode = mode === "dark" ? "light" : "dark";
    const applyMode = () => {
      document.documentElement.dataset.mode = nextMode;
      setMode(nextMode);
    };
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (document.startViewTransition && !prefersReducedMotion) {
      document.startViewTransition(applyMode);
    } else {
      applyMode();
    }
    try { window.localStorage.setItem(APPEARANCE_KEY, nextMode); } catch { /* The choice remains active for this visit. */ }
  }

  const nextLabel = mode === "dark" ? "Light" : "Dark";
  return (
    <button className="appearance-toggle" type="button" onClick={toggleMode} aria-label={`Switch to ${nextLabel} mode`} title={`Switch to ${nextLabel} mode`}>
      <span aria-hidden="true">{mode === "dark" ? "☼" : "☾"}</span>
      <span>{mode === "dark" ? "Dark" : "Light"}</span>
    </button>
  );
}
function FloatingNavigation() {
  const { pathname, hash } = useLocation();
  const { user } = useAuth();
  const groupId = pathname.match(/^\/group\/([^/]+)/)?.[1];

  if (!user) return null;
  if (pathname === "/personal" || ["/groups", "/history", "/insights", "/profile", "/themes"].includes(pathname)) {
    const sections = [
      { id: "/personal#overview", label: "Home", icon: "⌂" },
      { id: "/groups", label: "Groups", icon: "♧" },
      { id: "/history", label: "History", icon: "◷" },
      { id: "/insights", label: "Insights", icon: "◌" },
      { id: "/profile", label: "Profile", icon: "●" },
    ];
    return (
      <nav className="floating-navigation" aria-label="Dashboard navigation">
        {sections.map((item) => (
          <Link className={(pathname === item.id.split("#")[0] && (item.id.includes("#") ? hash === item.id.split("#")[1] || (!hash && item.id.endsWith("overview")) : true)) ? "floating-nav-item active" : "floating-nav-item"} to={item.id} key={item.id}>
            <span className="floating-nav-icon" aria-hidden="true">{item.icon}</span>
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>
    );
  }

  if (!groupId) return null;
  const items = [
    { path: `/group/${groupId}`, label: "Group", icon: "⌂" },
    { path: `/group/${groupId}/add-expense`, label: "Expense", icon: "+" },
    { path: `/group/${groupId}/balances`, label: "Balances", icon: "◉" },
    { path: `/group/${groupId}/settlement`, label: "Settle", icon: "⇄" },
  ];
  return (
    <nav className="floating-navigation" aria-label="Group navigation">
      {items.map((item) => (
        <Link
          className={pathname === item.path ? "floating-nav-item active" : "floating-nav-item"}
          to={item.path}
          key={item.path}
          aria-current={pathname === item.path ? "page" : undefined}
        >
          <span className="floating-nav-icon" aria-hidden="true">{item.icon}</span>
          <span>{item.label}</span>
        </Link>
      ))}
    </nav>
  );
}

function RequireAuth() {
  const { user, ready } = useAuth();
  const location = useLocation();
  if (!ready) return <main className="phone-app auth-loading" role="status">Checking your sign-in…</main>;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  return <Outlet />;
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}

function AppRoutes() {
  const { user } = useAuth();
  return <>
    {user && <div className="top-controls"><AppearanceToggle /><ThemeShuffle /></div>}
    <FloatingNavigation />
    <Routes>
      <Route path="/" element={<Welcome />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route element={<RequireAuth />}>
        <Route path="/choose" element={<ModeChoice />} />
        <Route path="/personal" element={<Home />} />
        <Route path="/groups" element={<GroupsScreen />} />
        <Route path="/history" element={<HistoryScreen />} />
        <Route path="/insights" element={<InsightsScreen />} />
        <Route path="/profile" element={<ProfileScreen />} />
        <Route path="/themes" element={<ThemeScreen />} />
        <Route path="/business" element={<BusinessComingSoon />} />
        <Route path="/group/:groupId" element={<GroupDetails />} />
        <Route path="/group/:groupId/add-expense" element={<AddExpense />} />
        <Route path="/group/:groupId/balances" element={<Balances />} />
        <Route path="/group/:groupId/settlement" element={<Settlement />} />
        <Route path="/join/:token" element={<GroupJoin />} />
      </Route>
    </Routes>
  </>;
}

export default App;
