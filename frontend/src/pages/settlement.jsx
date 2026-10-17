import { useEffect, useRef, useState } from "react";
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
  const [recordingKey, setRecordingKey] = useState("");
  const [paymentIds, setPaymentIds] = useState({});
  const [settledKeys, setSettledKeys] = useState({});
  const [errors, setErrors] = useState({});
  const [loadError, setLoadError] = useState("");
  const recordingRef = useRef(false);

  useEffect(() => {
    async function loadSettlement() {
      try {
        setLoading(true);
        setLoadError("");
        const response = await fetch(`${API_URL}/api/groups/${groupId}/settlements/optimize`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || data.message || "Failed to generate settlement.");
        setSettlements(data.settlements || []);
      } catch (err) {
        setLoadError(err.message || "Unable to load settlement plan.");
      } finally {
        setLoading(false);
      }
    }
    loadSettlement();
  }, [groupId]);

  async function handleRecordSettlement(settlement, key) {
    if (recordingRef.current) return;
    recordingRef.current = true;
    try {
      setRecordingKey(key);
      setErrors((current) => ({ ...current, [key]: "" }));

      let paymentId = paymentIds[key];
      if (!paymentId) {
        const createResponse = await fetch(`${API_URL}/api/settlements/pay`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            group_id: Number(groupId),
            from_user: settlement.from_user,
            to_user: settlement.to_user,
            amount: Number(settlement.amount),
          }),
        });
        const created = await createResponse.json();
        if (!createResponse.ok) throw new Error(created.error || created.message || "Could not record settlement.");
        if (!created.payment_id) throw new Error("The server did not return a payment ID.");
        paymentId = created.payment_id;
        setPaymentIds((current) => ({ ...current, [key]: paymentId }));
      }

      const settleResponse = await fetch(`${API_URL}/api/settlements/${paymentId}/settle`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
      });
      const settled = await settleResponse.json();
      if (!settleResponse.ok || settled.status !== "settled") {
        throw new Error(settled.error || settled.message || "The server did not confirm the settled status.");
      }
      setSettledKeys((current) => ({ ...current, [key]: true }));
    } catch (err) {
      setErrors((current) => ({ ...current, [key]: err.message || "Unable to record settlement." }));
    } finally {
      recordingRef.current = false;
      setRecordingKey("");
    }
  }

  if (loading) return <div className="phone-app settlement-page"><div className="page-header"><h1>Settlement Plan</h1><p>Calculating optimized payments…</p></div></div>;

  return (
    <div className="phone-app settlement-page">
      <button className="back-button" onClick={() => navigate(`/group/${groupId}/balances`)}>←</button>
      <div className="page-header"><h1>Settlement Plan</h1><p>Group #{groupId}</p></div>
      <div className="settlement-info-card">
        <p>Optimized settlement</p>
        <span>Suggested amounts come from the backend. Recording a settled status updates SmartSplit only; it does not transfer money or confirm a bank payment.</span>
      </div>
      {loadError ? <p className="home-state home-error" role="alert">{loadError}</p> : (
        <section className="settlement-section">
          <h3>Payments</h3>
          {settlements.length === 0 ? <p className="no-settlement">Everyone is settled up.</p> : settlements.map((settlement, index) => {
            const key = `${settlement.from_user}-${settlement.to_user}-${index}`;
            return (
              <div className="settlement-entry" key={key}>
                <div className="settlement-card">
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
                {settledKeys[key] ? <p className="settlement-recorded" role="status">Settled in SmartSplit</p> : (
                  <>
                    <button className="settle-button" onClick={() => handleRecordSettlement(settlement, key)} disabled={Boolean(recordingKey)}>
                      {recordingKey === key ? "Saving…" : paymentIds[key] ? "Retry status update" : "Confirm settled in SmartSplit"}
                    </button>
                    {errors[key] && <p className="settlement-error" role="alert">{errors[key]}</p>}
                  </>
                )}
              </div>
            );
          })}
        </section>
      )}
      <button className="add-expense-button" onClick={() => navigate(`/group/${groupId}/balances`)}>Back to Balances</button>
    </div>
  );
}

export default Settlement;
