const { Client } = require("discord.js-selfbot-v13");
const Groq = require("groq-sdk");
const express = require("express");
const fs = require('fs');
require("dotenv").config();

const app = express();
const client = new Client({ checkUpdate: false });
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const TARGET_GUILD_ID = "606391404804964352";
const LOG_FILE = 'bot_logs.txt';
const MEMORY_FILE = 'chat_memory.json';
const MAX_MEMORY = 10000000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- BẮT LỖI TOÀN CỤC (CHỐNG SẬP BOT) ---
client.on("error", (e) => logToFile(`⚠️ Discord Error: ${e.message}`));
process.on("unhandledRejection", (e) => logToFile(`⚠️ Lỗi chưa xử lý: ${e.message}`));
process.on("uncaughtException", (e) => logToFile(`⚠️ Lỗi hệ thống: ${e.message}`));

// Logging system
function logToFile(content) {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${content}\n`;
    fs.appendFileSync(LOG_FILE, logEntry);
    console.log(content);
}

// Memory System
let chatMemory = new Map();
try {
    if (fs.existsSync(MEMORY_FILE)) {
        const data = JSON.parse(fs.readFileSync(MEMORY_FILE, 'utf8'));
        chatMemory = new Map(Object.entries(data));
        logToFile(`📝 Loaded memory for ${chatMemory.size} channels`);
    }
} catch (e) {
    logToFile(`⚠️ Error loading memory: ${e.message}`);
}

function saveMemory() {
    try {
        const data = Object.fromEntries(chatMemory);
        fs.writeFileSync(MEMORY_FILE, JSON.stringify(data));
    } catch (e) {
        logToFile(`⚠️ Error saving memory: ${e.message}`);
    }
}

function updateMemory(channelId, role, content) {
    if (!chatMemory.has(channelId)) chatMemory.set(channelId, []);
    const history = chatMemory.get(channelId);
    history.push({ role, content });
    if (history.length > MAX_MEMORY) history.shift();
    saveMemory();
}

let isWindowOpen = false;
let messagesInWindow = [];

// --- CHAT LOGIC ---
async function chatWithGroq(channelId, userPrompt, userInfo) {
    try {
        let systemPrompt = "you are selena, a toxic person on discord";
        try {
            systemPrompt = fs.readFileSync('prompt.txt', 'utf8');
        } catch (e) {
            logToFile(`⚠️ Không tìm thấy prompt.txt, dùng prompt mặc định: ${e.message}`);
        }

        const history = chatMemory.get(channelId) || [];

        // FORMAT ĐÚNG Ý BẠN: [username, id, displayName, nickname]
        const formattedPrompt = `USER: [${userInfo.username}, ${userInfo.id}, ${userInfo.displayName}, ${userInfo.nickname}] "${userPrompt}"`;

        const messages = [
            { role: "system", content: systemPrompt },
            ...history,
            { role: "user", content: formattedPrompt },
        ];

        const completion = await groq.chat.completions.create({
            messages,
            model: "llama-3.3-70b-versatile",
        });

        const reply = completion.choices[0]?.message?.content || null;
        if (reply) {
            updateMemory(channelId, "user", formattedPrompt);
            updateMemory(channelId, "assistant", reply);
        }
        return reply;
    } catch (err) {
        logToFile(`❌ Lỗi Groq: ${err.message}`);
        return null;
    }
}

async function processEvenLogic(message, prompt) {
    // Ép bot tải dữ liệu member mới nhất thay vì dùng cache
    let member;
    try {
        member = await message.guild.members.fetch(message.author.id);
    } catch (e) {
        member = message.member; // Nếu fetch lỗi thì dùng dữ liệu sẵn có
    }

    const userInfo = { 
        username: message.author.username || "unknown", 
        id: message.author.id || "0",
        // Tên hiển thị toàn cầu
        displayName: message.author.displayName || message.author.username,
        // Nickname trong server (nếu không có thì để "None")
        
    };

    const replyContent = await chatWithGroq(message.channelId, prompt, userInfo);
    if (!replyContent) return;

    // Wait & Typing
    await sleep(Math.floor(Math.random() * 2001) + 7000);
    const typingDuration = Math.floor(Math.random() * 2001) + 7000;
    const startTyping = Date.now();
    while (Date.now() - startTyping < typingDuration) {
        await message.channel.sendTyping().catch(() => {});
        await sleep(4000);
    }

    // Gửi tin nhắn có try-catch tránh lỗi 503
    try {
        if (Math.random() < 0.5) {
            await message.reply(replyContent);
        } else {
            await message.channel.send(replyContent);
        }
        logToFile(`✅ Đã rep ${userInfo.username} (${userInfo.nickname})`);
    } catch (e) {
        logToFile(`❌ Lỗi gửi tin: ${e.message}`);
    }

    // Cửa sổ chờ 2s
    isWindowOpen = true;
    messagesInWindow = [];
    await sleep(8500);
    isWindowOpen = false;

    if (messagesInWindow.length > 0) {
        const nextMsg = messagesInWindow.find(m => m.author.id === message.author.id) || messagesInWindow[messagesInWindow.length - 1];
        // 90% tiếp tục chửi tiếp
        if (Math.random() < 0.9) {
            logToFile(`🔄 Vòng lặp: 90% Chẵn.`);
            await processEvenLogic(nextMsg.msgObj, nextMsg.content);
        }
    }
}

client.on("messageCreate", async (message) => {
    if (message.author.bot || message.author.id === client.user.id) return;
    if (message.guildId !== TARGET_GUILD_ID) return;

    const isMentioned = message.mentions.has(client.user.id);
    const isReplyToBot = message.reference && await message.fetchReference()
        .then((msg) => msg.author.id === client.user.id)
        .catch(() => false);

    if (isWindowOpen) {
        messagesInWindow.push({
            author: message.author,
            content: message.content.replace(/<@(!|&)?\d+>/g, "").trim(),
            msgObj: message,
        });
    }

    if (isMentioned || isReplyToBot) {
        if (isWindowOpen) return;
        // Tỷ lệ 90% Chẵn cho tin nhắn mới
        if (Math.random() < 0.9) {
            logToFile(`🎲 Tỉ lệ 90% Chẵn từ ${message.author.username}`);
            const prompt = message.content.replace(/<@(!|&)?\d+>/g, "").trim() || "helo";
            await processEvenLogic(message, prompt);
        } else {
            logToFile(`🎲 Tỉ lệ 10% Lẻ: Bỏ qua.`);
        }
    }
});

// --- VOICE STREAK LOGIC ---
let voiceStart = 0;
let voiceDur = 0;
let isVoiceConnecting = false;
let voiceStreak = 0; 

async function joinVC() {
    if (isVoiceConnecting) return;
    isVoiceConnecting = true;
    try {
        const guild = client.guilds.cache.get(TARGET_GUILD_ID);
        const vc = guild?.channels.cache.filter(c => c.type === "GUILD_VOICE").random();
        if (vc) {
            logToFile(`🔊 Đủ 3/3 điểm! Vào VC: ${vc.name}`);
            await client.voice.joinChannel(vc.id, { selfMute: true, selfDeaf: false });
            voiceStart = Date.now();
            // Random từ 30p đến 12h
            voiceDur = Math.floor(Math.random() * (12 * 3600000 - 1800000)) + 1800000;
            voiceStreak = 0; 
        }
    } catch (e) {
        logToFile(`❌ Lỗi Voice: ${e.message}`);
    } finally {
        isVoiceConnecting = false;
    }
}

async function voiceDiceRoll() {
    // Tỉ lệ 85% chẵn (Math.random() trả về từ 0 đến 1, < 0.85 nghĩa là lấy 85%)
    const isEven = Math.random() < 0.85; 
    const waitTime = 20 * 60 * 1000; // Lưu ý: 20 phút (nếu muốn 30 phút hãy đổi thành 30 * 60 * 1000)

    if (isEven) {
        voiceStreak++;
        logToFile(`🎲 Voice CHẴN (85%): Streak ${voiceStreak}/2`);
    } else {
        // Nếu thua (Lẻ), trừ 1 streak hoặc về 0 tùy bạn muốn, ở đây giữ nguyên logic trừ dần
        if (voiceStreak > 0) voiceStreak--;
        logToFile(`🎲 Voice LẺ (15%): Streak ${voiceStreak}/2`);
    }

    // Đổi điều kiện thành 2 streak để join
    if (voiceStreak >= 2) {
        logToFile(`🔥 Đạt 2 streak! Đang tiến hành join VC...`);
        await joinVC();
        // Sau khi join xong thường người ta sẽ reset streak hoặc làm gì đó tiếp theo
    } else {
        logToFile(`💤 Chưa đủ streak (${voiceStreak}/2). Đợi lần quay tới...`);
        setTimeout(voiceDiceRoll, waitTime);
    }
}

client.on("ready", () => {
    logToFile(`🚀 Bot online: ${client.user.tag}`);
    voiceDiceRoll();
});

client.on("voiceStateUpdate", (oldState, newState) => {
    if (oldState.member.id === client.user.id && oldState.channelId && !newState.channelId) {
        logToFile("⚠️ Mất kết nối Voice.");
        voiceStart = 0;
        setTimeout(voiceDiceRoll, 30 * 60 * 1000);
    }
});

setInterval(() => {
    if (voiceStart > 0 && Date.now() - voiceStart > voiceDur) {
        logToFile("🔄 Hết giờ ngồi VC, out...");
        client.guilds.cache.get(TARGET_GUILD_ID)?.me.voice.disconnect();
        voiceStart = 0;
        setTimeout(voiceDiceRoll, 30 * 60 * 1000);
    }
}, 60000);

// Server Keep-alive
app.get("/", (req, res) => res.send("Bot Selena is running."));
app.listen(process.env.PORT || 5000);
client.login(process.env.DISCORD_TOKEN);
