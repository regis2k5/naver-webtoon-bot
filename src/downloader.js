const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

class WebtoonDownloader {
    constructor() {
        this.headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Referer': 'https://comic.naver.com/'
        };
    }

    async getComicTitle(comicId) {
        try {
            const url = `https://comic.naver.com/webtoon/list?titleId=${comicId}`;
            const response = await axios.get(url, { headers: this.headers });
            const $ = cheerio.load(response.data);
            
            const metaTitle = $('meta[property="og:title"]').attr('content');
            if (metaTitle) {
                return metaTitle.replace(/[<>:"/\\|?*]/g, '-');
            }
            return `comic_${comicId}`;
        } catch (error) {
            console.error('Error getting comic title:', error.message);
            return `comic_${comicId}`;
        }
    }

    async getChapterImages(comicId, chapter) {
        const url = `https://comic.naver.com/webtoon/detail?titleId=${comicId}&no=${chapter}`;
        
        try {
            const response = await axios.get(url, { headers: this.headers });
            const $ = cheerio.load(response.data);
            
            const images = [];
            $('div.wt_viewer img').each((i, el) => {
                const src = $(el).attr('src');
                if (src && src.includes('comic.naver.net')) {
                    images.push(src);
                }
            });

            if (images.length === 0) {
                $('body > div:nth-of-type(1) > div:nth-of-type(3) > div:nth-of-type(1) img').each((i, el) => {
                    const src = $(el).attr('src');
                    if (src) images.push(src);
                });
            }

            return images;
        } catch (error) {
            console.error(`Error fetching chapter ${chapter}:`, error.message);
            return [];
        }
    }

    async downloadImage(url, filepath, retries = 3) {
        for (let attempt = 0; attempt < retries; attempt++) {
            try {
                const response = await axios.get(url, {
                    headers: this.headers,
                    responseType: 'arraybuffer',
                    timeout: 30000
                });

                fs.writeFileSync(filepath, response.data);
                return true;
            } catch (error) {
                if (attempt < retries - 1) {
                    await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
                }
            }
        }
        return false;
    }

    async downloadChapters(comicId, startChapter, endChapter, outputPath, onProgress) {
        fs.mkdirSync(outputPath, { recursive: true });
        
        let totalImages = 0;
        let downloadedImages = 0;

        for (let chapter = startChapter; chapter <= endChapter; chapter++) {
            if (onProgress) {
                await onProgress(`Fetching chapter ${chapter}/${endChapter}...`);
            }

            const images = await this.getChapterImages(comicId, chapter);
            
            if (images.length === 0) {
                console.log(`No images found for chapter ${chapter}`);
                continue;
            }

            const chapterPath = path.join(outputPath, String(chapter));
            fs.mkdirSync(chapterPath, { recursive: true });

            for (let i = 0; i < images.length; i++) {
                const imgPath = path.join(chapterPath, `${i}.jpg`);
                const success = await this.downloadImage(images[i], imgPath);
                
                if (success) {
                    downloadedImages++;
                    totalImages++;
                }

                if (onProgress && i % 5 === 0) {
                    await onProgress(`Chapter ${chapter}/${endChapter}: ${i + 1}/${images.length} images`);
                }
            }

            console.log(`Chapter ${chapter}: ${images.length} images downloaded`);
        }

        return { totalImages, downloadedImages };
    }
}

module.exports = WebtoonDownloader;
