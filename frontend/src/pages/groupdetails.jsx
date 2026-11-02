import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { apiFetch } from "../config";
import { useAuth } from "../auth-context";

const money = (value) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(Number(value) || 0);
const memberFaces = ["👨🏻", "👩🏽", "👨🏾", "👩🏻", "👨🏼", "👩🏾"];

function GroupDetails() {
  const navigate = useNavigate();
  const { groupId } = useParams();
  const { user } = useAuth();

  const [group, setGroup] = useState(null);
  const [members, setMembers] = useState([]);
  const [users, setUsers] = useState([]);
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [balances, setBalances] = useState([]);
  const [activeTab, setActiveTab] = useState("Expenses");
  const [inviteState, setInviteState] = useState("");
  const [inviteError, setInviteError] = useState("");

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

        const groupResponse = await apiFetch(`/api/groups/${groupId}`, {
          signal: AbortSignal.timeout(15000),
        });
        if (!groupResponse.ok) {
          throw new Error(await responseError(groupResponse, "Failed to load group."));
        }

        const groupData = await groupResponse.json();
        const [membersResponse, expensesResponse, usersResponse, balancesResponse] = await Promise.all([
          apiFetch(`/api/groups/${groupId}/members`, {
            signal: AbortSignal.timeout(15000),
          }),
          apiFetch(`/api/groups/${groupId}/expenses`, {
            signal: AbortSignal.timeout(15000),
          }),
          apiFetch("/api/users", {
            signal: AbortSignal.timeout(15000),
          }),
          apiFetch(`/api/groups/${groupId}/balances`, {
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
        if (!balancesResponse.ok) {
          throw new Error(await responseError(balancesResponse, "Failed to load group balances."));
        }

        const membersData = await membersResponse.json();
        const expensesData = await expensesResponse.json();
        const usersData = await usersResponse.json();
        const balancesData = await balancesResponse.json();

        setGroup(groupData);
        setMembers(membersData);
        setUsers(usersData);
        setExpenses(expensesData);
        setBalances(balancesData);
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
  const ownBalance = balances.find((balance) => String(balance.user_id) === String(user?.user_id))?.balance || 0;
  const outstandingBalance = balances.reduce((sum, balance) => sum + Math.abs(Number(balance.balance || 0)), 0) / 2;

  async function copyInviteLink() {
    setInviteState("");
    setInviteError("");
    try {
      const response = await apiFetch(`/api/groups/${groupId}/invites`, { method: "POST" });
      const result = await response.json();
      if (!response.ok || !result.token) throw new Error(result.error || "Unable to create an invite link.");
      const inviteUrl = `${window.location.origin}/join/${result.token}`;
      await navigator.clipboard.writeText(inviteUrl);
      setInviteState("Invite link copied · expires in 30 days");
    } catch (error) {
      setInviteError(error.message || "Unable to copy this invite link. Try again.");
    }
  }

  function toggleSelectedUser(userId) {
    setSelectedUsers((current) => current.includes(userId)
      ? current.filter((id) => id !== userId)
      : [...current, userId]);
    setMemberError("");
    setMemberSuccess("");
  }

  async function refreshMembers() {
    const response = await apiFetch(`/api/groups/${groupId}/members`);
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
        const response = await apiFetch(`/api/groups/${groupId}/members`, {
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

      <div className="group-header">
        <h1><span className="group-title-emoji" aria-hidden="true">🏖️</span>{group.group_name}</h1>
        <div className="group-member-summary">
          <div className="group-avatar-stack" aria-label={`${members.length} group members`}>
            {members.slice(0, 4).map((member) => <span className="group-member-avatar" key={member.user_id} title={member.name}>{memberFaces[Number(member.user_id) % memberFaces.length]}</span>)}
            {members.length > 4 && <span className="group-member-overflow">+{members.length - 4}</span>}
          </div>
          <p>{members.length} {members.length === 1 ? "member" : "members"} · Personal</p>
        </div>
      </div>

      <div className="group-balance-card group-summary-card">
        <div><p>Group Balance</p><h2>{money(outstandingBalance)}</h2></div>
        <div className={ownBalance >= 0 ? "group-own-balance is-credit" : "group-own-balance is-debit"}><small>{ownBalance >= 0 ? "You're owed" : "You owe"}</small><strong>{ownBalance >= 0 ? "+ " : "− "}{money(Math.abs(ownBalance))}</strong></div>
      </div>

      <div className="group-content-tabs" role="tablist" aria-label="Group sections">
        <button type="button" role="tab" aria-selected={activeTab === "Expenses"} className={activeTab === "Expenses" ? "selected" : ""} onClick={() => setActiveTab("Expenses")}>Expenses</button>
        <button type="button" role="tab" aria-selected={activeTab === "Members"} className={activeTab === "Members" ? "selected" : ""} onClick={() => setActiveTab("Members")}>Members</button>
        <button type="button" role="tab" onClick={() => navigate(`/group/${groupId}/settlement`)}>Settlements</button>
      </div>

      {activeTab === "Members" ? <>
      <section className="group-section group-members-list" role="tabpanel">
        <h3>Members <span>{members.length}</span></h3>
        {members.length === 0 ? <p className="member-empty">No members yet.</p> : members.map((member) => (
          <div className="group-member-row" key={member.user_id}>
            <span className="group-member-avatar">{memberFaces[Number(member.user_id) % memberFaces.length]}</span>
            <span>{member.name}{String(member.user_id) === String(user?.user_id) && <small> · You</small>}</span>
            <span className="group-member-role">{String(member.user_id) === String(group.created_by) ? "Creator" : "Member"}</span>
          </div>
        ))}
      </section>
      <section className="group-section add-participants-section" role="tabpanel">
        <div className="participants-heading">
          <div>
            <h3>Add Participants</h3>
            <p>Share a secure link to invite someone to this group.</p>
          </div>
          <span className="participants-count">{eligibleUsers.length} available</span>
        </div>

        {memberError && <p className="member-feedback member-feedback-error" role="alert">{memberError}</p>}
        {memberSuccess && <p className="member-feedback member-feedback-success" role="status">{memberSuccess}</p>}
        {inviteError && <p className="member-feedback member-feedback-error" role="alert">{inviteError}</p>}
        {inviteState && <p className="member-feedback member-feedback-success" role="status">{inviteState}</p>}
        <button className="share-invite-button" type="button" onClick={copyInviteLink}><span aria-hidden="true">⧉</span> Copy invite link</button>

        {eligibleUsers.length === 0 ? (
          <p className="participants-invite-hint">No other accounts to add here yet. New members can join from your invite link.</p>
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
      </> : <section className="group-section group-expenses-list" role="tabpanel">
        <div className="group-section-title"><h3>Expenses</h3><span>{expenses.length} total</span></div>
        {expenses.length === 0 ? <p className="group-empty-expenses">No expenses yet.</p> : expenses.map((expense, index) => (
          <article className="group-expense-row" key={expense.expense_id}>
            <span className="group-expense-avatar">{index % 2 ? "🥗" : "🍽️"}</span>
            <span className="group-expense-info"><strong>{expense.description}</strong><small>{new Date(expense.expense_date).toLocaleDateString("en-IN", { month: "short", day: "numeric" })} · {members.length} people</small></span>
            <span className="group-expense-value"><strong>{money(expense.amount)}</strong><small>paid by {expense.paid_by_name}</small></span>
          </article>
        ))}
      </section>}

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

    </div>
  );
}

export default GroupDetails;
