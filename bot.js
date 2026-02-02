require('dotenv').config()
const {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  PermissionsBitField,
  EmbedBuilder,
  REST,
  Routes
} = require('discord.js')

/* =======================
   GLOBAL SHARED DATA
======================= */
global.staffData = []
global.history = []

function getRanks(){
  return ['Staff','Senior Staff','Manager','HR','Ownership']
}

/* =======================
   RANK LOGIC
======================= */
function getRank(member){
  if (
    member.id === member.guild.ownerId ||
    member.permissions.has(PermissionsBitField.Flags.Administrator) ||
    member.permissions.has(PermissionsBitField.Flags.ManageGuild)
  ) return 'Ownership'

  if (member.permissions.has(PermissionsBitField.Flags.ManageRoles))
    return 'HR'

  if (member.permissions.has(PermissionsBitField.Flags.ModerateMembers))
    return 'Staff'

  return null
}

function canAct(executor, target){
  const ranks = getRanks()
  return ranks.indexOf(executor.rank) > ranks.indexOf(target.rank)
}

/* =======================
   CLIENT
======================= */
const client = new Client({
  intents:[
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers
  ]
})

/* =======================
   SLASH COMMANDS
======================= */
const commands = [
  new SlashCommandBuilder()
    .setName('promote')
    .setDescription('Promote a staff member')
    .addUserOption(o=>o.setName('user').setDescription('Staff member').setRequired(true))
    .addStringOption(o=>o.setName('reason').setDescription('Reason').setRequired(true)),

  new SlashCommandBuilder()
    .setName('demote')
    .setDescription('Demote a staff member')
    .addUserOption(o=>o.setName('user').setDescription('Staff member').setRequired(true))
    .addStringOption(o=>o.setName('reason').setDescription('Reason').setRequired(true)),

  new SlashCommandBuilder()
    .setName('strike')
    .setDescription('Strike a staff member')
    .addUserOption(o=>o.setName('user').setDescription('Staff member').setRequired(true))
    .addStringOption(o=>o.setName('reason').setDescription('Reason').setRequired(true)),

  new SlashCommandBuilder()
    .setName('stafflist')
    .setDescription('View staff list'),

  new SlashCommandBuilder()
    .setName('syncroles')
    .setDescription('Sync staff roles from permissions')
]

/* =======================
   REGISTER COMMANDS
======================= */
const rest = new REST({ version:'10' }).setToken(process.env.DISCORD_BOT_TOKEN)

;(async()=>{
  await rest.put(
    Routes.applicationGuildCommands(
      process.env.DISCORD_CLIENT_ID,
      process.env.GUILD_ID
    ),
    { body: commands }
  )
})()

/* =======================
   READY
======================= */
client.once('ready', async()=>{
  client.user.setActivity('staff & community')

  const guild = await client.guilds.fetch(process.env.GUILD_ID)
  const members = await guild.members.fetch()

  global.staffData = []
  members.forEach(m=>{
    const rank = getRank(m)
    if(rank){
      global.staffData.push({
        id: m.id,
        username: m.user.username,
        avatar: m.user.displayAvatarURL(),
        rank,
        strikes: 0
      })
    }
  })

  console.log(`✅ Bot online as ${client.user.tag}`)
})

/* =======================
   INTERACTIONS
======================= */
client.on('interactionCreate', async interaction=>{
  if(!interaction.isChatInputCommand()) return

  const member = interaction.member
  const myRank = getRank(member)

  if(!myRank)
    return interaction.reply({ content:'❌ Staff only', ephemeral:true })

  if(interaction.commandName === 'stafflist'){
    const embed = new EmbedBuilder()
      .setTitle('Staff List')
      .setColor('#5865F2')
      .setDescription(
        global.staffData.map(s =>
          `**${s.username}** — ${s.rank} | Strikes: ${s.strikes}`
        ).join('\n')
      )

    return interaction.reply({ embeds:[embed] })
  }

  if(interaction.commandName === 'syncroles'){
    if(myRank !== 'Ownership')
      return interaction.reply({ content:'❌ Ownership only', ephemeral:true })

    const guild = interaction.guild
    const members = await guild.members.fetch()

    global.staffData = []
    members.forEach(m=>{
      const rank = getRank(m)
      if(rank){
        global.staffData.push({
          id:m.id,
          username:m.user.username,
          avatar:m.user.displayAvatarURL(),
          rank,
          strikes:0
        })
      }
    })

    return interaction.reply('✅ Staff roles synced')
  }

  const targetUser = interaction.options.getUser('user')
  const reason = interaction.options.getString('reason')

  const executor = global.staffData.find(s=>s.id===member.id)
  const target = global.staffData.find(s=>s.id===targetUser.id)

  if(!target)
    return interaction.reply({ content:'❌ Target is not staff', ephemeral:true })

  if(!canAct(executor, target))
    return interaction.reply({ content:'❌ Target is same or higher rank', ephemeral:true })

  if(interaction.commandName === 'strike'){
    target.strikes++

    global.history.push({
      time:new Date().toLocaleString(),
      action:'Strike',
      executor:member.user.username,
      target:target.username,
      reason
    })

    return interaction.reply({
      embeds:[
        new EmbedBuilder()
          .setColor('#ED4245')
          .setTitle('Staff Strike')
          .setDescription(`⚠ **${target.username}** received a strike\n**Reason:** ${reason}`)
      ]
    })
  }

  if(interaction.commandName === 'promote'){
    const ranks = getRanks()
    target.rank = ranks[ranks.indexOf(target.rank)+1] || target.rank

    global.history.push({
      time:new Date().toLocaleString(),
      action:'Promote',
      executor:member.user.username,
      target:target.username,
      reason
    })

    return interaction.reply({
      embeds:[
        new EmbedBuilder()
          .setColor('#57F287')
          .setDescription(`⬆ **${target.username}** promoted\n**Reason:** ${reason}`)
      ]
    })
  }

  if(interaction.commandName === 'demote'){
    const ranks = getRanks()
    target.rank = ranks[ranks.indexOf(target.rank)-1] || target.rank

    global.history.push({
      time:new Date().toLocaleString(),
      action:'Demote',
      executor:member.user.username,
      target:target.username,
      reason
    })

    return interaction.reply({
      embeds:[
        new EmbedBuilder()
          .setColor('#FEE75C')
          .setDescription(`⬇ **${target.username}** demoted\n**Reason:** ${reason}`)
      ]
    })
  }
})

client.login(process.env.DISCORD_BOT_TOKEN)

