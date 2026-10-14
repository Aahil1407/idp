import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { API_URL, GROUP_ID } from "../config";

function Settlement() {
  const navigate = useNavigate();

  const [settlements, setSettlements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [settling, setSettling] = useState(false);
  const [error, setError] = useState("");
  const [settled, setSettled] = useState(false);

  // ==============================
  // LOAD OPTIMIZED SETTLEMENT
  // ==============================

  useEffect(() => {
    async function loadSettlement() {
      try {
        setLoading(true);
        setError("");

        const response = await fetch(
          `${API_URL}/api/groups/${GROUP_ID}/settlements/optimize`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
          }
        );

        const data = await response.json();

        if (!response.ok) {
          throw new Error(
            data.message || "Failed to generate settlement."
          );
        }

        console.log("Backend settlement:", data);

        setSettlements(data.settlements || []);
      } catch (err) {
        console.error(err);

        setError(
          err.message ||
            "Unable to load settlement plan."
        );
      } finally {
        setLoading(false);
      }
    }

    loadSettlement();
  }, []);

  // ==============================
  // MARK AS SETTLED
  // ==============================

  async function handleSettlement() {
    if (settlements.length === 0) {
      return;
    }

    try {
      setSettling(true);
      setError("");

      // Process every settlement returned by backend
      for (const settlement of settlements) {

        // ------------------------------
        // 1. CREATE PAYMENT
        // ------------------------------

        const paymentResponse = await fetch(
          `${API_URL}/api/settlements/pay`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from_user: settlement.from_user,
              to_user: settlement.to_user,
              amount: Number(settlement.amount),
            }),
          }
        );

        const paymentData = await paymentResponse.json();

        if (!paymentResponse.ok) {
          throw new Error(
            paymentData.message ||
              "Failed to create payment."
          );
        }

        const paymentId = paymentData.payment_id;

        if (!paymentId) {
          throw new Error(
            "Backend did not return a payment ID."
          );
        }

        console.log(
          "Payment created:",
          paymentId
        );

        // ------------------------------
        // 2. MARK PAYMENT AS SETTLED
        // ------------------------------

        const settleResponse = await fetch(
          `${API_URL}/api/settlements/${paymentId}/settle`,
          {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
            },
          }
        );

        const settleData =
          await settleResponse.json();

        if (!settleResponse.ok) {
          throw new Error(
            settleData.message ||
              "Failed to settle payment."
          );
        }

        console.log(
          "Payment settled:",
          settleData
        );
      }

      // Only show success AFTER all payments succeed
      setSettled(true);

    } catch (err) {
      console.error(err);

      setError(
        err.message ||
          "Unable to complete settlement."
      );
    } finally {
      setSettling(false);
    }
  }

  // ==============================
  // LOADING
  // ==============================

  if (loading) {
    return (
      <div className="phone-app settlement-page">
        <div className="page-header">
          <h1>Settlement Plan</h1>
          <p>Calculating optimized payments...</p>
        </div>
      </div>
    );
  }

  // ==============================
  // PAGE
  // ==============================

  return (
    <div className="phone-app settlement-page">

      {/* Back button */}
      <button
        className="back-button"
        onClick={() =>
          navigate("/group/goa/balances")
        }
        disabled={settling}
      >
        ←
      </button>

      {/* Header */}
      <div className="page-header">
        <h1>Settlement Plan</h1>
        <p>Goa Trip</p>
      </div>

      {/* =========================
          SETTLED STATE
      ========================= */}

      {settled ? (
        <>
          <div className="settled-success-card">

            <div className="settled-icon">
              ✓
            </div>

            <h2>Settlement Complete</h2>

            <p>
              All outstanding payments have been
              marked as settled.
            </p>

          </div>

          <button
            className="add-expense-button"
            onClick={() =>
              navigate("/group/goa")
            }
          >
            Back to Group
          </button>
        </>

      ) : (

        <>
          {/* =========================
              SETTLEMENT INFO
          ========================= */}

          <div className="settlement-info-card">

            <p>Optimized settlement</p>

            <span>
              SmartSplit has minimized the number
              of payments.
            </span>

          </div>

          {/* =========================
              PAYMENTS
          ========================= */}

          <section className="settlement-section">

            <h3>Payments</h3>

            {settlements.length === 0 ? (

              <p className="no-settlement">
                Everyone is settled up 🎉
              </p>

            ) : (

              settlements.map(
                (settlement, index) => (

                  <div
                    className="settlement-card"
                    key={index}
                  >

                    <div className="settlement-left">

                      <div className="settlement-avatar">
                        {settlement.from_name.charAt(0)}
                      </div>

                      <div className="settlement-details">

                        <strong>
                          {settlement.from_name}
                        </strong>

                        <span className="settlement-arrow">
                          →
                        </span>

                        <strong>
                          {settlement.to_name}
                        </strong>

                      </div>

                    </div>

                    <div className="settlement-right">

                      <span className="settlement-label">
                        pays
                      </span>

                      <strong className="settlement-amount">
                        ₹
                        {Number(
                          settlement.amount
                        ).toLocaleString(
                          "en-IN",
                          {
                            maximumFractionDigits: 0,
                          }
                        )}
                      </strong>

                    </div>

                  </div>
                )
              )

            )}

          </section>

          {/* =========================
              ERROR
          ========================= */}

          {error && (
            <p
              style={{
                color: "#ff6b6b",
                marginBottom: "16px",
              }}
            >
              {error}
            </p>
          )}

          {/* =========================
              MARK AS SETTLED
          ========================= */}

          {settlements.length > 0 && (

            <button
              className="settle-button"
              onClick={handleSettlement}
              disabled={settling}
            >
              {settling
                ? "Processing..."
                : "✓ Mark as Settled"}
            </button>

          )}

          {/* =========================
              BACK
          ========================= */}

          <button
            className="add-expense-button"
            onClick={() =>
              navigate("/group/goa/balances")
            }
            disabled={settling}
          >
            Back to Balances
          </button>

        </>
      )}

    </div>
  );
}

export default Settlement;