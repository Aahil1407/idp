function isDuplicateMembershipError(error) {
    return error?.code === "ER_DUP_ENTRY";
}

function addGroupMember(db, groupId, userId, callback) {
    db.query(
        "INSERT INTO group_members (group_id, user_id) VALUES (?, ?)",
        [groupId, userId],
        (error, result) => callback(error, result)
    );
}

module.exports = { isDuplicateMembershipError, addGroupMember };
