import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { API_URL } from "../config";

function GroupDetails() {
  const navigate = useNavigate();
  const { groupId } = useParams();

  const [group, setGroup] = useState(null);
  const [members, setMembers] = useState([]);
  const [expenses, setExpenses] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadGroupData() {
      try {
        setLoading(true);
        setError("");

        const responseError = async (response, fallback) => {
          let body = {};
          try {
            body = await response.json();
          } catch {
            // Keep the status-specific fallback for non-JSON responses.
          }
          return body.error || body.message || fallback;
        };

        const groupResponse = await fetch(`${API_URL}/api/groups/${groupId}`, {
          signal: AbortSignal.timeout(15000),
        });
        if (!groupResponse.ok) {
          throw new Error(await responseError(groupResponse, "Failed to load group."));
        }

        const groupData = await groupResponse.json();
        const [membersResponse, expensesResponse] = await Promise.all([
          fetch(`${API_URL}/api/groups/${groupId}/members`, {
            signal: AbortSignal.timeout(15000),
          }),
          fetch(`${API_URL}/api/groups/${groupId}/expenses`, {
            signal: AbortSignal.timeout(15000),
          }),
        ]);

        if (!membersResponse.ok) {
          throw new Error(await responseError(membersResponse, "Failed to load group members."));
        }

        if (!expensesResponse.ok) {
          throw new Error(await responseError(expensesResponse, "Failed to load expenses."));
        }

        const membersData = await membersResponse.json();
        const expensesData = await expensesResponse.json();

        setGroup(groupData);
        setMembers(membersData);
        setExpenses(expensesData);
      } catch (err) {
        console.error(err);

        setError(
          err.name === "TimeoutError"
            ? "The group request timed out. Check the backend and database connection, then try again."
            : err.message || "Unable to load group information. Check the backend and database connection."
        );
      } finally {
        setLoading(false);
      }
    }

    loadGroupData();
  }, [groupId]);

  // =========================
  // LOADING
  // =========================

  if (loading) {
    return (
      <div className="phone-app group-page">
        <div className="page-header">
          <h1>Loading...</h1>
          <p>Getting your group information</p>
        </div>
      </div>
    );
  }

  // =========================
  // ERROR
  // =========================

  if (error) {
    return (
      <div className="phone-app group-page">
        <button
          className="back-button"
          onClick={() => navigate("/")}
        >
          ←
        </button>

        <div className="page-header">
          <h1>{error === "Group not found" ? "Group not found" : "Something went wrong"}</h1>
          <p>
            {error === "Group not found"
              ? "This group does not exist or the link is no longer valid. Return home and choose an available group."
              : error}
          </p>
        </div>
      </div>
    );
  }

  // =========================
  // GROUP PAGE
  // =========================

  return (
    <div className="phone-app group-page">

      {/* Back */}
      <button
        className="back-button"
        onClick={() => navigate("/")}
      >
        ←
      </button>

      {/* Header */}
      <div className="group-header">
        <h1>🏖️ {group.group_name}</h1>

        <p>
          {members.length} members
        </p>
      </div>

      {/* Group info */}
      <div className="group-balance-card">
        <p>Group ID</p>
        <h2>#{group.group_id}</h2>
      </div>

      {/* Members */}
      <section className="group-section">

        <h3>Members</h3>

        {members.map((member) => (
          <div
            className="balance-row"
            key={member.user_id}
          >
            <div className="balance-person">

              <div className="avatar">
                {member.name.charAt(0)}
              </div>

              <span>
                {member.name}
              </span>

            </div>
          </div>
        ))}

      </section>

      {/* =========================
          EXPENSES
      ========================= */}

      <section className="group-section">

        <h3>Expenses</h3>

        {expenses.length === 0 ? (
          <p style={{ color: "#aaa" }}>
            No expenses yet.
          </p>
        ) : (
          expenses.map((expense) => (
            <div
              className="balance-row"
              key={expense.expense_id}
            >
              <div className="balance-person">

                <div className="avatar">
                  ₹
                </div>

                <div>
                  <span>
                    {expense.description}
                  </span>

                  <p
                    style={{
                      margin: "4px 0 0",
                      fontSize: "12px",
                      color: "#999",
                    }}
                  >
                    Paid by {expense.paid_by_name}
                  </p>
                </div>

              </div>

              <strong>
                ₹{Number(expense.amount).toFixed(2)}
              </strong>
            </div>
          ))
        )}

      </section>

      {/* Add Expense */}
      <button
        className="add-expense-button"
        onClick={() =>
          navigate(`/group/${groupId}/add-expense`)
        }
      >
        + Add Expense
      </button>

      {/* View Balances */}
      <button
        className="balances-button"
        onClick={() =>
          navigate(`/group/${groupId}/balances`)
        }
      >
        View Balances
      </button>

    </div>
  );
}

export default GroupDetails;
