require('dotenv').config();
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } = require('discord.js');
const WebtoonDownloader = require('./src/downloader');
const GoogleDriveUploader = require('./src/drive');
const ImageStitcher = require('./src/stitcher');
const fs = require('fs');
const path = require('path');
const http = require('http');

// Simple HTTP server to keep Render free tier happy
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Bot is running!');
}).listen(PORT, () => {
    console.log(`HTTP server running on port ${PORT}`);
});

const client = new Client({
    intents: [GatewayIntentBits.Guilds]
});

const TEMP_DIR = path.join(__dirname, 'temp_downloads');

if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
}

const commands = [
    new SlashCommandBuilder()
        .setName('nav')
        .setDescription('Download Naver Webtoon and upload to Google Drive')
        .addStringOption(option =>
            option.setName('comic_id')
                .setDescription('The comic ID from Naver Webtoon URL')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('start')
                .setDescription('Start chapter number')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('end')
                .setDescription('End chapter number (optional, defaults to start)')
                .setRequired(false))
        .setIntegrationTypes([0, 1])
        .setContexts([0, 1, 2])
];

client.once('ready', async () => {
    console.log(`Bot logged in as ${client.user.tag}`);
    
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    
    try {
        console.log('Registering slash commands...');
        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commands }
        );
        console.log('Slash commands registered!');
    } catch (error) {
        console.error('Error registering commands:', error);
    }
});

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName !== 'nav') return;

    const comicId = interaction.options.getString('comic_id');
    const startChapter = interaction.options.getInteger('start');
    const endChapter = interaction.options.getInteger('end') || startChapter;

    if (startChapter > endChapter) {
        await interaction.reply('Start chapter must be less than or equal to end chapter!');
        return;
    }

    await interaction.deferReply();

    try {
        const downloader = new WebtoonDownloader();
        const stitcher = new ImageStitcher(15000);
        const driveUploader = new GoogleDriveUploader();

        await interaction.editReply('Fetching comic info...');
        const title = await downloader.getComicTitle(comicId);
        
        await interaction.editReply(`**${title}**\nDownloading chapters ${startChapter}-${endChapter}...`);

        const downloadPath = path.join(TEMP_DIR, `${comicId}_${Date.now()}`);
        const stitchedPath = path.join(TEMP_DIR, `${comicId}_${Date.now()}_stitched`);
        
        const result = await downloader.downloadChapters(comicId, startChapter, endChapter, downloadPath, async (progress) => {
            await interaction.editReply(`**${title}**\n${progress}`).catch(() => {});
        });

        await interaction.editReply(`**${title}**\nDownloaded ${result.totalImages} images\nStitching images...`);

        const stitchResults = await stitcher.processAllChapters(downloadPath, stitchedPath);
        const totalStitched = Object.values(stitchResults).reduce((a, b) => a + b, 0);

        await interaction.editReply(`**${title}**\nStitched into ${totalStitched} images\nUploading to Google Drive...`);

        const driveLink = await driveUploader.uploadFolder(stitchedPath, title, async (progress) => {
            await interaction.editReply(`**${title}**\nStitched into ${totalStitched} images\n${progress}`).catch(() => {});
        });

        fs.rmSync(downloadPath, { recursive: true, force: true });
        fs.rmSync(stitchedPath, { recursive: true, force: true });

        await interaction.editReply(
            `**Complete!**\n` +
            `Comic: **${title}**\n` +
            `Chapters: ${startChapter}-${endChapter}\n` +
            `Stitched images: ${totalStitched}\n` +
            `Google Drive: ${driveLink}`
        );

    } catch (error) {
        console.error('Error:', error);
        await interaction.editReply(`Error: ${error.message}`);
    }
});

client.login(process.env.DISCORD_TOKEN);
