function toPaise(balance) {
    const numericBalance = Number(balance);
    if (!Number.isFinite(numericBalance)) throw new TypeError("Balance must be a finite amount");
    const paise = Math.round(numericBalance * 100);
    if (!Number.isSafeInteger(paise)) throw new RangeError("Balance exceeds safe paise precision");
    return paise;
}

function buildSettlementPlan(groupId, balances) {
    const creditors = [];
    const debtors = [];

    balances.forEach((user) => {
        const balancePaise = toPaise(user.balance);
        if (balancePaise > 0) {
            creditors.push({ user_id: user.user_id, name: user.name, paise: balancePaise });
        } else if (balancePaise < 0) {
            debtors.push({ user_id: user.user_id, name: user.name, paise: Math.abs(balancePaise) });
        }
    });

    const settlements = [];
    let debtorIndex = 0;
    let creditorIndex = 0;

    while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
        const debtor = debtors[debtorIndex];
        const creditor = creditors[creditorIndex];
        const paymentPaise = Math.min(debtor.paise, creditor.paise);

        settlements.push({
            from_user: debtor.user_id,
            from_name: debtor.name,
            to_user: creditor.user_id,
            to_name: creditor.name,
            amount: paymentPaise / 100,
        });

        debtor.paise -= paymentPaise;
        creditor.paise -= paymentPaise;

        if (debtor.paise === 0) debtorIndex++;
        if (creditor.paise === 0) creditorIndex++;
    }

    return { group_id: Number(groupId), settlements };
}

module.exports = { buildSettlementPlan };
