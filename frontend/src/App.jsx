import { BrowserRouter, Routes, Route, useNavigate } from "react-router-dom";
import "./App.css";

import GroupDetails from "./pages/groupdetails";
import AddExpense from "./pages/addexpense";
import Balances from "./pages/balances";
import Settlement from "./pages/settlement";

function Home() {
  const navigate = useNavigate();

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
        <h2>Good Afternoon 👋</h2>
        <p>Here’s your spending overview</p>
      </section>

      <section className="overview-card">
        <div className="overview-item">
          <p>You owe</p>
          <h1>₹1,240</h1>
        </div>

        <div className="overview-item">
          <p>You are owed</p>
          <h1>₹850</h1>
        </div>
      </section>

      <section className="section">
        <h3>Your Groups</h3>

        <div className="groups-scroll">

          <div
            className="group-card"
            onClick={() => navigate("/group/goa")}
            style={{ cursor: "pointer" }}
          >
            <div className="group-title">
              <span className="group-emoji">🏖️</span>
              <span>Goa Trip</span>
            </div>

            <p>8 members</p>
            <p>You owe</p>

            <strong>₹640</strong>
          </div>

          <div className="group-card">
            <div className="group-title">
              <span className="group-emoji">🏖️</span>
              <span>Goa Trip</span>
            </div>

            <p>8 members</p>
            <p>You owe</p>

            <strong>₹640</strong>
          </div>

        </div>
      </section>

      <section className="section activity-section">
        <h3>Recent Activity</h3>

        <div className="activity-row">
          <div className="activity-icon">🍽️</div>

          <div className="activity-info">
            <strong>Dinner</strong>
            <span>Goa Trip • Today</span>
          </div>

          <strong className="activity-amount">
            -₹640
          </strong>
        </div>

        <div className="activity-row">
          <div className="activity-icon">💳</div>

          <div className="activity-info">
            <strong>Hotel</strong>
            <span>Goa Trip • Yesterday</span>
          </div>

          <strong className="activity-amount">
            -₹1,200
          </strong>
        </div>

      </section>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>

      <Routes>

        {/* Home */}
        <Route
          path="/"
          element={<Home />}
        />

        {/* Group */}
        <Route
          path="/group/goa"
          element={<GroupDetails />}
        />

        {/* Add Expense */}
        <Route
          path="/group/goa/add-expense"
          element={<AddExpense />}
        />

        {/* Balances */}
        <Route
          path="/group/goa/balances"
          element={<Balances />}
        />

        {/* Settlement */}
        <Route
          path="/group/goa/settlement"
          element={<Settlement />}
        />

      </Routes>

    </BrowserRouter>
  );
}

export default App;