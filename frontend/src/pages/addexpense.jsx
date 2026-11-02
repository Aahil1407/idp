import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { apiFetch } from "../config";
import {
  calculateExpenseSplits,
  parseAmountToPaise,
  syncAllocationEntries,
  validateExpenseFields,
} from "../expense-splits";

async function getResponseError(response, fallback) {
  try {
    const body = await response.json();
    return body.error || body.message || fallback;
  } catch {
    return fallback;
  }
}

function evenAmountEntries(participantIds, amountPaise) {
  if (!Number.isSafeInteger(amountPaise) || amountPaise <= 0 || !participantIds.length) return {};
  const base = Math.floor(amountPaise / participantIds.length);
  const remainder = amountPaise % participantIds.length;
  return Object.fromEntries(participantIds.map((id, index) => [id, ((base + (index < remainder ? 1 : 0)) / 100).toFixed(2)]));
}

function evenPercentageEntries(participantIds) {
  if (!participantIds.length) return {};
  const base = Math.floor(10_000 / participantIds.length);
  const remainder = 10_000 % participantIds.length;
  return Object.fromEntries(participantIds.map((id, index) => [id, ((base + (index < remainder ? 1 : 0)) / 100).toFixed(2)]));
}

function AddExpense() {
  const navigate = useNavigate();
  const { groupId } = useParams();

  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [paidBy, setPaidBy] = useState("");
  const [selectedParticipants, setSelectedParticipants] = useState([]);
  const [amountEntries, setAmountEntries] = useState({});
  const [percentageEntries, setPercentageEntries] = useState({});
  const [splitType, setSplitType] = useState("Equal");
  const [members, setMembers] = useState([]);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [membersError, setMembersError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [step, setStep] = useState(1);
  const [memberSearch, setMemberSearch] = useState("");

  const loadMembers = useCallback(async () => {
    try {
      const response = await apiFetch(`/api/groups/${groupId}/members`, {
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) {
        throw new Error(await getResponseError(response, "Could not load this group's members."));
      }
      const data = await response.json();
      if (!Array.isArray(data)) throw new Error("The member list returned an invalid response.");
      setMembers(data);
    } catch (loadError) {
      console.error(loadError);
      setMembersError(loadError.name === "TimeoutError"
        ? "Loading members timed out. Check the connection and try again."
        : loadError.message || "Unable to load group members.");
    } finally {
      setLoadingMembers(false);
    }
  }, [groupId]);

  useEffect(() => {
    // Fetches are asynchronous; state updates happen after the network response.
    // oxlint-disable-next-line react/set-state-in-effect
    loadMembers();
  }, [loadMembers, reloadKey]);

  const memberIds = useMemo(() => new Set(members.map((member) => String(member.user_id))), [members]);

  const amountPaise = parseAmountToPaise(amount);
  const allocation = useMemo(() => calculateExpenseSplits({
    splitType,
    amountPaise,
    participantIds: selectedParticipants,
    amountEntries,
    percentageEntries,
  }), [splitType, amountPaise, selectedParticipants, amountEntries, percentageEntries]);

  function toggleParticipant(userId) {
    const nextParticipants = selectedParticipants.includes(userId)
      ? selectedParticipants.filter((id) => id !== userId)
      : [...selectedParticipants, userId];
    setSelectedParticipants(nextParticipants);
    setAmountEntries((entries) => ({ ...syncAllocationEntries(entries, nextParticipants), ...evenAmountEntries(nextParticipants, amountPaise) }));
    setPercentageEntries((entries) => ({ ...syncAllocationEntries(entries, nextParticipants), ...evenPercentageEntries(nextParticipants) }));
    setError("");
    setSuccess("");
  }

  function changeSplitType(type) {
    setSplitType(type);
    setError("");
    if (type === "Exact" || type === "Custom") {
      setAmountEntries((entries) => ({ ...entries, ...evenAmountEntries(selectedParticipants, amountPaise) }));
    } else if (type === "Percentage") {
      setPercentageEntries((entries) => ({ ...entries, ...evenPercentageEntries(selectedParticipants) }));
    }
  }

  function adjustAllocation(userId, rawValue) {
    const currentId = String(userId);
    const otherIds = selectedParticipants.filter((id) => id !== currentId);
    const isPercentage = splitType === "Percentage";
    const total = isPercentage ? 10_000 : amountPaise;
    if (!Number.isSafeInteger(total) || total <= 0) return;
    const selected = Number(rawValue);
    const remainder = total - selected;
    const base = otherIds.length ? Math.floor(remainder / otherIds.length) : 0;
    const entries = isPercentage ? { ...percentageEntries, [currentId]: (selected / 100).toFixed(2) } : { ...amountEntries, [currentId]: (selected / 100).toFixed(2) };
    otherIds.forEach((id, index) => {
      const portion = base + (index < remainder % Math.max(1, otherIds.length) ? 1 : 0);
      entries[id] = (portion / 100).toFixed(2);
    });
    if (isPercentage) setPercentageEntries(entries);
    else setAmountEntries(entries);
  }

  function retryLoadMembers() {
    setLoadingMembers(true);
    setMembersError("");
    setReloadKey((key) => key + 1);
  }

  async function handleAddExpense(event) {
    event.preventDefault();
    if (saving) return;
    setError("");
    setSuccess("");

    const validationError = validateExpenseFields({
      description,
      amountPaise,
      paidBy,
      participantIds: selectedParticipants,
      groupMemberIds: memberIds,
      splitType,
      requireParticipants: step === 2,
    });
    if (validationError) {
      setError(validationError);
      return;
    }

    if (step === 1) {
      setStep(2);
      return;
    }

    if (allocation.totalError || allocation.splits.length !== selectedParticipants.length) {
      setError(allocation.totalError || "Review participant allocations before saving.");
      return;
    }
    const splits = allocation.splits;

    setSaving(true);
    try {
      const expenseData = {
        paid_by: Number(paidBy),
        description: description.trim(),
        amount: amountPaise / 100,
        splits,
      };

      const response = await apiFetch(`/api/groups/${groupId}/expenses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(expenseData),
      });
      if (!response.ok) {
        throw new Error(await getResponseError(response, "Failed to create the expense."));
      }

      const result = await response.json();
      if (!result.expense_id) throw new Error("The server did not confirm the saved expense.");

      // Group Details reloads its expense list on mount after this navigation.
      setSuccess("Expense saved. Refreshing the group expense list…");
      window.setTimeout(() => navigate(`/group/${groupId}`, { state: { expenseCreated: true } }), 600);
    } catch (saveError) {
      console.error(saveError);
      setError(saveError.message || "Unable to add expense. Please try again.");
      setSaving(false);
    }
  }

  if (loadingMembers) {
    return (
      <div className="phone-app add-expense-page">
        <button className="back-button" onClick={() => navigate(`/group/${groupId}`)}>←</button>
        <div className="page-header">
          <h1>Add Expense</h1>
          <p role="status">Loading group members…</p>
        </div>
      </div>
    );
  }

  if (membersError) {
    return (
      <div className="phone-app add-expense-page">
        <button className="back-button" onClick={() => navigate(`/group/${groupId}`)}>←</button>
        <div className="page-header">
          <h1>Members unavailable</h1>
          <p>{membersError}</p>
        </div>
        <button className="balances-button" type="button" onClick={retryLoadMembers}>
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="phone-app add-expense-page">
      <button className="back-button" onClick={() => navigate(`/group/${groupId}`)}>←</button>

      <div className="page-header">
          <h1>{step === 1 ? "Add Expense" : "Bill splitting"}</h1>
          <p>{step === 1 ? `Group #${groupId}` : `${selectedParticipants.length} ${selectedParticipants.length === 1 ? "person" : "people"} · ${splitType} split`}</p>
      </div>

      {members.length === 0 ? (
        <p className="expense-state-message" role="alert">This group has no members yet. Add a participant before recording an expense.</p>
      ) : (
        <form className={step === 1 ? "expense-form form-step-entry" : "expense-form form-step-details"} onSubmit={handleAddExpense} noValidate>
          {step === 2 && <section className="expense-detail-summary"><div><span>{description}</span><small>{members.find((member) => String(member.user_id) === paidBy)?.name ? `Paid by ${members.find((member) => String(member.user_id) === paidBy).name}` : "Shared expense"}</small></div></section>}

          <div className="form-group expense-entry-field">
            <label htmlFor="expense-description">Expense name</label>
            <input
              id="expense-description"
              type="text"
              placeholder="e.g. Dinner"
              maxLength={500}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              disabled={saving}
            />
          </div>

          <div className="form-group expense-entry-field">
            <label htmlFor="expense-amount">Amount</label>
            <div className="amount-input">
              <span aria-hidden="true">₹</span>
              <input
                id="expense-amount"
                type="number"
                placeholder="0.00"
                min="0.01"
                step="0.01"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                disabled={saving}
              />
            </div>
          </div>

          <div className="form-group expense-entry-field">
            <label htmlFor="expense-payer">Paid by</label>
            <p className="expense-field-hint">Choose the group member who paid. This does not select them as a participant.</p>
            <select id="expense-payer" value={paidBy} onChange={(event) => setPaidBy(event.target.value)} disabled={saving}>
              <option value="">Choose a payer</option>
              {members.map((member) => (
                <option key={member.user_id} value={member.user_id}>{member.name}</option>
              ))}
            </select>
          </div>

          {step === 2 && <div className="split-method-detail">
            <span>Split method</span>
            <div className="split-options" role="group" aria-label="Choose expense split type">
              {["Equal", "Exact", "Percentage", "Custom"].map((type) => <button type="button" key={type} className={splitType === type ? "split-option active" : "split-option"} aria-label={`Split by ${type.toLowerCase()}`} aria-pressed={splitType === type} onClick={() => changeSplitType(type)} disabled={saving}>{type === "Percentage" ? "Percent" : type}</button>)}
            </div>
          </div>}

          {step === 2 && <label className="participant-search-bar">
            <span aria-hidden="true">⌕</span>
            <input type="search" value={memberSearch} onChange={(event) => setMemberSearch(event.target.value)} placeholder="Search name, email" aria-label="Search group members" />
          </label>}

          {step === 2 && <fieldset className="form-group expense-participants bill-participant-list">
            <legend>Select friends</legend>
            <p className="expense-field-hint">Choose who shares this bill. The payer joins only if selected.</p>
            <div className="allocation-list">
              {members.filter((member) => `${member.name || ""} ${member.email || ""}`.toLowerCase().includes(memberSearch.trim().toLowerCase())).map((member) => {
                const userId = String(member.user_id);
                const checked = selectedParticipants.includes(userId);
                if (!checked) {
                  return <label className="allocation-choice-row" key={userId}>
                    <input type="checkbox" checked={false} disabled={saving} onChange={() => toggleParticipant(userId)} />
                    <span className="allocation-avatar" aria-hidden="true">{member.name?.charAt(0)?.toUpperCase() || "?"}</span>
                    <span className="allocation-person-name">{member.name || "Group member"}</span>
                    <span className="allocation-add-mark" aria-hidden="true">＋</span>
                  </label>;
                }

                const isPercentage = splitType === "Percentage";
                const entryMap = isPercentage ? percentageEntries : amountEntries;
                const fieldError = allocation.fieldErrors[userId];
                const currentSplitAmount = allocation.splits.find((split) => String(split.user_id) === userId)?.amount_owed;
                const rawPaise = isPercentage ? Math.round(amountPaise * Number(entryMap[userId] || 0) / 100) : parseAmountToPaise(entryMap[userId]);
                const currentPaise = currentSplitAmount === undefined ? (Number.isSafeInteger(rawPaise) ? rawPaise : 0) : Math.round(currentSplitAmount * 100);
                const rangeTotal = isPercentage ? 10_000 : amountPaise;
                const rangeValue = isPercentage ? Math.round(Number(entryMap[userId] || 0) * 100) : currentPaise;
                const rangeMaximum = Number.isSafeInteger(rangeTotal) ? Math.max(1, rangeTotal - Math.max(0, selectedParticipants.length - 1)) : 1;
                const rangePercent = rangeTotal > 0 ? Math.min(100, rangeValue / rangeTotal * 100) : 0;
                return <div className={fieldError ? "allocation-row allocation-row-reference allocation-invalid" : "allocation-row allocation-row-reference"} key={userId}>
                  <div className="allocation-row-heading">
                    <label className="allocation-person-check">
                      <input type="checkbox" checked={true} disabled={saving} onChange={() => toggleParticipant(userId)} aria-label={`Remove ${member.name} from this split`} />
                      <span className="allocation-avatar" aria-hidden="true">{member.name?.charAt(0)?.toUpperCase() || "?"}</span>
                    </label>
                    <span className="allocation-person-name">{member.name || "Group member"}</span>
                    <strong className="allocation-current-amount">₹{(currentPaise / 100).toFixed(2)}</strong>
                  </div>
                  <div className="allocation-range-wrap">
                    <div className="allocation-range-track" aria-hidden="true"><span style={{ width: `${rangePercent}%` }} /></div>
                    <input className="allocation-range" type="range" min="1" max={rangeMaximum} step="1" value={Math.min(rangeMaximum, Math.max(1, rangeValue || 1))} aria-label={`${member.name || "Member"} allocation`} aria-valuetext={isPercentage ? `${(rangeValue / 100).toFixed(2)} percent` : `₹${(rangeValue / 100).toFixed(2)}`} disabled={saving || selectedParticipants.length < 2 || splitType === "Equal" || !Number.isSafeInteger(amountPaise)} onChange={(event) => { adjustAllocation(userId, event.target.value); setError(""); }} />
                  </div>
                  {isPercentage && <span className="allocation-percent-label">{Number(entryMap[userId] || 0).toFixed(2)}%</span>}
                  {fieldError && <span className="allocation-field-error" role="alert">{fieldError}</span>}
                </div>;
              })}
              {members.every((member) => !`${member.name || ""} ${member.email || ""}`.toLowerCase().includes(memberSearch.trim().toLowerCase())) && <p className="member-feedback">No members match that search.</p>}
            </div>
          </fieldset>}

          {step === 2 && <div className={allocation.totalError ? "allocation-total allocation-total-invalid" : "allocation-total allocation-total-valid"} aria-live="polite">
            <span>Total bill</span>
            <strong>₹{Number.isSafeInteger(amountPaise) ? (amountPaise / 100).toFixed(2) : "—"}</strong>
            <small>{selectedParticipants.length ? allocation.totalError || `${selectedParticipants.length} people · ${splitType} split` : "Select at least one person to share this bill."}</small>
          </div>}

          {error && <p className="expense-state-message expense-state-error" role="alert">{error}</p>}
          {success && <p className="expense-state-message expense-state-success" role="status">{success}</p>}

          {step === 2 && <button type="button" className="expense-review-back" onClick={() => setStep(1)} disabled={saving}>← Edit expense</button>}
          <button type="submit" className="add-expense-button submit-expense" disabled={saving}>
            {saving ? <><span className="group-spinner" aria-hidden="true" /> Saving expense…</> : step === 1 ? "Next →" : "Send bill →"}
          </button>
        </form>
      )}
    </div>
  );
}

export default AddExpense;
