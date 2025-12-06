const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

class ImageStitcher {
    constructor(targetHeight = 15000) {
        this.targetHeight = targetHeight;
        const exeName = process.platform === 'win32' ? 'rusty-smart-stitch.exe' : 'rusty-smart-stitch';
        this.exePath = path.join(__dirname, exeName);
    }

    async stitchChapter(chapterPath, outputPath) {
        fs.mkdirSync(outputPath, { recursive: true });

        const command = `"${this.exePath}" --input "${chapterPath}" --output "${outputPath}" --height ${this.targetHeight} --sensitivity 100 --scan-step 5 --edges 5 --quality 100`;

        try {
            console.log(`Running: ${command}`);
            execSync(command, { stdio: 'inherit' });
            
            const outputFiles = fs.readdirSync(outputPath)
                .filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f));
            
            console.log(`Chapter stitched into ${outputFiles.length} images`);
            return outputFiles.map(f => path.join(outputPath, f));
        } catch (error) {
            console.error(`Stitch error: ${error.message}`);
            throw error;
        }
    }

    async processAllChapters(downloadPath, outputBasePath) {
        const chapters = fs.readdirSync(downloadPath)
            .filter(f => fs.statSync(path.join(downloadPath, f)).isDirectory())
            .sort((a, b) => parseInt(a) - parseInt(b));

        const results = {};

        for (const chapter of chapters) {
            const chapterPath = path.join(downloadPath, chapter);
            const outputPath = path.join(outputBasePath, chapter);
            
            console.log(`\nProcessing chapter ${chapter}...`);
            const files = await this.stitchChapter(chapterPath, outputPath);
            results[chapter] = files.length;
        }

        return results;
    }
}

module.exports = ImageStitcher;
