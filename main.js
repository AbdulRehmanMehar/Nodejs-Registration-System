const express = require('express');
const path = require('path');
const fs = require('fs');
const app = express();
const bodyParser = require('body-parser');
const MongoClient = require('mongodb').MongoClient;
const nodemailer = require('nodemailer');
const passwordHash = require('password-hash');
const session = require('express-session');
let urlencodedParser = bodyParser.urlencoded({
  extended: true
});

// Nodemailer
if(!fs.existsSync('mailerconfig.txt')) fs.writeFileSync('mailerconfig.txt' , '');
let transporterSetup = fs.readFileSync("mailerconfig.txt").toString().split("\n");

let transporter = nodemailer.createTransport({
  service: transporterSetup[0],
  auth: {
    user: transporterSetup[1],
    pass: transporterSetup[2]
  }
});



// MongoDB  URI
let uri = "mongodb://localhost:27017";

// App Setup
app.use(session({
  secret: 'theAppS30r3t',
  resave: false,
  saveUninitialized: true
}));
app.set('views', path.join(__dirname, 'views'));
app.set('view engine' , 'pug');
app.listen(3000 , () => console.log('Running on Port 3000'));
app.use('/assets', express.static(path.join(__dirname, 'assets')));

app.get('/', (req,res) =>{
  if(req.session.username == null) {
    res.render('index');
  }else{
    res.render('error', {
      info: "User already logged in",
      LOGGEDIN: `${req.session.username} Logged In`
    });
  }
});

app.get('/login_page', (req, res) => {
  if (req.session.username == null) {
    res.render('login');
  } else {
    res.render('error', { 
      info:"User already logged in",
      LOGGEDIN: `${req.session.username} Logged In`
    });
  }
});

app.get('/register_page', (req, res) => {
  if (req.session.username == null) {
    res.render('register');
  } else {
    res.render('error', { 
      info: "User already logged in",
      LOGGEDIN: `${req.session.username} Logged In`
     });
  }
});


/*
----- Handle Nodemailer Setup Form
*/

app.post('/mailerConfig' , urlencodedParser , (req , res) => {
  fs.appendFileSync('mailerconfig.txt', `${req.body.mc_SP}\n`);
  fs.appendFileSync('mailerconfig.txt', `${req.body.mc_Email}\n`);
  fs.appendFileSync('mailerconfig.txt', `${req.body.mc_Password}\n`);
  res.render('index',{info: "Nodemailer is now Setup."})
});

/*
----- Handle Registeration Form
*/
app.post('/register', urlencodedParser , (req,res) => {
  if(req.body.r_password == req.body.r_cnfrm_password){
    MongoClient.connect(uri, (err, db) => {
      if (err) res.render('error', { DBERROR: "Database Connection Failed" });
      let myDB = db.db("NodeJS_AUTH").collection('users');
      myDB.findOne({ email: req.body.r_email }, (err, userExists) => {
        if (!userExists) {
          let verificationCode = Math.floor((Math.random() * 10000) + 10000);
          let mailDetials = {
            from: transporterSetup[1],
            to: req.body.r_email,
            subject: 'Registeration was Successful',
            text: `You've registered successfully.Please verify your email by copying this \n${verificationCode}\n and pasting it into the field`
          }
          transporter.sendMail(mailDetials, (err, success) => {
            if (err) {
              res.render('error', { NODEMAILERERR: "An Error Occurd with Node Mailer" });
            }else{
              let userDetails = {
                name: req.body.r_name,
                email: req.body.r_email,
                password: passwordHash.generate(req.body.r_password),
                verificationcode: verificationCode,
                verified: 0
              }
              myDB.insertOne(userDetails, (err, result) => {
                if (err) {
                  res.render('error', { DBERROR: "Database Insertion Failed" });
                }else{
                  res.render('verify', {
                    info : "User Registered! Verify email to continue!",
                    userEmail: req.body.r_email
                  })
                }
              });
            }
          });
          
        } else {
          res.render('login', {
            info: "User already Registered!"
          });
        }
      });
    });
  }else{
    res.render('register', { info: "Passwords don't match" });
  }
  
});

/*
----- Handle Verify Form
*/
//Verify the email
app.post('/verify', urlencodedParser , (req,res) => {
  MongoClient.connect(uri, (err, db) => {
    if (err) res.render('error', { DBERROR: "Database Connection Failed" });
    let myDB = db.db("NodeJS_AUTH").collection('users');
    myDB.findOne({ email: req.body.v_email }, (err, userExists) => {
      if(userExists){
        if (req.body.v_number == userExists.verificationcode){
          myDB.update({ email: req.body.v_email } , {
            $set: {
              verificationcode: 0,
              verified: 1 
            }
          } , (err) => {
            if(err){
              res.render('login', {info: "An error occurd during verification"});
            }else{
              res.render('login', {info: "Verified Successfully"});
            }
          });
        }else{
          res.render('verify',{info: "Verification Code not match"})
        }
      }else{
        res.render('register',{info: "User not registered"});
      }
    });
  });
});
//Resend the Verifictation Code
app.post('/getAnotherCode', urlencodedParser, (req,res) => {
  MongoClient.connect(uri, (err, db) => {
    if (err) res.render('error', { DBERROR: "Database Connection Failed" });
    let myDB = db.db("NodeJS_AUTH").collection('users');
    myDB.findOne({email: req.body.g_v_email}, (err, userExists) => {
      if(err) throw err;
      if(userExists){
        let mailDetials = {
          from: transporterSetup[1],
          to: req.body.g_v_email,
          subject: 'Registeration was Successful',
          text: `You've registered successfully.Please verify your email by copying this \n${userExists.verificationcode}\n and pasting it into the field`
        }
        transporter.sendMail(mailDetials, (err, success) => {
          if (err) res.render('error', { NODEMAILERERR: "An Error Occurd with Node Mailer"});
          if(!err) res.render('verify', {
            info: "Code Resent!",
            userEmail: req.body.g_v_email
          });
        });
      }else{
        res.render('register', {info : "User is not registered"})
      }
    });
  });
});


/*
----- Handle Login Form
*/
app.post('/login', urlencodedParser ,(req,res) => {
  MongoClient.connect(uri , (err , db) => {
    if(err) res.render('error' , {DBERROR : "Database Connection Failed"});
    let myDB = db.db("NodeJS_AUTH").collection('users');
    myDB.findOne({email: req.body.l_email}, (err,userExists) => {
      // If user is registered
      if(userExists){
        if ((userExists.email == req.body.l_email) && (passwordHash.verify(req.body.l_password, userExists.password))){
          if(userExists.verified == 1){
            // Start Session
            req.session.username = userExists.name;
            res.render('error', { 
              LOGGEDIN: `${userExists.name} Logged In`
            });
            
          }else{
            res.render('verify', {
              info: "User Not Verified",
              userEmail: req.body.l_email
            });
          }
        }else{
          // User enetered Incorrect Details
          res.render('login', {
            info: 'Incorrect Login Details'
          });
        }
      }else{
        res.render('register', {
          info: "User Not Registered!",
          userEmail: req.body.l_email
        });
      }
    });
  });
});

app.post('/logout', (req,res) => {
  req.session.username = null;
  res.render('index', {
    info: "User Logged Out",
    LOGGEDIN: null
  });
});





//404 page
app.use(function (req, res) {
  if (req.session.username == null) {
    res.render('error', { NOTFOUNDERROR: "Page Not Found" });
  } else {
    res.render('error', {
      info: "User already logged in",
      LOGGEDIN: `${req.session.username} Logged In`
    });
  }
});
