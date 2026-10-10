# SMARTSPLIT MASTER SPECIFICATION

Last Updated: 21 September 2026

---

# 1. PROJECT

## Project Name

SmartSplit

## Current Phase

Personal Mode frontend prototype + backend ready for integration.

## Core Concept

SmartSplit is a multi-party financial obligation and settlement platform.

The generalized flow is:

Transaction / Expense
→ Allocation / Split
→ Obligations
→ Net Balances
→ Settlement Optimization
→ Settlement

The current working prototype demonstrates this through a group expense use case.

---

# 2. TEAM

## Frontend / UI

Aahil Ahamed S
Student ID: 25BCE1478

Responsibilities:

- Figma / UI/UX
- React frontend
- React Router
- Frontend state
- Frontend interactions
- Expense UI
- Balance UI
- Settlement UI
- Frontend testing
- API integration

## Backend / Database

Teammate: Siddhartha Banerjee
Student ID: 25BCE5265

Responsibilities:

- Node.js
- Express
- MySQL
- Database schema
- REST APIs
- Backend validation
- Balance calculation
- Settlement optimization
- Payment persistence
- Backend testing

---

# 3. TECHNOLOGY STACK

## Frontend

- React
- Vite
- JavaScript / JSX
- React Router
- CSS
- Figma

## Backend

- Node.js
- Express
- MySQL
- mysql2
- CORS

## Database

MySQL database:

smartsplit

---

# 4. CURRENT FRONTEND STATUS

The frontend is currently a working React/Vite prototype.

Current pages:

/
    Home

/group/goa
    Group Details

/group/goa/add-expense
    Add Expense

/group/goa/balances
    Balances

/group/goa/settlement
    Settlement Plan

---

# 5. CURRENT FRONTEND FLOW

Home
↓
Goa Trip
↓
Group Details
↓
Add Expense
↓
Expense saved
↓
Balances
↓
Settlement Plan
↓
Mark as Settled
↓
Settlement Complete

This entire flow currently works using React state.

---

# 6. FRONTEND DESIGN

Figma:

https://www.figma.com/design/JUidq6YgeGudDehJ0EJwG7/smartsplit?node-id=0-1&t=TVTYgQUwexWT28XW-1

Current design characteristics:

- Mobile-first
- 393 × 852 reference frame
- Dark / black background
- Mint green cards
- Cyan accents
- Rounded cards
- Minimal UI
- Premium dark aesthetic

The React application currently displays the mobile UI centered in the browser.

Desktop responsiveness is not currently the priority.

---

# 7. FRONTEND FILE STRUCTURE

Current structure:

src/

├── pages/
│   ├── addexpense.jsx
│   ├── balances.jsx
│   ├── groupdetails.jsx
│   └── settlement.jsx
│
├── App.jsx
├── App.css
└── index.css

---

# 8. CURRENT FRONTEND DATA MODEL

Current frontend expense object:

{
  id,
  description,
  amount,
  paidBy,
  splitType,
  participants,
  share
}

Example:

{
  id: 123,
  description: "Lunch",
  amount: 1000,
  paidBy: "Rahul",
  splitType: "Equal",
  participants: [
    "Aahil",
    "Siddhartha",
    "Rahul",
    "Arjun"
  ],
  share: 250
}

IMPORTANT:

This is temporary frontend state.

The backend database is now the source of truth once integration begins.

---

# 9. CURRENT FRONTEND DEMO USERS

Current frontend demo users:

- Aahil
- Siddhartha
- Rahul
- Arjun

IMPORTANT:

Do NOT hardcode these users or their IDs in the final API integration.

Frontend must use user IDs returned by the backend.

---

# 10. CURRENT FRONTEND DEMO GROUP

Current demo group:

Goa Trip

The UI displays:

8 members

However, the current frontend calculation only uses these four demo users:

- Aahil
- Siddhartha
- Rahul
- Arjun

Do not assume eight actual database users currently exist.

---

# 11. ADD EXPENSE PAGE

Route:

/group/goa/add-expense

Current UI fields:

- Expense name
- Amount
- Paid by
- Split method
- Participants

Split method UI contains:

- Equal
- Exact
- Percentage
- Custom

IMPORTANT:

Currently only Equal splitting is actually calculated in the frontend.

Exact / Percentage / Custom are UI options but their calculation logic has not yet been implemented.

Backend should support these modes eventually.

---

# 12. CURRENT BALANCE LOGIC

For each expense:

Person who paid:

balance += full expense amount

Each participant:

balance -= their share

Therefore:

balance = total paid - total owed

Interpretation:

balance > 0
→ person is owed money

balance < 0
→ person owes money

Important invariant:

Sum of all balances ≈ 0

---

# 13. CURRENT SETTLEMENT ALGORITHM

Current frontend uses a greedy settlement algorithm.

Process:

1. Calculate all net balances.
2. Separate debtors and creditors.
3. Select a debtor.
4. Select a creditor.
5. Payment = minimum(debtor debt, creditor credit).
6. Create debtor → creditor payment.
7. Reduce both balances.
8. Move to the next debtor/creditor when one reaches zero.
9. Continue until all balances are settled.

This is currently implemented in:

src/pages/settlement.jsx

IMPORTANT:

The backend already implements settlement optimization.

Once integration begins, the frontend should stop calculating settlements itself and use the backend settlement API.

---

# 14. MARK AS SETTLED

Frontend currently has:

✓ Mark as Settled

This currently only changes React state.

It is NOT persistent.

Once backend integration is complete:

Frontend should use the backend payment APIs.

---

# 15. CURRENT FRONTEND LOCAL NETWORK

Frontend can run on the local network using:

npm run dev -- --host

Example network URL:

http://192.168.1.14:5173/

The frontend has already been successfully tested on a phone over Wi-Fi.

---

# 16. BACKEND STATUS

Backend is already implemented for Personal Mode.

Backend stack:

- Node.js
- Express
- MySQL
- mysql2
- CORS

Backend server:

http://localhost:5000

Database:

smartsplit

Backend folder:

backend/

├── server.js
├── db.js
├── package.json
└── package-lock.json

---

# 17. BACKEND DATABASE TABLES

Current tables:

users

groups_table

group_members

expenses

expense_splits

payments

---

# 18. USERS TABLE

Fields:

user_id
name
email
phone
upi_id
created_at

Current create-user API requires:

- name
- email

Example:

POST /api/users

Body:

{
  "name": "Sid",
  "email": "sid@example.com",
  "phone": "9876543210",
  "upi_id": "sid@upi"
}

Response:

{
  "message": "User created successfully!",
  "user_id": 1
}

---

# 19. GROUPS TABLE

Fields:

group_id
group_name
created_by
created_at

Create group:

POST /api/groups

Body:

{
  "group_name": "Goa Trip",
  "created_by": 1
}

---

# 20. GROUP MEMBERS

Table:

group_members

Fields:

group_id
user_id

Add member:

POST /api/groups/:id/members

Body:

{
  "user_id": 2
}

Get members:

GET /api/groups/:id/members

---

# 21. EXPENSE TABLE

Fields:

expense_id
group_id
paid_by
description
amount
expense_date

---

# 22. EXPENSE SPLITS TABLE

Fields:

expense_id
user_id
amount_owed

---

# 23. PAYMENTS TABLE

Fields:

payment_id
from_user
to_user
amount
payment_date
status

Payment status:

pending

or:

settled

---

# 24. CREATE EXPENSE API

Endpoint:

POST /api/groups/:id/expenses

Example:

POST /api/groups/1/expenses

Request:

{
  "paid_by": 1,
  "description": "Dinner",
  "amount": 1000,
  "splits": [
    {
      "user_id": 1,
      "amount_owed": 500
    },
    {
      "user_id": 2,
      "amount_owed": 500
    }
  ]
}

Backend validates:

- amount > 0
- splits exists
- splits is an array
- splits is not empty
- every split has user_id
- every split has amount_owed
- amount_owed > 0
- split total equals expense total
- payer belongs to group
- every split user belongs to group

Expense creation and split creation occur inside a database transaction.

---

# 25. GET EXPENSES API

Endpoint:

GET /api/groups/:id/expenses

Example:

GET /api/groups/1/expenses

Returns:

- expense_id
- description
- amount
- paid_by
- paid_by_name
- expense_date

---

# 26. BALANCE API

Endpoint:

GET /api/groups/:id/balances

Example:

GET /api/groups/1/balances

Example response:

[
  {
    "user_id": 1,
    "name": "Sid",
    "total_paid": 3400,
    "total_owed": 1100,
    "balance": 2300
  },
  {
    "user_id": 2,
    "name": "Rahul",
    "total_paid": 0,
    "total_owed": 1100,
    "balance": -1100
  }
]

Interpretation:

balance > 0
→ receive money

balance < 0
→ owes money

Important invariant:

Balances should sum to approximately zero.

---

# 27. SETTLEMENT OPTIMIZATION API

Endpoint:

POST /api/groups/:id/settlements/optimize

Example:

POST /api/groups/1/settlements/optimize

No request body.

The backend calculates optimized settlement payments.

Example response:

{
  "group_id": 1,
  "settlements": [
    {
      "from_user": 2,
      "from_name": "Rahul",
      "to_user": 1,
      "to_name": "Sid",
      "amount": 1100
    },
    {
      "from_user": 3,
      "from_name": "Siddhartha",
      "to_user": 1,
      "to_name": "Sid",
      "amount": 600
    },
    {
      "from_user": 4,
      "from_name": "Arjun",
      "to_user": 1,
      "to_name": "Sid",
      "amount": 600
    }
  ]
}

IMPORTANT:

Frontend should use this API instead of calculating settlements locally after integration.

---

# 28. RECORD PAYMENT API

Endpoint:

POST /api/settlements/pay

Request:

{
  "from_user": 2,
  "to_user": 1,
  "amount": 1100
}

Response:

{
  "message": "Payment recorded successfully!",
  "payment_id": 2
}

Initial status:

pending

---

# 29. MARK PAYMENT AS SETTLED API

Endpoint:

PUT /api/settlements/:id/settle

Example:

PUT /api/settlements/2/settle

No body.

Response:

{
  "message": "Payment marked as settled!",
  "payment_id": 2
}

---

# 30. TARGET INTEGRATED ARCHITECTURE

Current:

React
↓
React State
↓
Local calculations

Target:

React
↓
REST API
↓
Express
↓
MySQL

Backend should become the source of truth for:

- Users
- Groups
- Group members
- Expenses
- Splits
- Balances
- Settlements
- Payment status

---

# 31. INTEGRATION ORDER

Do NOT integrate everything at once.

Use this order:

## Step 1

Connect Group Details to backend.

GET:

/api/groups/:id

GET:

/api/groups/:id/members

---

## Step 2

Connect expenses.

GET:

/api/groups/:id/expenses

---

## Step 3

Connect Add Expense.

POST:

/api/groups/:id/expenses

---

## Step 4

Remove local expense state as the source of truth.

After creating an expense:

POST expense
↓
GET expenses
↓
update UI

---

## Step 5

Connect Balances.

GET:

/api/groups/:id/balances

Remove frontend balance calculation.

---

## Step 6

Connect Settlement.

POST:

/api/groups/:id/settlements/optimize

Remove frontend settlement calculation.

---

## Step 7

Connect payment recording.

POST:

/api/settlements/pay

---

## Step 8

Connect Mark as Settled.

PUT:

/api/settlements/:id/settle

---

# 32. API CONTRACT RULE

Frontend and backend must NOT silently change API contracts.

If an endpoint, request body, response structure, database field, or route changes:

1. Update this specification.
2. Record the change in the Change Log.
3. Notify the other side before integration code is changed.

---

# 33. NO HARDCODED IDs

Frontend must NOT assume:

user 1 = Aahil

user 2 = Siddhartha

etc.

Those IDs are only current MySQL test data.

Frontend should fetch users/members from the backend and use the returned IDs.

Similarly, the frontend should not permanently assume:

group_id = 1

The actual group ID must come from the backend.

---

# 34. BUSINESS MODE

Business Mode is a future extension.

The current Personal Mode architecture should remain general enough to support:

Transaction / Deal
↓
Allocation
↓
Obligations
↓
Net Balances
↓
Settlement

Potential future use cases:

- Business transactions
- Procurement
- Projects
- Multi-party deals
- Football transfer showcase

Football transfer is a showcase use case, not the entire purpose of SmartSplit.

Business Mode is NOT currently implemented.

---

# 35. CURRENTLY NOT IMPLEMENTED

Frontend:

- Exact split calculation
- Percentage split calculation
- Custom split calculation
- Real API integration
- Persistent settlement state
- Authentication
- Real UPI integration
- OCR
- Analytics
- Business Mode
- Football transfer implementation

Backend:

- Authentication
- Business Mode
- Generalized transaction/deal model
- Advanced business workflows

These should not be described as completed features.

---

# 36. INTEGRATION CHECKLIST

## Groups

[ ] Connect group details API
[ ] Connect group members API
[ ] Remove hardcoded group information

## Expenses

[ ] GET expenses
[ ] POST expense
[ ] Remove local expense source of truth
[ ] Refresh after expense creation

## Splits

[ ] Equal
[ ] Exact
[ ] Percentage
[ ] Custom

## Balances

[ ] GET balances
[ ] Display backend balances
[ ] Remove frontend balance calculation

## Settlement

[ ] POST optimize
[ ] Display backend settlements
[ ] Remove frontend settlement calculation

## Payments

[ ] POST payment
[ ] Display pending payment
[ ] PUT payment settled
[ ] Display settled state

## Final

[ ] No hardcoded user IDs
[ ] No hardcoded group IDs
[ ] No duplicate business logic
[ ] Database persistence tested
[ ] API error handling
[ ] Loading states
[ ] Empty states
[ ] End-to-end test

---

# 37. CHANGE LOG

## 21 September 2026 — Frontend

Aahil:

- Built React/Vite SmartSplit prototype
- Implemented Home
- Implemented Group Details
- Implemented Add Expense
- Implemented dynamic expense state
- Implemented Balances
- Implemented frontend settlement optimization
- Implemented Settlement Plan
- Implemented Mark as Settled UI
- Tested dynamic expense updates
- Tested local-network deployment on phone

Status:

Frontend prototype working.

---

## 21 September 2026 — Backend

Backend teammate:

- Implemented Node/Express backend
- Connected MySQL
- Created users table
- Created groups_table
- Created group_members
- Created expenses
- Created expense_splits
- Created payments
- Implemented user APIs
- Implemented group APIs
- Implemented expense APIs
- Added expense validation
- Added database transaction handling
- Implemented balance API
- Implemented settlement optimization API
- Implemented payment recording
- Implemented payment settlement

Status:

Personal Mode backend ready for frontend integration.

---

# 38. CURRENT NEXT MILESTONE

The immediate milestone is:

FRONTEND ↔ BACKEND INTEGRATION

First target:

Add Expense

React Add Expense
↓
POST /api/groups/:id/expenses
↓
MySQL
↓
GET /api/groups/:id/expenses
↓
React Group Details

After this works:

Balances API
↓
Settlement API
↓
Payment API
↓
Settlement status

---

# 39. DEVELOPMENT RULE

Before making a major architectural change:

1. Check this specification.
2. Check current backend/frontend implementation.
3. Avoid duplicating existing business logic.
4. Update this specification after the change.
5. Record important changes in the Change Log.

The backend is the source of truth for persistent data.

The frontend is responsible for presentation and user interaction.

The API contract connects both sides.

---