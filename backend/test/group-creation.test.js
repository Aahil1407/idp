const test = require("node:test");
const assert = require("node:assert/strict");
const { validateGroupInput, createGroupWithCreator } = require("../group-creation");

function createFakeDb({ failMemberInsert = false } = {}) {
    const state = { calls: [], committed: false, rolledBack: false };
    const db = {
        beginTransaction(callback) {
            state.calls.push("begin");
            callback(null);
        },
        query(sql, values, callback) {
            state.calls.push({ sql, values });
            if (sql.startsWith("INSERT INTO groups_table")) {
                return callback(null, { insertId: 37 });
            }
            if (failMemberInsert) return callback(new Error("membership insert failed"));
            callback(null, { insertId: 1 });
        },
        commit(callback) {
            state.calls.push("commit");
            state.committed = true;
            callback(null);
        },
        rollback(callback) {
            state.calls.push("rollback");
            state.rolledBack = true;
            callback(null);
        },
    };
    return { db, state };
}

function create(db, input) {
    return new Promise((resolve, reject) => {
        createGroupWithCreator(db, input, (error, groupId) => {
            if (error) return reject(error);
            resolve(groupId);
        });
    });
}

test("group input rejects blank names and invalid creator IDs", () => {
    assert.equal(validateGroupInput({ group_name: "   ", created_by: 1 }).error, "A group name is required");
    assert.equal(validateGroupInput({ group_name: "Trip", created_by: "not-an-id" }).error, "Select a valid creator");
    assert.deepEqual(validateGroupInput({ group_name: "  Trip  ", created_by: "2" }), {
        value: { groupName: "Trip", createdBy: 2 },
    });
});

test("group and creator membership commit together", async () => {
    const { db, state } = createFakeDb();
    assert.equal(await create(db, { groupName: "Trip", createdBy: 2 }), 37);
    assert.deepEqual(state.calls[1].values, ["Trip", 2]);
    assert.deepEqual(state.calls[2].values, [37, 2]);
    assert.equal(state.committed, true);
    assert.equal(state.rolledBack, false);
});

test("membership failure rolls back the group insert", async () => {
    const { db, state } = createFakeDb({ failMemberInsert: true });
    await assert.rejects(create(db, { groupName: "Trip", createdBy: 2 }), /membership insert failed/);
    assert.equal(state.committed, false);
    assert.equal(state.rolledBack, true);
});

test("pooled group creation keeps both inserts in one acquired connection and releases it", async () => {
    const calls = [];
    let released = false;
    const connection = {
        beginTransaction(callback) { calls.push("begin"); callback(null); },
        query(sql, values, callback) {
            calls.push({ sql, values });
            callback(null, sql.startsWith("INSERT INTO groups_table") ? { insertId: 81 } : { affectedRows: 1 });
        },
        commit(callback) { calls.push("commit"); callback(null); },
        rollback(callback) { calls.push("rollback"); callback(null); },
        release() { released = true; },
    };
    const pool = {
        getConnection(callback) { callback(null, connection); },
        query() { assert.fail("transaction queries must use the acquired connection"); },
    };

    assert.equal(await create(pool, { groupName: "Pooled", createdBy: 4 }), 81);
    assert.equal(calls[0], "begin");
    assert.equal(calls[1].sql.startsWith("INSERT INTO groups_table"), true);
    assert.equal(calls[2].sql.startsWith("INSERT INTO group_members"), true);
    assert.equal(calls[3], "commit");
    assert.equal(released, true);
});
