import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { API_URL, GROUP_ID } from "../config";

function AddExpense() {
  const navigate = useNavigate();

  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [paidBy, setPaidBy] = useState("");
  const [splitType, setSplitType] = useState("Equal");

  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // =========================
  // LOAD GROUP MEMBERS
  // =========================

  useEffect(() => {
    async function loadMembers() {
      try {
        const response = await fetch(
          `${API_URL}/api/groups/${GROUP_ID}/members`
        );

        if (!response.ok) {
          throw new Error("Failed to load members.");
        }

        const data = await response.json();

        setMembers(data);

        // Default payer = first member
        if (data.length > 0) {
          setPaidBy(String(data[0].user_id));
        }
      } catch (err) {
        console.error(err);
        setError("Unable to load group members.");
      } finally {
        setLoading(false);
      }
    }

    loadMembers();
  }, []);

  // =========================
  // ADD EXPENSE
  // =========================

  async function handleAddExpense(e) {
    e.preventDefault();

    if (!description.trim() || !amount) {
      alert("Please enter an expense name and amount.");
      return;
    }

    const numericAmount = Number(amount);

    if (numericAmount <= 0) {
      alert("Amount must be greater than 0.");
      return;
    }

    if (members.length === 0) {
      alert("No group members found.");
      return;
    }

    // Backend integration currently supports Equal split
    if (splitType !== "Equal") {
      alert(
        "Equal split is currently supported. Exact, Percentage and Custom will be added later."
      );
      return;
    }

    try {
      setSaving(true);
      setError("");

      const share = numericAmount / members.length;

      const expenseData = {
        paid_by: Number(paidBy),
        description: description.trim(),
        amount: numericAmount,

        splits: members.map((member) => ({
          user_id: member.user_id,
          amount_owed: Number(share.toFixed(2)),
        })),
      };

      console.log("Sending expense:", expenseData);

      const response = await fetch(
        `${API_URL}/api/groups/${GROUP_ID}/expenses`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(expenseData),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.message || "Failed to create expense."
        );
      }

      console.log("Expense created:", result);

      // Return to Group Details.
      // Group Details will fetch the latest expenses from backend.
      navigate("/group/goa");

    } catch (err) {
      console.error(err);

      setError(
        err.message ||
          "Unable to add expense. Please try again."
      );
    } finally {
      setSaving(false);
    }
  }

  // =========================
  // LOADING
  // =========================

  if (loading) {
    return (
      <div className="phone-app add-expense-page">
        <div className="page-header">
          <h1>Loading...</h1>
          <p>Getting group members</p>
        </div>
      </div>
    );
  }

  // =========================
  // ERROR
  // =========================

  if (error && members.length === 0) {
    return (
      <div className="phone-app add-expense-page">
        <button
          className="back-button"
          onClick={() => navigate("/group/goa")}
        >
          ←
        </button>

        <div className="page-header">
          <h1>Something went wrong</h1>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  // =========================
  // PAGE
  // =========================

  return (
    <div className="phone-app add-expense-page">

      {/* Back */}
      <button
        className="back-button"
        onClick={() => navigate("/group/goa")}
      >
        ←
      </button>

      <div className="page-header">
        <h1>Add Expense</h1>
        <p>Goa Trip</p>
      </div>

      <form onSubmit={handleAddExpense}>

        {/* Expense name */}
        <div className="form-group">
          <label>Expense name</label>

          <input
            type="text"
            placeholder="e.g. Dinner"
            value={description}
            onChange={(e) =>
              setDescription(e.target.value)
            }
          />
        </div>

        {/* Amount */}
        <div className="form-group">
          <label>Amount</label>

          <div className="amount-input">
            <span>₹</span>

            <input
              type="number"
              placeholder="0"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) =>
                setAmount(e.target.value)
              }
            />
          </div>
        </div>

        {/* Paid by */}
        <div className="form-group">
          <label>Paid by</label>

          <select
            value={paidBy}
            onChange={(e) =>
              setPaidBy(e.target.value)
            }
          >
            {members.map((member) => (
              <option
                key={member.user_id}
                value={member.user_id}
              >
                {member.name}
              </option>
            ))}
          </select>
        </div>

        {/* Split method */}
        <div className="form-group">
          <label>Split method</label>

          <div className="split-options">
            {[
              "Equal",
              "Exact",
              "Percentage",
              "Custom",
            ].map((type) => (
              <button
                type="button"
                key={type}
                className={
                  splitType === type
                    ? "split-option active"
                    : "split-option"
                }
                onClick={() =>
                  setSplitType(type)
                }
              >
                {type}
              </button>
            ))}
          </div>
        </div>

        {/* Participants */}
        <div className="form-group">
          <label>Participants</label>

          <div className="participants">
            {members.map((member) => (
              <div
                className="participant"
                key={member.user_id}
              >
                <div className="avatar">
                  {member.name.charAt(0)}
                </div>

                <span>{member.name}</span>

                <span className="check">✓</span>
              </div>
            ))}
          </div>
        </div>

        {/* Error */}
        {error && (
          <p
            style={{
              color: "#ff6b6b",
              marginBottom: "12px",
            }}
          >
            {error}
          </p>
        )}

        {/* Submit */}
        <button
          type="submit"
          className="add-expense-button submit-expense"
          disabled={saving}
        >
          {saving ? "Adding..." : "Add Expense"}
        </button>

      </form>
    </div>
  );
}

export default AddExpense;