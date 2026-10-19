const test = require("node:test");
const assert = require("node:assert/strict");
const { isDuplicateMembershipError } = require("../group-membership");

test("duplicate group membership errors can be returned as conflicts", () => {
    assert.equal(isDuplicateMembershipError({ code: "ER_DUP_ENTRY" }), true);
    assert.equal(isDuplicateMembershipError({ code: "ER_NO_REFERENCED_ROW_2" }), false);
    assert.equal(isDuplicateMembershipError(new Error("database unavailable")), false);
});
