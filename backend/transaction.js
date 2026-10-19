function acquireConnection(db, callback) {
    if (typeof db.getConnection !== "function") {
        return callback(null, db, () => {});
    }

    db.getConnection((error, connection) => {
        callback(error, connection, () => connection?.release());
    });
}

function withTransaction(db, operation, callback) {
    acquireConnection(db, (connectionError, connection, release) => {
        if (connectionError) return callback(connectionError);

        connection.beginTransaction((beginError) => {
            if (beginError) {
                release();
                return callback(beginError);
            }

            let finished = false;
            const finish = (error, result) => {
                if (finished) return;
                finished = true;

                if (error) {
                    return connection.rollback(() => {
                        release();
                        callback(error);
                    });
                }

                connection.commit((commitError) => {
                    if (commitError) {
                        return connection.rollback(() => {
                            release();
                            callback(commitError);
                        });
                    }

                    release();
                    callback(null, result);
                });
            };

            try {
                operation(connection, finish);
            } catch (error) {
                finish(error);
            }
        });
    });
}

module.exports = { withTransaction };
