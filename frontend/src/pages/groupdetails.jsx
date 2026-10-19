import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { API_URL } from "../config";

function GroupDetails() {
  const navigate = useNavigate();
  const { groupId } = useParams();

  const [group, setGroup] = useState(null);
  const [members, setMembers] = useState([]);
  const [users, setUsers] = useState([]);
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [expenses, setExpenses] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [addingMembers, setAddingMembers] = useState(false);
  const [memberError, setMemberError] = useState("");
  const [memberSuccess, setMemberSuccess] = useState("");

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
        const [membersResponse, expensesResponse, usersResponse] = await Promise.all([
          fetch(`${API_URL}/api/groups/${groupId}/members`, {
            signal: AbortSignal.timeout(15000),
          }),
          fetch(`${API_URL}/api/groups/${groupId}/expenses`, {
            signal: AbortSignal.timeout(15000),
          }),
          fetch(`${API_URL}/api/users`, {
            signal: AbortSignal.timeout(15000),
          }),
        ]);

        if (!membersResponse.ok) {
          throw new Error(await responseError(membersResponse, "Failed to load group members."));
        }

        if (!expensesResponse.ok) {
          throw new Error(await responseError(expensesResponse, "Failed to load expenses."));
        }
        if (!usersResponse.ok) {
          throw new Error(await responseError(usersResponse, "Failed to load available users."));
        }

        const membersData = await membersResponse.json();
        const expensesData = await expensesResponse.json();
        const usersData = await usersResponse.json();

        setGroup(groupData);
        setMembers(membersData);
        setUsers(usersData);
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

  const memberIds = new Set(members.map((member) => String(member.user_id)));
  const eligibleUsers = users.filter((user) => !memberIds.has(String(user.user_id)));

  function toggleSelectedUser(userId) {
    setSelectedUsers((current) => current.includes(userId)
      ? current.filter((id) => id !== userId)
      : [...current, userId]);
    setMemberError("");
    setMemberSuccess("");
  }

  async function refreshMembers() {
    const response = await fetch(`${API_URL}/api/groups/${groupId}/members`);
    if (!response.ok) {
      throw new Error("The member list could not be refreshed. Reload the page to check the latest membership.");
    }
    const memberRows = await response.json();
    setMembers(memberRows);
    return memberRows;
  }

  async function handleAddParticipants(event) {
    event.preventDefault();
    if (addingMembers || selectedUsers.length === 0) return;

    setAddingMembers(true);
    setMemberError("");
    setMemberSuccess("");
    let addedCount = 0;

    try {
      for (const userId of selectedUsers) {
        const response = await fetch(`${API_URL}/api/groups/${groupId}/members`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: Number(userId) }),
        });

        if (!response.ok) {
          let body = {};
          try { body = await response.json(); } catch { /* use a local fallback */ }
          if (response.status === 409) {
            throw new Error(`${body.error || "A selected user is already a member."} The member list has been refreshed.`);
          }
          throw new Error(body.error || body.message || `Could not add the selected participant (HTTP ${response.status}).`);
        }

        addedCount += 1;
      }

      await refreshMembers();
      setSelectedUsers([]);
      setMemberSuccess(`${addedCount} ${addedCount === 1 ? "participant was" : "participants were"} added to the group.`);
    } catch (addError) {
      try {
        const refreshedMembers = await refreshMembers();
        const refreshedIds = new Set(refreshedMembers.map((member) => String(member.user_id)));
        setSelectedUsers((current) => current.filter((id) => !refreshedIds.has(id)));
      } catch (refreshError) {
        setMemberError(`${addError.message} ${refreshError.message}`);
        setAddingMembers(false);
        return;
      }

      setMemberError(addedCount > 0
        ? `${addedCount} participant${addedCount === 1 ? " was" : "s were"} added, but another could not be added: ${addError.message}`
        : addError.message);
    } finally {
      setAddingMembers(false);
    }
  }

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
          onClick={() => navigate("/personal")}
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
        onClick={() => navigate("/personal")}
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

        {members.length === 0 ? <p className="member-empty">No members yet.</p> : null}

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

      <section className="group-section add-participants-section">
        <div className="participants-heading">
          <div>
            <h3>Add Participants</h3>
            <p>Invite existing SmartSplit users to this group.</p>
          </div>
          <span className="participants-count">{eligibleUsers.length} available</span>
        </div>

        {memberError && <p className="member-feedback member-feedback-error" role="alert">{memberError}</p>}
        {memberSuccess && <p className="member-feedback member-feedback-success" role="status">{memberSuccess}</p>}

        {eligibleUsers.length === 0 ? (
          <div className="participants-empty" role="status">
            <span className="participants-empty-icon" aria-hidden="true">✓</span>
            <div>
              <strong>{users.length === 0 ? "No users available" : "Everyone is already here"}</strong>
              <p>{users.length === 0 ? "There are no existing users to add yet." : "All existing users are already members of this group."}</p>
            </div>
          </div>
        ) : (
          <form onSubmit={handleAddParticipants}>
            <div className="participant-picker">
              {eligibleUsers.map((user) => {
                const userId = String(user.user_id);
                const checked = selectedUsers.includes(userId);
                return (
                  <label className={checked ? "participant-choice selected" : "participant-choice"} key={user.user_id}>
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={addingMembers}
                      onChange={() => toggleSelectedUser(userId)}
                    />
                    <span className="avatar">{user.name?.charAt(0)?.toUpperCase() || "?"}</span>
                    <span className="participant-choice-info">
                      <strong>{user.name}</strong>
                      {user.email && <small>{user.email}</small>}
                    </span>
                    <span className="participant-choice-mark" aria-hidden="true">✓</span>
                  </label>
                );
              })}
            </div>

            <button className="add-participants-button" type="submit" disabled={addingMembers || selectedUsers.length === 0}>
              {addingMembers ? <><span className="group-spinner" aria-hidden="true" /> Adding participants…</> : `Add selected${selectedUsers.length ? ` · ${selectedUsers.length}` : ""}`}
            </button>
          </form>
        )}
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
