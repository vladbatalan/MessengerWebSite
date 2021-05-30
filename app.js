const express = require('express');
const expressLayouts = require('express-ejs-layouts');
const bodyParser = require('body-parser')
const session = require('express-session');
// import database from database.js local file
const db = require('./database');

var path = require('path');
const fs = require('fs');
const url = require('url');
const { connect } = require('http2');
let allUsers = JSON.parse(fs.readFileSync("users.json"));

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
        var activeUserList = await db.retreiveUsersFromDb();
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
                    var activeIndex = activeUserList.findIndex((element) => element.id_user == user.user_id);
                    crrOther = {
                        "user_id": user.user_id,
                        "username": user.username,
                        "last_active": activeUserList[activeIndex].last_active,
                        "minutes_diff": activeUserList[activeIndex].minutes_diff
                    };
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
            chat_messages = await db.retreiveMessagesFromDb(currentUser.user_id, crrOther.user_id);
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

    allUsers.forEach(user => {
        if(req.body['username'] == user.username && req.body['password'] == user.password){
            userlogged = user;
            return;
        }
    });
    if(userlogged != null){
        // set the userlogged session
        sess.userlogged = userlogged;
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
    if(message_content != ""){
        try{
            //console.log("Executing insert(" + message_sender + ", " + message_receiver + ", \"" + message_content + "\")");
            await db.insertMessage(message_sender, message_receiver, message_content);
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
    var chat_messages = await db.retreiveMessagesFromDb(sender, receiver);
    //console.log("retreived messages with select");
    //console.log(chat_messages);

    // trimit aceste mesaje inapoi
    res.send(JSON.stringify(chat_messages));
});

// #####  Get users and show if active #####
app.get('/users-active-status', async function(req, res){
    var users = await db.retreiveUsersFromDb();
    res.send(JSON.stringify(users));
});

/* ###### Keep alive user ######
    - this function updates the timestamp of the user
    - it shows when it was active last time */
app.put('/keep-alive', async function(req, res){
    // get the user id
    var user_id = req.body['user_id'];

    // UPDATE database with the current timestamp
    try{
        await db.updateTimestamp(user_id);
        res.statusCode = 200;
        res.send();
    }
    catch(err){
        console.log(err);
        res.statusCode = 400;
        res.send();
    }
});



app.listen(port, () => console.log(`Serverul rulează la adresa http://localhost:`));