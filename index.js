require('dotenv').config();
const fs = require('fs');
const axios = require('axios');
const { Client, GatewayIntentBits } = require('discord.js');

// ---- CONFIG --------------------------------------------------
const TOKEN = process.env.DISCORD_TOKEN;
let LANG = (process.env.LANG || 'en').toLowerCase();
if (!['es', 'en'].includes(LANG)) {
  console.warn('⚠️ LANG inválido. Usando "en" por defecto.');
  LANG = 'en';
}
console.log(`🌍 Idioma activo: ${LANG}`);

// ---- TRANSLATIONS -------------------------------------------
const TRANSLATIONS = {
  es: {
    type: 'Tipo',
    height: 'Altura',
    weight: 'Peso',
    noDesc: 'Sin descripción disponible.',
    notFound: '🚫 No encontré ese Pokémon. Revisa nombre o número.',
    saved: (n) => `💾 ¡${n} guardado como favorito!`,
    already: (n) => `✅ Ya habías guardado ${n}.`,
    removed: (n) => `🗑️ Eliminado ${n} de tu equipo.`,
    noSuch: (n) => `❌ ${n} no está en tu equipo.`,
    teamEmpty: '👥 Aún no tienes Pokémon en tu equipo. Usa `!save`.',
    yourTeam: '👥 Tu equipo:',
    evoChain: '🔁 Cadena evolutiva:',
    helpTitle: '📖 Comandos disponibles',
    usage: (cmd) => `❗ Usa el comando así: \`${cmd} pikachu\``
  },
  en: {
    type: 'Type',
    height: 'Height',
    weight: 'Weight',
    noDesc: 'No description available.',
    notFound: '🚫 Pokémon not found. Check the name or number.',
    saved: (n) => `💾 Saved ${n} to your team!`,
    already: (n) => `✅ You already saved ${n}.`,
    removed: (n) => `🗑️ Removed ${n} from your team.`,
    noSuch: (n) => `❌ ${n} is not in your team.`,
    teamEmpty: '👥 Your team is empty. Use `!save`.',
    yourTeam: '👥 Your team:',
    evoChain: '🔁 Evolution line:',
    helpTitle: '📖 Available commands',
    usage: (cmd) => `❗ Use the command like: \`${cmd} pikachu\``
  }
};
const T = TRANSLATIONS[LANG];

// ---- DISCORD CLIENT -----------------------------------------
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// ---- DATA ----------------------------------------------------
const favFile = 'favorites.json';
let favorites = fs.existsSync(favFile) ? JSON.parse(fs.readFileSync(favFile)) : {};

// ---- UTILS ---------------------------------------------------
const formatStats = (p) => {
  const heightM = (p.height / 10).toFixed(1);
  const weightKg = (p.weight / 10).toFixed(1);
  const types = p.types.map(t => t.type.name).join(', ');
  return { types, height: `${heightM} m`, weight: `${weightKg} kg` };
};

const getDescription = async (id) => {
  try {
    const { data } = await axios.get(`https://pokeapi.co/api/v2/pokemon-species/${id}`);
    const entry = data.flavor_text_entries.find(e => e.language.name === LANG) ||
                  data.flavor_text_entries.find(e => e.language.name === 'en');
    return entry ? entry.flavor_text.replace(/[\f\n]/g, ' ') : T.noDesc;
  } catch {
    return T.noDesc;
  }
};

const getEvoLine = async (id) => {
  try {
    const { data: species } = await axios.get(`https://pokeapi.co/api/v2/pokemon-species/${id}`);
    const { data: chainData } = await axios.get(species.evolution_chain.url);
    const line = [];
    let link = chainData.chain;
    while (link) {
      line.push(link.species.name.toUpperCase());
      link = link.evolves_to[0];
    }
    return line.join(' ➜ ');
  } catch {
    return null;
  }
};

// ---- BOT READY ----------------------------------------------
client.once('ready', () => console.log(`✅ Bot ready as ${client.user.tag}`));

// ---- MESSAGE HANDLER ----------------------------------------
client.on('messageCreate', async (m) => {
  if (m.author.bot) return;

  const [cmd, ...args] = m.content.trim().split(/\s+/);
  const arg = args[0]?.toLowerCase();

  switch (cmd) {
    case '!help':
      return m.reply(
        `**${T.helpTitle}**\n` +
        '`!pokemon <name|number>` – stats\n' +
        '`!info <name|number>` – stats + description\n' +
        '`!shiny <name|number>` – shiny sprite ✨\n' +
        '`!evo <name|number>` – evolution line 🔁\n' +
        '`!random` – random Pokémon\n' +
        '`!save <name|number>` – add to team\n' +
        '`!remove <name|number>` – remove from team\n' +
        '`!team` – show your saved Pokémon\n' +
        '`!help` – this message'
      );

    case '!random': {
      const r = Math.floor(Math.random() * 898) + 1;
      return showPokemon(m, r);
    }

    case '!team': {
      const team = favorites[m.author.id] || [];
      return m.reply(team.length ? `${T.yourTeam}\n${team.map(n => '• ' + n.toUpperCase()).join('\n')}` : T.teamEmpty);
    }

    case '!save':
      return savePokemon(m, arg);

    case '!remove':
    case '!unsave':
      return removePokemon(m, arg);

    case '!evo':
      return showEvolution(m, arg);

    case '!pokemon':
    case '!info':
    case '!shiny':
      return showPokemon(m, arg, cmd);
  }
});

// ---- COMMAND IMPLEMENTATIONS --------------------------------
async function savePokemon(msg, arg) {
  if (!arg) return msg.reply(T.usage('!save'));
  try {
    const idOrName = isNaN(arg) ? arg : parseInt(arg);
    const { data: p } = await axios.get(`https://pokeapi.co/api/v2/pokemon/${idOrName}`);
    const name = p.name;
    const uid = msg.author.id;
    favorites[uid] = favorites[uid] || [];
    if (favorites[uid].includes(name)) return msg.reply(T.already(name.toUpperCase()));
    favorites[uid].push(name);
    fs.writeFileSync(favFile, JSON.stringify(favorites, null, 2));
    return msg.reply(T.saved(name.toUpperCase()));
  } catch {
    return msg.reply(T.notFound);
  }
}

async function removePokemon(msg, arg) {
  if (!arg) return msg.reply(T.usage('!remove'));
  const uid = msg.author.id;
  if (!favorites[uid]) favorites[uid] = [];
  const name = arg.toLowerCase();
  const byNum = !isNaN(name);
  // Convert number to actual name if needed
  let realName = name;
  if (byNum) {
    try {
      const { data: p } = await axios.get(`https://pokeapi.co/api/v2/pokemon/${parseInt(name)}`);
      realName = p.name;
    } catch {
      return msg.reply(T.notFound);
    }
  }
  const idx = favorites[uid].indexOf(realName);
  if (idx === -1) return msg.reply(T.noSuch(realName.toUpperCase()));
  favorites[uid].splice(idx, 1);
  fs.writeFileSync(favFile, JSON.stringify(favorites, null, 2));
  return msg.reply(T.removed(realName.toUpperCase()));
}

async function showPokemon(msg, arg, mode = '!pokemon') {
  if (!arg) return msg.reply(T.usage(mode));
  const idOrName = isNaN(arg) ? arg : parseInt(arg);
  try {
    const { data: p } = await axios.get(`https://pokeapi.co/api/v2/pokemon/${idOrName}`);
    const { types, height, weight } = formatStats(p);

    let text = `**#${p.id} ${p.name.toUpperCase()}**\n` +
               `${T.type}: ${types}\n${T.height}: ${height}\n${T.weight}: ${weight}`;

    if (mode === '!info') text += `\n\n_${await getDescription(idOrName)}_`;

    const img = mode === '!shiny' ? p.sprites.front_shiny : p.sprites.front_default;
    await msg.reply({ content: text, files: [img] });
  } catch {
    msg.reply(T.notFound);
  }
}

async function showEvolution(msg, arg) {
  if (!arg) return msg.reply(T.usage('!evo'));
  const idOrName = isNaN(arg) ? arg : parseInt(arg);
  const line = await getEvoLine(idOrName);
  return line ? msg.reply(`${T.evoChain} ${line}`) : msg.reply(T.notFound);
}

// ---- LOGIN ---------------------------------------------------
client.login(TOKEN);
