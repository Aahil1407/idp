import { useCallback, useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, useNavigate, Link } from "react-router-dom";
import "./App.css";

import { API_URL } from "./config";
import GroupDetails from "./pages/groupdetails";
import AddExpense from "./pages/addexpense";
import Balances from "./pages/balances";
import Settlement from "./pages/settlement";

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
  const [groups, setGroups] = useState([]);
  const [recentExpenses, setRecentExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [users, setUsers] = useState([]);
  const [creatorId, setCreatorId] = useState("");
  const [usersLoading, setUsersLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [createSuccess, setCreateSuccess] = useState("");

  const loadGroups = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/api/groups`);
      if (!response.ok) {
        throw new Error(await responseError(response, "Unable to load groups."));
      }

      const groupRows = await response.json();
      const groupSummaries = await Promise.all(
        groupRows.map(async (group) => {
          const [membersResponse, expensesResponse] = await Promise.all([
            fetch(`${API_URL}/api/groups/${group.group_id}/members`),
            fetch(`${API_URL}/api/groups/${group.group_id}/expenses`),
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

  useEffect(() => {
    if (!createOpen) return undefined;

    let active = true;
    async function loadUsers() {
      try {
        const response = await fetch(`${API_URL}/api/users`);
        if (!response.ok) {
          throw new Error(await responseError(response, "Unable to load available users."));
        }
        const rows = await response.json();
        if (!active) return;
        setUsers(rows);
        setCreatorId((current) => rows.some((user) => String(user.user_id) === current) ? current : "");
        if (rows.length === 0) setCreateError("Create a user first, then choose them as the group creator.");
      } catch (loadError) {
        if (active) setCreateError(loadError.message || "Unable to load available users.");
      } finally {
        if (active) setUsersLoading(false);
      }
    }

    loadUsers();
    return () => { active = false; };
  }, [createOpen]);

  async function handleCreateGroup(event) {
    event.preventDefault();
    const normalizedName = groupName.trim();
    if (!normalizedName) {
      setCreateError("Enter a group name to continue.");
      return;
    }
    if (!creatorId) {
      setCreateError("Choose an existing user as the group creator.");
      return;
    }

    try {
      setCreating(true);
      setCreateError("");
      setCreateSuccess("");
      const response = await fetch(`${API_URL}/api/groups`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ group_name: normalizedName, created_by: Number(creatorId) }),
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
    <div className="phone-app">
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
        <h2>SmartSplit</h2>
        <p>Your groups and shared expenses</p>
      </section>

      <section className="overview-card">
        <div className="overview-item">
          <p>Groups</p>
          <h1>{groups.length}</h1>
        </div>
        <div className="overview-item">
          <p>Total spent</p>
          <h1>{formatAmount(totalSpent)}</h1>
        </div>
      </section>

      <button className="create-group-trigger" type="button" onClick={() => {
        setCreateOpen(true);
        setUsersLoading(true);
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
            <p className="group-dialog-copy">Give your group a name and choose who is creating it.</p>

            <form onSubmit={handleCreateGroup}>
              <label className="group-field-label" htmlFor="new-group-name">Group name</label>
              <input id="new-group-name" className="group-field" autoFocus maxLength={255} placeholder="e.g. Goa weekend" value={groupName} onChange={(event) => setGroupName(event.target.value)} disabled={creating} />

              <label className="group-field-label" htmlFor="group-creator">Created by</label>
              <select id="group-creator" className="group-field" value={creatorId} onChange={(event) => setCreatorId(event.target.value)} disabled={creating || usersLoading || users.length === 0}>
                <option value="">{usersLoading ? "Loading users…" : users.length === 0 ? "No users available" : "Choose an existing user"}</option>
                {users.map((user) => <option value={user.user_id} key={user.user_id}>{user.name}{user.email ? ` · ${user.email}` : ""}</option>)}
              </select>

              {createError && <p className="group-form-message group-form-error" role="alert">{createError}</p>}
              {createSuccess && <p className="group-form-message group-form-success" role="status">{createSuccess}</p>}

              <button className="group-create-submit" type="submit" disabled={creating || usersLoading || users.length === 0}>
                {creating ? <><span className="group-spinner" aria-hidden="true" /> Creating your group…</> : "Create group"}
              </button>
            </form>
          </section>
        </div>
      )}

      <section className="section">
        <h3>Your Groups</h3>
        {loading ? (
          <p className="home-state" role="status">Loading groups…</p>
        ) : error ? (
          <p className="home-state home-error" role="alert">{error}</p>
        ) : groups.length === 0 ? (
          <p className="home-state" role="status">No groups are available yet.</p>
        ) : (
          <div className="groups-scroll">
            {groups.map((group) => (
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

      <section className="section activity-section">
        <h3>Recent Activity</h3>
        {loading ? (
          <p className="home-state" role="status">Loading expenses…</p>
        ) : error ? null : recentExpenses.length === 0 ? (
          <p className="home-state" role="status">No expenses yet.</p>
        ) : (
          recentExpenses.map((expense) => (
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
  );
}

function ModeChoice() {
  return (
    <main className="phone-app mode-page">
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
        <Link className="mode-return-button" to="/">Back to mode choice</Link>
      </section>
    </main>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<ModeChoice />} />
        <Route path="/personal" element={<Home />} />
        <Route path="/business" element={<BusinessComingSoon />} />
        <Route path="/group/:groupId" element={<GroupDetails />} />
        <Route path="/group/:groupId/add-expense" element={<AddExpense />} />
        <Route path="/group/:groupId/balances" element={<Balances />} />
        <Route path="/group/:groupId/settlement" element={<Settlement />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
