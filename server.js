/**
 * server.js — YouTube Audio Proxy Backend
 * 
 * Simple Node.js Express server to bypass YouTube CORS and extract audio streams.
 */

const express = require('express');
const cors = require('cors');
const youtubedl = require('youtube-dl-exec');

const app = express();
// Pterodactyl uses process.env.SERVER_PORT mostly, but we keep PORT as fallback
const PORT = process.env.SERVER_PORT || process.env.PORT || 3001;

// Enable CORS so the browser game can fetch from this server
app.use(cors());

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

app.listen(PORT, () => {
    console.log(`===========================================`);
    console.log(`🎵 HexBeat YouTube Proxy (yt-dlp) corriendo en el puerto ${PORT}`);
    console.log(`===========================================`);
});
