require('dotenv').config()
const express=require('express')
const session=require('express-session')
const fetch=require('node-fetch')
const ngrok=require('ngrok')
const app=express()

app.use(express.json())
app.use(session({
  secret:process.env.SESSION_SECRET,
  resave:false,
  saveUninitialized:false
}))

let callbackURL=''

function getRanks(){ return ['Staff','Senior Staff','Manager','HR','Ownership'] }

app.get('/auth/discord',(req,res)=>{
  res.redirect(
    `https://discord.com/oauth2/authorize?client_id=${process.env.DISCORD_CLIENT_ID}`+
    `&response_type=code&scope=identify%20guilds.members.read&redirect_uri=${encodeURIComponent(callbackURL)}`
  )
})

app.get('/auth/discord/callback',async(req,res)=>{
  const code=req.query.code
  const data=await fetch('https://discord.com/api/oauth2/token',{
    method:'POST',
    headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({
      client_id:process.env.DISCORD_CLIENT_ID,
      client_secret:process.env.DISCORD_CLIENT_SECRET,
      grant_type:'authorization_code',
      code,
      redirect_uri:callbackURL
    })
  }).then(r=>r.json())

  const user=await fetch('https://discord.com/api/users/@me',{
    headers:{Authorization:`Bearer ${data.access_token}`}
  }).then(r=>r.json())

  req.session.user={
    id:user.id,
    username:user.username,
    avatar:`https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`,
    canHR:true
  }
  res.redirect('/')
})

app.get('/api/me',(req,res)=>{
  if(!req.session.user) return res.sendStatus(401)
  res.json(req.session.user)
})

app.get('/api/staff',(req,res)=>{
  res.json(global.staffData||[])
})

app.get('/api/history',(req,res)=>{
  res.json(global.history||[])
})

app.post('/api/action',(req,res)=>{
  const {type,id,reason}=req.body
  global.history.push({
    time:new Date().toLocaleString(),
    action:type,
    target:id,
    reason
  })
  res.sendStatus(200)
})

const port=process.env.PORT||3000
;(async()=>{
  const server=app.listen(port,async()=>{
    await ngrok.kill()
    const url=await ngrok.connect({addr:port,authtoken:process.env.NGROK_AUTH_TOKEN})
    callbackURL=`${url}/auth/discord/callback`
    console.log('Dashboard:',url)
  })
})()
