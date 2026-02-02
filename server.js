require('dotenv').config();
const express = require('express');
const passport = require('passport');
const Discord = require('passport-discord').Strategy;
const session = require('express-session');
const ngrok = require('ngrok');
const path = require('path');
const { staffDB } = require('./bot');

const app = express();

app.use(session({secret:'staff',resave:false,saveUninitialized:false}));
app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser((u,d)=>d(null,u));
passport.deserializeUser((u,d)=>d(null,u));

let callbackURL = `http://localhost:${process.env.PORT}/auth/discord/callback`;

passport.use(new Discord({
  clientID:process.env.CLIENT_ID,
  clientSecret:process.env.CLIENT_SECRET,
  callbackURL,
  scope:['identify','guilds.members.read']
},(_,__,profile,done)=>done(null,profile)));

app.get('/auth/discord',passport.authenticate('discord'));
app.get('/auth/discord/callback',
  passport.authenticate('discord',{failureRedirect:'/'}),
  (req,res)=>{
    const staff = staffDB[req.user.id];
    if(!staff || staff.role==='Guest')
      return res.send('<h2>❌ Staff only</h2>');
    res.redirect('/');
  }
);

app.get('/api/me',(req,res)=>{
  if(!req.user) return res.json(null);
  res.json(staffDB[req.user.id]);
});

app.get('/',(_,res)=>res.sendFile(path.join(__dirname,'index.html')));

(async()=>{
  app.listen(process.env.PORT);
  const url = await ngrok.connect({
    addr:process.env.PORT,
    authtoken:process.env.NGROK_AUTH_TOKEN
  });
  callbackURL = `${url}/auth/discord/callback`;
  console.log('NGROK:',url);
})();
