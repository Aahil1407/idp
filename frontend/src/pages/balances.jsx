import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { API_URL, CURRENT_USER_ID } from "../config";

function Balances() {
  const navigate = useNavigate();
  const { groupId } = useParams();

  const [balances, setBalances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // =========================
  // LOAD BALANCES
  // =========================

  useEffect(() => {
    async function loadBalances() {
      try {
        setLoading(true);
        setError("");

        const response = await fetch(
          `${API_URL}/api/groups/${groupId}/balances`
        );

        if (!response.ok) {
          throw new Error("Failed to load balances.");
        }

        const data = await response.json();

        console.log("Backend balances:", data);

        setBalances(data);
      } catch (err) {
        console.error(err);

        setError(
          "Unable to load balances. Please make sure the backend is running."
        );
      } finally {
        setLoading(false);
      }
    }

    loadBalances();
  }, [groupId]);

  // =========================
  // LOADING
  // =========================

  if (loading) {
    return (
      <div className="phone-app balances-page">
        <div className="page-header">
          <h1>Loading...</h1>
          <p>Calculating group balances</p>
        </div>
      </div>
    );
  }

  // =========================
  // ERROR
  // =========================

  if (error) {
    return (
      <div className="phone-app balances-page">
        <button
          className="back-button"
          onClick={() => navigate(`/group/${groupId}`)}
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
  // FIND YOUR BALANCE
  // =========================

  // Temporary development assumption:
  // Sid is user_id 1 in the current backend database.
    const currentUser = balances.find(
  (person) => person.user_id === CURRENT_USER_ID
);

const yourBalance = currentUser?.balance ?? 0;

  // =========================
  // PAGE
  // =========================

  return (
    <div className="phone-app balances-page">

      {/* Back */}
      <button
        className="back-button"
        onClick={() => navigate(`/group/${groupId}`)}
      >
        ←
      </button>

      {/* Header */}
      <div className="page-header">
        <h1>Balances</h1>
        <p>Group #{groupId} • {balances.length} members</p>
      </div>

      {/* Your Balance */}
      <div className="your-balance-card">
        <p>Your net balance</p>

        <h2>
          {yourBalance >= 0 ? "+" : "-"}₹
          {Math.abs(yourBalance).toLocaleString("en-IN")}
        </h2>

        <span>
          {yourBalance >= 0
            ? "You are owed"
            : "You owe"}
        </span>
      </div>

      {/* Group Balances */}
      <section className="balance-section">
        <h3>Group Balances</h3>

        {balances.map((person) => {
          const balance = Number(person.balance);

          return (
            <div
              className="balance-row"
              key={person.user_id}
            >
              <div className="balance-person">

                <div className="avatar">
                  {person.name.charAt(0)}
                </div>

                <span>{person.name}</span>

              </div>

              <div
                className={
                  balance >= 0
                    ? "balance-positive"
                    : "balance-negative"
                }
              >
                {balance >= 0 ? "+" : "-"}₹
                {Math.abs(balance).toLocaleString("en-IN")}
              </div>
            </div>
          );
        })}
      </section>

      {/* Settlement */}
      <button
        className="add-expense-button"
        onClick={() =>
          navigate(`/group/${groupId}/settlement`)
        }
      >
        View Settlement Plan
      </button>

    </div>
  );
}

export default Balances;
