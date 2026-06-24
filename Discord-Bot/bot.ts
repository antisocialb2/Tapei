import { Client, GatewayIntentBits, Message } from 'discord.js';
import Groq from 'groq-sdk';
import express from 'express';

// Create a simple Express app to bind to a port (required by Replit to keep the app alive)
const app = express();
app.get('/', (req, res) => res.send('Discord Bot is running!'));
const port = process.env.PORT || 5000;
app.listen(port, () => console.log(`Web server running on port ${port}`));

// Initialize Discord Client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// Initialize Groq SDK
const groq = new Groq({
  // Using the API key provided by the user
  apiKey: process.env.GROQ_API_KEY || "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"
});

client.on('ready', () => {
  console.log(`Logged in as ${client.user?.tag}!`);
  console.log('Bot is ready to receive messages.');
});

client.on('messageCreate', async (message: Message) => {
  // Ignore messages from other bots
  if (message.author.bot) return;

  // Check if the bot was mentioned
  if (message.mentions.has(client.user!.id)) {
    const prompt = message.content.replace(`<@${client.user!.id}>`, '').trim();
    
    if (!prompt) {
      await message.reply('Hello! How can I help you today?');
      return;
    }

    try {
      // Show typing indicator while waiting for Groq API
      await message.channel.sendTyping();

      const chatCompletion = await groq.chat.completions.create({
        messages: [
          { role: 'system', content: 'You are a helpful and concise Discord bot.' },
          { role: 'user', content: prompt }
        ],
        model: 'llama-3.3-70b-versatile', // Using LLaMA 3 8B model via Groq
        temperature: 0.7,
        max_tokens: 1024,
      });

      const response = chatCompletion.choices[0]?.message?.content;
      
      if (response) {
        // Discord has a 2000 character limit per message
        if (response.length > 2000) {
          // Send in chunks or truncate. For simplicity, we truncate here.
          await message.reply(response.substring(0, 1996) + '...');
        } else {
          await message.reply(response);
        }
      } else {
        await message.reply("I couldn't generate a response. Please try again.");
      }
    } catch (error) {
      console.error('Error generating response from Groq:', error);
      await message.reply('Sorry, I encountered an error while processing your request with Groq.');
    }
  }
});

// Log in using the Discord token provided by the user
const token = process.env.DISCORD_TOKEN || "NDQ2OTIzNzE3ODgxMjMzNDQw.GLliLy.n92mQqS3NTPTlGkVRn0eJ_8Yk15fTf-UibnmxY";
client.login(token).catch(err => {
  console.error("Failed to login to Discord:", err);
});
