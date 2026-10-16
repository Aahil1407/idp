import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { API_URL } from "../config";

const formatAmount = (amount) => new Intl.NumberFormat("en-IN", {
  style: "currency", currency: "INR", maximumFractionDigits: 2,
}).format(Number(amount) || 0);

function Settlement() {
  const navigate = useNavigate();
  const { groupId } = useParams();
  const [settlements, setSettlements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadSettlement() {
      try {
        setLoading(true);
        setError("");
        const response = await fetch(`${API_URL}/api/groups/${groupId}/settlements/optimize`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || data.message || "Failed to generate settlement.");
        setSettlements(data.settlements || []);
      } catch (err) {
        setError(err.message || "Unable to load settlement plan.");
      } finally {
        setLoading(false);
      }
    }
    loadSettlement();
  }, [groupId]);

  if (loading) return <div className="phone-app settlement-page"><div className="page-header"><h1>Settlement Plan</h1><p>Calculating optimized payments…</p></div></div>;

  return (
    <div className="phone-app settlement-page">
      <button className="back-button" onClick={() => navigate(`/group/${groupId}/balances`)}>←</button>
      <div className="page-header"><h1>Settlement Plan</h1><p>Group #{groupId}</p></div>
      <div className="settlement-info-card"><p>Optimized settlement</p><span>Transfer amounts are calculated by the group settlement API.</span></div>
      {error ? <p className="home-state home-error" role="alert">{error}</p> : (
        <section className="settlement-section">
          <h3>Payments</h3>
          {settlements.length === 0 ? <p className="no-settlement">Everyone is settled up.</p> : settlements.map((settlement, index) => (
            <div className="settlement-card" key={`${settlement.from_user}-${settlement.to_user}-${index}`}>
              <div className="settlement-left">
                <div className="settlement-avatar" aria-hidden="true">{settlement.from_name?.charAt(0) || "?"}</div>
                <div className="settlement-details">
                  <div className="settlement-person"><span className="settlement-person-label">Payer</span><strong className="settlement-person-name">{settlement.from_name}</strong></div>
                  <span className="settlement-arrow" aria-hidden="true">→</span>
                  <div className="settlement-person"><span className="settlement-person-label">Recipient</span><strong className="settlement-person-name">{settlement.to_name}</strong></div>
                </div>
              </div>
              <div className="settlement-right"><span className="settlement-label">pays</span><strong className="settlement-amount">{formatAmount(settlement.amount)}</strong></div>
            </div>
          ))}
        </section>
      )}
      {!error && settlements.length > 0 && <p className="settlement-unavailable" role="status">Settlement recording is unavailable because this backend does not store payments against a group. No payment has been recorded or transferred.</p>}
      <button className="add-expense-button" onClick={() => navigate(`/group/${groupId}/balances`)}>Back to Balances</button>
    </div>
  );
}

export default Settlement;
