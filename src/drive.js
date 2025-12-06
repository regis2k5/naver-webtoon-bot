const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

class GoogleDriveUploader {
    constructor() {
        this.credentialsPath = path.join(__dirname, '..', 'credentials.json');
        this.tokenPath = path.join(__dirname, '..', 'token.json');
        this.SCOPES = ['https://www.googleapis.com/auth/drive.file'];
    }

    async authorize() {
        let credentials;
        if (process.env.GOOGLE_CREDENTIALS) {
            credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
        } else {
            credentials = JSON.parse(fs.readFileSync(this.credentialsPath));
        }
        const { client_id, client_secret, redirect_uris } = credentials.installed;
        
        const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

        let token;
        if (process.env.GOOGLE_TOKEN) {
            token = JSON.parse(process.env.GOOGLE_TOKEN);
        } else if (fs.existsSync(this.tokenPath)) {
            token = JSON.parse(fs.readFileSync(this.tokenPath));
        } else {
            throw new Error('No token found. Set GOOGLE_TOKEN env var.');
        }

        if (token) {
            oAuth2Client.setCredentials(token);
            
            if (token.expiry_date && token.expiry_date < Date.now()) {
                try {
                    const { credentials: newToken } = await oAuth2Client.refreshAccessToken();
                    oAuth2Client.setCredentials(newToken);
                } catch (error) {
                    throw new Error('Token expired. Refresh your GOOGLE_TOKEN.');
                }
            }
            
            return oAuth2Client;
        }
    }

    async createFolder(drive, folderName, parentId = null) {
        const fileMetadata = {
            name: folderName,
            mimeType: 'application/vnd.google-apps.folder'
        };

        if (parentId) {
            fileMetadata.parents = [parentId];
        } else if (process.env.GOOGLE_DRIVE_FOLDER_ID) {
            fileMetadata.parents = [process.env.GOOGLE_DRIVE_FOLDER_ID];
        }

        const response = await drive.files.create({
            resource: fileMetadata,
            fields: 'id, webViewLink'
        });

        return response.data;
    }

    async uploadFile(drive, filePath, folderId) {
        const fileName = path.basename(filePath);
        
        const fileMetadata = {
            name: fileName,
            parents: [folderId]
        };

        const media = {
            mimeType: 'image/jpeg',
            body: fs.createReadStream(filePath)
        };

        const response = await drive.files.create({
            resource: fileMetadata,
            media: media,
            fields: 'id'
        });

        return response.data.id;
    }

    async uploadFolder(localPath, folderName, onProgress) {
        const auth = await this.authorize();
        const drive = google.drive({ version: 'v3', auth });

        if (onProgress) await onProgress('Creating folder on Drive...');
        const mainFolder = await this.createFolder(drive, folderName);

        const chapters = fs.readdirSync(localPath)
            .filter(f => fs.statSync(path.join(localPath, f)).isDirectory())
            .sort((a, b) => parseInt(a) - parseInt(b));

        let totalUploaded = 0;

        for (const chapter of chapters) {
            const chapterPath = path.join(localPath, chapter);
            const chapterFolder = await this.createFolder(drive, `Chapter ${chapter}`, mainFolder.id);

            const images = fs.readdirSync(chapterPath)
                .filter(f => f.endsWith('.jpg') || f.endsWith('.png'))
                .sort((a, b) => parseInt(a) - parseInt(b));

            for (let i = 0; i < images.length; i++) {
                const imgPath = path.join(chapterPath, images[i]);
                await this.uploadFile(drive, imgPath, chapterFolder.id);
                totalUploaded++;

                if (onProgress && i % 5 === 0) {
                    await onProgress(`Uploading: Chapter ${chapter} - ${i + 1}/${images.length}`);
                }
            }
        }

        await drive.permissions.create({
            fileId: mainFolder.id,
            resource: { role: 'reader', type: 'anyone' }
        });

        const file = await drive.files.get({
            fileId: mainFolder.id,
            fields: 'webViewLink'
        });

        return file.data.webViewLink;
    }
}

module.exports = GoogleDriveUploader;
