const express = require('express');
const expressLayouts = require('express-ejs-layouts');
const bodyParser = require('body-parser')
const session = require('express-session');
var path = require('path');
const fs = require('fs');
const url = require('url');


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
app.use(userloggedMiddleware);

app.get('/', (req, res) => {
    res.render("index");
});

app.get('/chat', (req, res) => {
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
        res.render("chat");
    }
});

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

let allUsers = JSON.parse(fs.readFileSync("users.json"));
app.post('/process-login', (req, res) => {
    let userlogged = null;
    var sess = req.session;
    allUsers.forEach(user => {
        if(req.body['username'] == user.username && req.body['password'] == user.password){
            delete user['password'];
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

app.listen(port, () => console.log(`Serverul rulează la adresa http://localhost:`));