require('dotenv').config();

  const fs = require('fs');
const { Client, GatewayIntentBits } = require('discord.js');
const axios = require('axios');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const TOKEN = process.env.DISCORD_TOKEN;

// --- Leer o crear archivo de favoritos ---
const favFile = 'favorites.json';
let favorites = {};
if (fs.existsSync(favFile)) {
  favorites = JSON.parse(fs.readFileSync(favFile));
}

const formatStats = (p) => {
  const heightM = (p.height / 10).toFixed(1);
  const weightKg = (p.weight / 10).toFixed(1);
  const types = p.types.map(t => t.type.name).join(', ');
  return { types, height: `${heightM} m`, weight: `${weightKg} kg` };
};

const getDescription = async (nameOrId) => {
  try {
    const res = await axios.get(`https://pokeapi.co/api/v2/pokemon-species/${nameOrId}`);
    const entry = res.data.flavor_text_entries.find(e => e.language.name === 'es') ||
                  res.data.flavor_text_entries.find(e => e.language.name === 'en');
    return entry ? entry.flavor_text.replace(/\f|\n/g, ' ') : 'Sin descripción disponible.';
  } catch {
    return 'Sin descripción disponible.';
  }
};

client.once('ready', () => {
  console.log(`✅ Bot encendido como ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  const [cmd, arg] = message.content.trim().split(/\s+/);
  const id = arg?.toLowerCase();

  // AYUDA
  if (cmd === '!help') {
    return message.reply(
      '**📖 Comandos disponibles**\n' +
      '`!pokemon <nombre|número>` – Stats normales\n' +
      '`!info <nombre|número>` – Stats + descripción Pokédex\n' +
      '`!shiny <nombre|número>` – Stats + sprite shiny ✨\n' +
      '`!random` – Pokémon aleatorio\n' +
      '`!save <nombre>` – Guarda tu Pokémon favorito\n' +
      '`!help` – Muestra este mensaje'
    );
  }

  // RANDOM
  if (cmd === '!random') {
    const randomId = Math.floor(Math.random() * 898) + 1;
    return handlePokemon(message, randomId, false, false);
  }

  // 🔍 !pokemon, !info, !shiny
  if (cmd === '!pokemon' || cmd === '!info' || cmd === '!shiny') {
    if (!id) return message.reply(`❗ Usa el comando así: \`${cmd} pikachu\``);
    return handlePokemon(
      message,
      isNaN(id) ? id : parseInt(id),
      cmd === '!info',
      cmd === '!shiny'
    );
  }

  // 💾 !save
  if (cmd === '!save') {
    if (!id) return message.reply('❗ Usa el comando así: `!save pikachu`');
    const userId = message.author.id;
    if (!favorites[userId]) favorites[userId] = [];
    if (!favorites[userId].includes(id)) {
      favorites[userId].push(id);
      fs.writeFileSync(favFile, JSON.stringify(favorites, null, 2));
      return message.reply(`💾 ¡${id.toUpperCase()} guardado como favorito!`);
    } else {
      return message.reply(`✅ Ya habías guardado ${id.toUpperCase()}.`);
    }
  }
});

// 🔁 Función principal para mostrar el Pokémon
async function handlePokemon(msg, nameOrId, withDesc = false, shiny = false) {
  try {
    const res = await axios.get(`https://pokeapi.co/api/v2/pokemon/${nameOrId}`);
    const p = res.data;
    const { types, height, weight } = formatStats(p);

    let content = `**#${p.id} ${p.name.toUpperCase()}**\nTipo: ${types}\nAltura: ${height}\nPeso: ${weight}`;
    if (withDesc) {
      const desc = await getDescription(nameOrId);
      content += `\n\n_${desc}_`;
    }

    const image = shiny ? p.sprites.front_shiny : p.sprites.front_default;

    if (!image) return msg.reply('🚫 No encontré imagen para este Pokémon.');

    await msg.reply({ content, files: [image] });
  } catch {
    msg.reply('🚫 No encontré ese Pokémon. Revisa el nombre o número.');
  }
}

client.login(TOKEN);