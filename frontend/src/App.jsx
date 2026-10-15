import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, useNavigate } from "react-router-dom";
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

  useEffect(() => {
    async function loadGroups() {
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
    }

    loadGroups();
  }, []);

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

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/group/:groupId" element={<GroupDetails />} />
        <Route path="/group/:groupId/add-expense" element={<AddExpense />} />
        <Route path="/group/:groupId/balances" element={<Balances />} />
        <Route path="/group/:groupId/settlement" element={<Settlement />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
