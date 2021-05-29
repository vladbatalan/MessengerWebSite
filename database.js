const oracledb = require('oracledb');
const oracleCredentials = {
    user:           "pw_user",
    password:       "pw_pass",
    connectString:  "localhost:1521/xe",
    database:       "pw_database"
}

oracledb.autoCommit = true;
oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;

// connect to database function
async function connectToDb(){
    try{
        connection = await oracledb.getConnection(oracleCredentials);
    } catch(err){
        console.log(err);
    }finally{
        if(connection){
            return connection;
        }
    }
}

async function createTables(){
    let conn = await connectToDb();
    try{
        await conn.execute(
            `CREATE SEQUENCE mess_seq START WITH 1`
        );
        await conn.execute(
            `CREATE TABLE messages (
            id_message number,
            id_sender number NOT NULL,
            id_receiver number NOT NULL,
            message_content varchar2(512),
            message_timestamp timestamp NOT NULL,
            primary key (id_message))`
        );

        await conn.execute(
            `CREATE OR REPLACE TRIGGER messages_on_insert
                BEFORE INSERT ON messages
                FOR EACH ROW
            BEGIN
                SELECT mess_seq.nextval
                INTO :new.id_message
                FROM dual;
            END;`
        );
        await conn.execute(
            `CREATE TABLE users (
            id_user number,
            last_active timestamp,
            primary key (id_user))`
        );
    }
    catch (err){
        console.log(err);
    }
    finally{
        if(conn){
            try { await conn.close();}
            catch (err) {console.log(err);}
        }
    }
}

async function firstInsertIntoDatabase( allUsers ){
    var conn = await connectToDb();
    try{
        let result = await conn.execute(
            `SELECT COUNT(*) as cnt FROM users`
        );
        if(result.rows[0].CNT == 0){
            // inserez utilizatorii
            allUsers.forEach(async function(user){
                try{
                    await conn.execute(
                        `INSERT INTO users 
                        VALUES(
                            :0,
                            null
                        )`, [user.user_id]
                    );
                }
                catch (exc){
                    console.log(user.user_id + " has got an exception! " + exc);
                }
            });
        }
    }
    catch (err){
        console.log(err);
    }
    finally{
        if(conn){
            try { await conn.close();}
            catch (err) {console.log(err);}
        }
    }
}

async function retreiveUsersFromDb(){
    var users = [];
    var sql = "SELECT id_user, TO_CHAR(last_active, 'HH24:MI - DD/MM/YYYY') as last_time, "+
        "(" + 
            "extract(hour FROM (CURRENT_TIMESTAMP - last_active)) * 60 + "+ 
            "extract(minute FROM (CURRENT_TIMESTAMP - last_active))" +
        ") AS minutes_diff FROM users";

    var connection = await connectToDb();
    var result = (await connection.execute(sql)).rows;

    // close the connection
    if(connection){
        try { await connection.close();}
        catch (err) {console.log(err);}
    }

    result.forEach((user) => {
        users.push({
            "id_user": user.ID_USER,
            "last_time": user.LAST_TIME,
            "minutes_diff": user.MINUTES_DIFF
        });
    })

    // console.log(users);
    return users;
}

async function retreiveMessagesFromDb(sender, receiver){
    var chat_messages = [];
    
    // voi face un select pentru a avea toate mesajele dintre cei 2 in ordine
    let sql = "SELECT id_sender, id_receiver, message_content, TO_CHAR(message_timestamp, 'HH24:MI - DD/MM/YYYY') AS timestamp FROM messages WHERE (id_sender = :0 AND id_receiver = :1) OR (id_sender = :1 AND id_receiver = :0) ORDER BY message_timestamp ASC";

    let connection = await connectToDb();

    // selectez randurile
    let select_messages = (await connection.execute(sql, [sender, receiver])).rows;
    
    // close the connection
    if(connection){
        try { await connection.close();}
        catch (err) {console.log(err);}
    }
    
    // le salvez in chat_messages
    select_messages.forEach(msg => {
        chat_messages.push(
            {
                "id_sender" : msg.ID_SENDER,
                "id_receiver" : msg.ID_RECEIVER,
                "message_content" : msg.MESSAGE_CONTENT,
                "timestamp" : msg.TIMESTAMP
            }
        );
    });

    return chat_messages;
}

async function userExists(user_id){
    // get connection
    let conn = await connectToDb();

    var sql = "SELECT * FROM users WHERE id_user = :0";

    // execute query
    var result = (await conn.execute(sql, [user_id])).rows;

    // close connection
    if(conn){
        try { await conn.close();}
        catch (err) {console.log(err);}
    }

    if(result.length >= 1) 
        return true;
    return false;
}

async function insertMessage(message_sender, message_receiver, message_content){
    // get connection
    let conn = await connectToDb();

    // check if users exist
    let users_exist = (await userExists(message_sender)) && (await userExists(message_receiver));
    if(users_exist){
        // insert into db message;
        let insert_message_sql = "INSERT INTO messages VALUES(null, :0, :1, :2, CURRENT_TIMESTAMP)";
        await conn.execute(insert_message_sql, [message_sender, message_receiver, message_content]);
    }

    // close connection
    if(conn){
        try { await conn.close();}
        catch (err) {console.log(err);}
    }
}

async function updateTimestamp(user_id){
    let conn = await connectToDb();

    var sql = "UPDATE users SET last_active = CURRENT_TIMESTAMP WHERE id_user = :0";
    await conn.execute(sql, [user_id]);

    // close connection
    if(conn){
        try { await conn.close();}
        catch (err) {console.log(err);}
    }
}