/**
 * server.js — YouTube Audio Proxy Backend
 * 
 * Simple Node.js Express server to bypass YouTube CORS and extract audio streams.
 */

const express = require('express');
const cors = require('cors');
const youtubedl = require('youtube-dl-exec');
const UAParser = require('ua-parser-js');
require('dotenv').config();

const app = express();
// Pterodactyl uses process.env.SERVER_PORT mostly, but we keep PORT as fallback
const PORT = process.env.SERVER_PORT || process.env.PORT || 3001;

// Endpoint for Firebase Config
app.get('/api/firebase-config', (req, res) => {
    res.json({
        apiKey: process.env.FIREBASE_API_KEY,
        authDomain: process.env.FIREBASE_AUTH_DOMAIN,
        projectId: process.env.FIREBASE_PROJECT_ID,
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
        messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
        appId: process.env.FIREBASE_APP_ID,
        measurementId: process.env.FIREBASE_MEASUREMENT_ID
    });
});

// Enable CORS so the browser game can fetch from this server
app.use(cors());

// We do NOT set COOP/COEP here because strict values break Firebase's Google Auth popup on localhost.

// Logger Middleware
app.use((req, res, next) => {
    const now = new Date();
    // Usa toLocaleDateString en formato español para DD/MM/YYYY
    const dateStr = now.toLocaleDateString('es-ES', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });

    // Extraer User Agent
    const parser = new UAParser(req.headers['user-agent']);
    const os = parser.getOS();
    const device = parser.getDevice();
    const browser = parser.getBrowser();

    // Ensamblar string de dispositivo estilo: Android 14 Samsung
    let deviceStr = '';
    if (os.name) {
        deviceStr = `${os.name} ${os.version || ''}`.trim();
        if (device.vendor) deviceStr += ` ${device.vendor}`;
        if (device.model) deviceStr += ` ${device.model}`;
    } else if (browser.name) {
        deviceStr = `${browser.name}`;
    } else {
        deviceStr = req.headers['user-agent'] ? 'Unknown Device' : 'Server/Bot';
    }

    // Extraer IP limpia sin prefijos ipv6 mappings
    let ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip || 'Unknown IP';
    if (ip.startsWith('::ffff:')) ip = ip.substring(7);
    if (ip === '::1') ip = '127.0.0.1';

    console.log(`${dateStr} - ${deviceStr.trim()} - ${ip}: ${req.url}`);

    next();
});

// Serve static files from the current directory (the frontend)
app.use(express.static(__dirname));

// Health check endpoint (for the API)
app.get('/', (req, res) => {
    res.send('HexBeat YouTube Audio Proxy is running!');
});

// YouTube audio extraction endpoint
// Usage: http://localhost:3001/yt?url=https://www.youtube.com/watch?v=dQw4w9WgXcQ
app.get('/yt', async (req, res) => {
    const url = req.query.url;

    if (!url) {
        return res.status(400).json({ error: 'Falta una URL válida de YouTube (?url=...)' });
    }

    try {
        console.log(`Petición recibida para: ${url}`);

        // Get info first for the title
        let title = 'YouTube Audio';
        try {
            const info = await youtubedl(url, { dumpSingleJson: true, noWarnings: true });
            title = info.title || title;
            console.log(`Título detectado: ${title}`);
        } catch (e) {
            console.warn('No se pudo extraer el título:', e.message);
        }

        // Set headers
        res.header('Content-Disposition', `attachment; filename="youtube_audio.mp3"`);
        res.header('Content-Type', 'audio/mpeg');
        res.header('X-Video-Title', encodeURIComponent(title)); // Pass the title back to the client

        // Spawn youtube-dl-exec to stream the best audio to stdout
        const subprocess = youtubedl.exec(url, {
            f: 'bestaudio',
            o: '-' // output to stdout
        }, { stdio: ['ignore', 'pipe', 'ignore'] });

        // Pipe the yt-dlp stdout directly to the Express response
        subprocess.stdout.pipe(res);

        // Handle errors in the stream process
        subprocess.on('error', (err) => {
            console.error('Error in yt-dlp process:', err);
            if (!res.headersSent) res.status(500).json({ error: 'Error procesando stream de audio' });
        });

    } catch (error) {
        console.error('Error procesando YouTube URL:', error);
        res.status(500).json({ error: 'Error interno del servidor procesando el video' });
    }
});

// Configure Multer for community song uploads
const fs = require('fs');
const path = require('path');
const multer = require('multer');

// Create the songs directory if it doesn't exist just in case
const songsDir = path.join(__dirname, 'songs');
if (!fs.existsSync(songsDir)) {
    fs.mkdirSync(songsDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, songsDir);
    },
    filename: function (req, file, cb) {
        // Sanitize the filename slightly, keep the original extension
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        const name = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '');
        cb(null, `${name}-${uniqueSuffix}${ext}`);
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 30 * 1024 * 1024 }, // 30 MB limit
    fileFilter: function (req, file, cb) {
        const allowedExtensions = /mp3|ogg|wav|flac/;
        const extname = allowedExtensions.test(path.extname(file.originalname).toLowerCase());
        const isAudio = file.mimetype.startsWith('audio/') || file.mimetype.startsWith('video/');

        if (extname && isAudio) {
            return cb(null, true);
        } else {
            cb(new Error('Formato de archivo no soportado. Sólo MP3, OGG, WAV o FLAC.'));
        }
    }
});

// Community audio upload endpoint
app.post('/upload-community', upload.single('audioFile'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No se ha subido ningún archivo.' });
        }

        const title = req.body.title || 'Canción sin título';
        const artist = req.body.artist || 'Comunidad';
        const filename = req.file.filename;

        // Construct the new song entry
        const newSongInfo = {
            title: title,
            file: filename,
            artist: artist,
            community: true,
            uploadTime: new Date().toISOString()
        };

        // Read and update songs.json
        const songsJsonPath = path.join(songsDir, 'songs.json');
        let songsData = [];

        if (fs.existsSync(songsJsonPath)) {
            const rawData = fs.readFileSync(songsJsonPath, 'utf8');
            try {
                songsData = JSON.parse(rawData);
            } catch (e) {
                console.warn('songs.json estaba corrupto o vacío, creando uno nuevo.');
            }
        }

        songsData.push(newSongInfo);

        fs.writeFileSync(songsJsonPath, JSON.stringify(songsData, null, 4), 'utf8');

        res.json({
            success: true,
            message: 'Canción subida correctamente.',
            song: newSongInfo
        });

    } catch (error) {
        console.error('Error al subir la canción de la comunidad:', error);
        res.status(500).json({ error: 'Error interno del servidor guardando la canción.' });
    }
});

app.listen(PORT, () => {
    console.log(`===========================================`);
    console.log(`🎵 HexBeat YouTube Proxy (yt-dlp) corriendo en el puerto ${PORT}`);
    console.log(`===========================================`);
});
