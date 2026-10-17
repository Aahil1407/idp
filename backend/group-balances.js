const GROUP_BALANCES_SQL = `
    SELECT
        u.user_id,
        u.name,
        COALESCE(paid.total_paid, 0) AS total_paid,
        COALESCE(owed.total_owed, 0) AS total_owed,
        COALESCE(outgoing.total_settled_outgoing, 0) AS total_settled_outgoing,
        COALESCE(incoming.total_settled_incoming, 0) AS total_settled_incoming
    FROM group_members gm
    JOIN users u ON gm.user_id = u.user_id
    LEFT JOIN (
        SELECT e.paid_by AS user_id, SUM(e.amount) AS total_paid
        FROM expenses e
        WHERE e.group_id = ?
        GROUP BY e.paid_by
    ) paid ON u.user_id = paid.user_id
    LEFT JOIN (
        SELECT es.user_id, SUM(es.amount_owed) AS total_owed
        FROM expense_splits es
        JOIN expenses e ON es.expense_id = e.expense_id
        WHERE e.group_id = ?
        GROUP BY es.user_id
    ) owed ON u.user_id = owed.user_id
    LEFT JOIN (
        SELECT p.from_user AS user_id, SUM(p.amount) AS total_settled_outgoing
        FROM payments p
        WHERE p.group_id = ? AND p.status = 'settled'
        GROUP BY p.from_user
    ) outgoing ON u.user_id = outgoing.user_id
    LEFT JOIN (
        SELECT p.to_user AS user_id, SUM(p.amount) AS total_settled_incoming
        FROM payments p
        WHERE p.group_id = ? AND p.status = 'settled'
        GROUP BY p.to_user
    ) incoming ON u.user_id = incoming.user_id
`;

function mapGroupBalances(rows) {
  return rows.map((user) => {
    const totalPaid = Number(user.total_paid) || 0;
    const totalOwed = Number(user.total_owed) || 0;
    const settledOutgoing = Number(user.total_settled_outgoing) || 0;
    const settledIncoming = Number(user.total_settled_incoming) || 0;

    return {
      user_id: user.user_id,
      name: user.name,
      total_paid: totalPaid,
      total_owed: totalOwed,
      total_settled_outgoing: settledOutgoing,
      total_settled_incoming: settledIncoming,
      balance: totalPaid - totalOwed + settledOutgoing - settledIncoming,
    };
  });
}

function getGroupBalances(database, groupId, callback) {
  database.query(GROUP_BALANCES_SQL, [groupId, groupId, groupId, groupId], (err, rows) => {
    if (err) return callback(err);
    callback(null, mapGroupBalances(rows));
  });
}

function optimizeSettlements(balances, groupId) {
  const creditors = [];
  const debtors = [];

  for (const user of balances) {
    const balance = Number(user.balance);
    if (balance > 0.01) creditors.push({ user_id: user.user_id, name: user.name, amount: balance });
    else if (balance < -0.01) debtors.push({ user_id: user.user_id, name: user.name, amount: Math.abs(balance) });
  }

  const settlements = [];
  let debtorIndex = 0;
  let creditorIndex = 0;

  while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
    const debtor = debtors[debtorIndex];
    const creditor = creditors[creditorIndex];
    const amount = Math.min(debtor.amount, creditor.amount);

    settlements.push({
      from_user: debtor.user_id,
      from_name: debtor.name,
      to_user: creditor.user_id,
      to_name: creditor.name,
      amount: Number(amount.toFixed(2)),
    });

    debtor.amount -= amount;
    creditor.amount -= amount;
    if (debtor.amount < 0.01) debtorIndex++;
    if (creditor.amount < 0.01) creditorIndex++;
  }

  return { group_id: Number(groupId), settlements };
}

module.exports = {
  GROUP_BALANCES_SQL,
  getGroupBalances,
  mapGroupBalances,
  optimizeSettlements,
};
