require('dotenv').config();
const { Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes } = require('discord.js');
const express = require('express');
const cors = require('cors');

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});

const staffDB = {}; // in-memory

function resolveRole(member) {
  if (member.permissions.has('Administrator') || member.permissions.has('ManageGuild')) return 'Ownership+';
  if (member.permissions.has('ManageRoles')) return 'HR';
  if (member.permissions.has('ModerateMembers')) return 'Staff';
  return 'Guest';
}

function ensureStaff(member) {
  staffDB[member.id] ??= {
    id: member.id,
    username: member.user.username,
    role: resolveRole(member),
    strikes: 0,
    history: [],
    moderation: { warn:0, mute:0, kick:0, ban:0 }
  };
  staffDB[member.id].role = resolveRole(member);
  staffDB[member.id].username = member.user.username;
}

const commands = [
  new SlashCommandBuilder().setName('stafflist').setDescription('Show staff list'),
  new SlashCommandBuilder().setName('promote').setDescription('Promote staff')
    .addUserOption(o=>o.setName('user').setRequired(true))
    .addStringOption(o=>o.setName('reason')),
  new SlashCommandBuilder().setName('demote').setDescription('Demote staff')
    .addUserOption(o=>o.setName('user').setRequired(true))
    .addStringOption(o=>o.setName('reason')),
  new SlashCommandBuilder().setName('strike').setDescription('Strike staff')
    .addUserOption(o=>o.setName('user').setRequired(true))
    .addStringOption(o=>o.setName('reason')),
  new SlashCommandBuilder().setName('syncroles').setDescription('Sync roles')
];

const rest = new REST({version:'10'}).setToken(process.env.TOKEN);
(async()=>{
  await rest.put(
    Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
    { body: commands.map(c=>c.toJSON()) }
  );
})();

client.on('ready', ()=>{
  console.log('Bot online');
  client.user.setActivity('Staff & Community');
});

client.on('interactionCreate', async i=>{
  if(!i.isChatInputCommand()) return;

  const member = await i.guild.members.fetch(i.user.id);
  ensureStaff(member);

  const isHR = ['HR','Ownership+'].includes(staffDB[i.user.id].role);
  const targetUser = i.options.getUser('user');
  if(targetUser) {
    const tMember = await i.guild.members.fetch(targetUser.id);
    ensureStaff(tMember);
  }

  if(i.commandName === 'stafflist') {
    return i.reply(
      Object.values(staffDB)
        .filter(s=>s.role!=='Guest')
        .map(s=>`${s.username} — ${s.role} — ${s.strikes} strikes`)
        .join('\n') || 'No staff'
    );
  }

  if(i.commandName === 'syncroles') {
    const members = await i.guild.members.fetch();
    members.forEach(m=>ensureStaff(m));
    return i.reply('Roles synced');
  }

  if(!isHR) return i.reply({content:'❌ HR+ only',ephemeral:true});

  const reason = i.options.getString('reason') || 'No reason';
  const target = staffDB[targetUser.id];

  if(i.commandName==='promote') target.role='Senior Staff';
  if(i.commandName==='demote') target.role='Staff';
  if(i.commandName==='strike') target.strikes++;

  target.history.push({
    action: i.commandName,
    by: i.user.username,
    reason,
    date: new Date()
  });

  i.reply(`✅ ${i.commandName} applied to ${target.username}`);
});

// ===== API =====
const api = express();
api.use(cors());
api.use(express.json());

api.get('/api/staff', (_,res)=>res.json(Object.values(staffDB)));

api.post('/api/action',(req,res)=>{
  const { executorId, targetId, type, reason } = req.body;
  const exec = staffDB[executorId];
  if(!exec || !['HR','Ownership+'].includes(exec.role))
    return res.json({error:'NO_PERMISSION'});

  const target = staffDB[targetId];
  if(!target) return res.json({error:'NO_TARGET'});

  if(type==='promote') target.role='Senior Staff';
  if(type==='demote') target.role='Staff';
  if(type==='strike') target.strikes++;

  target.history.push({action:type,by:exec.username,reason,date:new Date()});
  res.json({ok:true});
});

api.listen(process.env.API_PORT);
client.login(process.env.TOKEN);

module.exports = { staffDB };
