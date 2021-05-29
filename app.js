const express = require('express');
const expressLayouts = require('express-ejs-layouts');
const bodyParser = require('body-parser')
const session = require('express-session');
const oracledb = require('oracledb');
oracledb.autoCommit = true;
oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;

var path = require('path');
const fs = require('fs');
const url = require('url');
const { connect } = require('http2');
let allUsers = JSON.parse(fs.readFileSync("users.json"));

const oracleCredentials = {
    user:           "pw_user",
    password:       "pw_pass",
    connectString:  "localhost:1521/xe",
    database:       "pw_database"
}

var connection;
// connect to database function
async function connectToDb(){
    try{
        connection = await oracledb.getConnection(oracleCredentials);
        console.log("Successfully connected");
    } catch(err){
        console.log("NOT connected");
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

async function firstInsertIntoDatabase(){
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

// use function to create tables for the first time
// firstInsertIntoDatabase();
// createTables();

const app = express();

const port = 6789;

app.use(express.static(__dirname + '/static'));

// directorul 'views' va conține fișierele .ejs (html + js executat la server)
app.set('view engine', 'ejs');
// suport pentru layout-uri - implicit fișierul care reprezintă template-ul site-ului este views/layout.ejs
app.use(expressLayouts);
// directorul 'public' va conține toate resursele accesibile direct de către client (e.g., fișiere css, javascript, imagini)
app.use(express.static('public'))
// corpul mesajului poate fi interpretat ca json; datele de la formular se găsesc în format json în req.body
app.use(bodyParser.json());
// utilizarea unui algoritm de deep parsing care suportă obiecte în obiecte
app.use(bodyParser.urlencoded({ extended: true }));
// utilizare variabile session
app.use(session({
    secret:'ssshhhhhh',
    resave:true,
    saveUninitialized:false,
    cookie:{
        expires: 50000 * 1000
    }})
);
app.use(userloggedMiddleware);

// the middleware to set the user script in the left
function userloggedMiddleware(req, res, next){
    //console.log("Userlogged Middleware");
    var sess = req.session;
    if(sess.userlogged)
    {
        res.locals['userlogged'] = sess.userlogged;
    }
    next();
}

async function retreiveUsersFromDb(){
    var users = [];
    var sql = "SELECT id_user, TO_CHAR(last_active, 'HH24:MI - DD/MM/YYYY') as last_time, "+
        "(" + 
            "extract(hour FROM (CURRENT_TIMESTAMP - last_active)) * 60 + "+ 
            "extract(minute FROM (CURRENT_TIMESTAMP - last_active))" +
        ") AS minutes_diff FROM users";

    var result = (await connection.execute(sql)).rows;

    result.forEach((user) => {
        users.push({
            "id_user": user.ID_USER,
            "last_time": user.LAST_TIME,
            "minutes_diff": user.MINUTES_DIFF
        });
    })

    console.log(users);
    return users;
}

async function retreiveMessagesFromDb(sender, receiver){
    var chat_messages = [];
    
    // voi face un select pentru a avea toate mesajele dintre cei 2 in ordine
    let sql = "SELECT id_sender, id_receiver, message_content, TO_CHAR(message_timestamp, 'HH24:MI - DD/MM/YYYY') AS timestamp FROM messages WHERE (id_sender = :0 AND id_receiver = :1) OR (id_sender = :1 AND id_receiver = :0) ORDER BY message_timestamp ASC";

    // selectez randurile
    let select_messages = (await connection.execute(sql, [sender, receiver])).rows;

    // console.log("Slected messages for (" + sender +", " + receiver + ")");
    // console.log(select_messages);

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


// #######  Index page is loaded here #######
app.get('/', (req, res) => {
    res.render("index");
});

// #######  Chat page is loaded here #######
app.get('/chat', async function(req, res){
    var sess = req.session;
    var currentUser = null;
    if(sess.userlogged){
        currentUser = sess.userlogged;
    }
    if(currentUser == null)
    {
        res.redirect("/login?error=not-logged");
    }
    else{
        // display all other users on the bar
        var otherUsersList = [];
        var activeUserList = await retreiveUsersFromDb();
        allUsers.forEach((user) => {
            if(user.user_id != currentUser.user_id){
                // find the active user data from the list
                var activeIndex = activeUserList.findIndex((element) => element.id_user == user.user_id);
                otherUsersList.push({
                    "user_id": user.user_id,
                    "username": user.username,
                    "last_active": activeUserList[activeIndex].last_active,
                    "minutes_diff": activeUserList[activeIndex].minutes_diff
                });
            }
        });

        // read the current chat with the user
        var crrOther = req.query['user'];
        if(crrOther){
            // select from the list the user
            let found = false;
            allUsers.forEach( (user) => {
                if(user.username == crrOther){
                    crrOther = user;
                    found = true;
                    return;
                }
            });

            // daca nu am gasit user
            if(found == false){
                crrOther = null;
            }
        }
        else{
            crrOther = null;
        }

        // se va constitui lista de mesaje transmise intre cei doi utilizatori
        var chat_messages = [];
        if(crrOther != null){
            chat_messages = await retreiveMessagesFromDb(currentUser.user_id, crrOther.user_id);
        }
        res.statusCode = 200;
        res.render("chat", {"otherUsers": otherUsersList, "currentOther": crrOther, "chatMessages": chat_messages});
    }
});

// #######  Login page is loaded  #######
app.get('/login', (req, res) => {
    // delogare - delete user session if exists
    var sess = req.session;
    var errorParam = url.parse(req.url, true).query;
    if(sess.userlogged){
        delete req.session.userlogged;
    }

    var error = "";
    if(errorParam['error'])
    {
        if(errorParam['error'] == "wrong-credentials"){
            error = "Nume utilizator sau parola invalide!";
        }
        if(errorParam['error'] == "not-logged"){
            error = "Trebuie sa fiti logat ca sa aveti acces la chat!";
        }
    }
    res.render("login", {"error": error});
});

// #######  Login user is processed  #######
app.post('/process-login', (req, res) => {
    let userlogged = null;
    var sess = req.session;
    
    // se sterge conectiunea de la baza de date
    if( connection ){
        connection.close();
        delete connection;
    }

    allUsers.forEach(user => {
        if(req.body['username'] == user.username && req.body['password'] == user.password){
            userlogged = user;
            return;
        }
    });
    if(userlogged != null){
        // set the userlogged session
        sess.userlogged = userlogged;

        // connect to the database
        connection = connectToDb();
        res.redirect("/");
    }
    else{
        res.redirect("/login?error=wrong-credentials");
    }
});


// #######  An message is processed and inserted to database here #######
app.post('/insert-message', async function(req, res){
    var message_sender = req.body["sender"];
    var message_receiver = req.body["receiver"];
    var message_content = req.body["content"];

    // filtrez mesajul
    message_content = message_content.trim();
    
    //console.log("Got from ajax client(" + message_sender + ", " + message_receiver + ", \"" + message_content + "\")");

    var select_user_sql = "SELECT COUNT(*) AS cnt FROM users WHERE id_user = :0";
    var insert_message_sql = "INSERT INTO messages VALUES(null, :0, :1, :2, CURRENT_TIMESTAMP)";
    var users_are_ok = false;

    // fac un select dupa sender si receiver, ele trebuie sa existe in baza de date
    try{
        let result_user1 = (await connection.execute(select_user_sql,[message_sender])).rows[0].CNT;
        let result_user2 = (await connection.execute(select_user_sql,[message_receiver])).rows[0].CNT;

        if(result_user1 == 1 && result_user2 == 1)
        {
            users_are_ok = true;
        }
    }
    catch(err){
        console.log(err);
    }

    // verificare itemi transmisi
    if(message_content != "" && users_are_ok){
        try{
            //console.log("Executing insert(" + message_sender + ", " + message_receiver + ", \"" + message_content + "\")");
            await connection.execute(insert_message_sql, [message_sender, message_receiver, message_content]);
            res.statusCode = 200;
            // console.log("Status was set to 200");
            res.send("OK");
        }
        catch(err)
        {
            res.statusCode = 400;
            console.log(err);
            res.send("Database error");
        }
    }
});

// #####  Through this method, the messages between 2 can be returned  #####
app.get('/select-messages', async function(req, res){
    var sender = req.query["sender"];
    var receiver = req.query["receiver"];

    // voi face o interogare sql ca sa extrag mesajele
    var chat_messages = await retreiveMessagesFromDb(sender, receiver);
    //console.log("retreived messages with select");
    //console.log(chat_messages);

    // trimit aceste mesaje inapoi
    res.send(JSON.stringify(chat_messages));
});

// #####  Get users and show if active #####
app.get('/users-active-status', async function(req, res){
    var users = await retreiveUsersFromDb();

    res.send(JSON.stringify(users));
});

/* ###### Keep alive user ######
    - this function updates the timestamp of the user
    - it shows when it was active last time */
app.put('/keep-alive', async function(req, res){
    // get the user id
    var user_id = req.body['user_id'];

    // UPDATE database with the current timestamp
    var sql = "UPDATE users SET last_active = CURRENT_TIMESTAMP WHERE id_user = :0";
    await connection.execute(sql, [user_id]);

    res.statusCode = 200;
    res.send();
});



app.listen(port, () => console.log(`Serverul rulează la adresa http://localhost:`));