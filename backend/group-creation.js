const { withTransaction } = require("./transaction");
const MAX_UNSIGNED_INT = 4_294_967_295;

function validateGroupInput(body = {}) {
    const groupName = typeof body.group_name === "string" ? body.group_name.trim() : "";
    const createdBy = Number(body.created_by);

    if (!groupName) {
        return { error: "A group name is required" };
    }

    if (groupName.length > 255) {
        return { error: "Group name must be 255 characters or fewer" };
    }

    if (!Number.isSafeInteger(createdBy) || createdBy <= 0 || createdBy > MAX_UNSIGNED_INT) {
        return { error: "Select a valid creator" };
    }

    return { value: { groupName, createdBy } };
}

function createGroupWithCreator(db, { groupName, createdBy }, callback) {
    withTransaction(db, (connection, done) => {
        connection.query(
            "INSERT INTO groups_table (group_name, created_by) VALUES (?, ?)",
            [groupName, createdBy],
            (groupError, groupResult) => {
                if (groupError) return done(groupError);

                const groupId = groupResult.insertId;
                connection.query(
                    "INSERT INTO group_members (group_id, user_id) VALUES (?, ?)",
                    [groupId, createdBy],
                    (memberError) => {
                        if (memberError) return done(memberError);
                        done(null, groupId);
                    }
                );
            }
        );
    }, callback);
}

module.exports = { validateGroupInput, createGroupWithCreator };
