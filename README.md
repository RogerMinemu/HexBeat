# 🎮 HexBeat

Un juego estilo **Open Hexagon** donde subes tu propia música y el juego genera un nivel procedural sincronizado con el ritmo.

Pruébalo en http://x.minemu.net:12016/

Built with **Three.js** + **Web Audio API**.

![Three.js](https://img.shields.io/badge/Three.js-0.170-black?logo=threedotjs) ![Vanilla JS](https://img.shields.io/badge/Vanilla-JS-yellow?logo=javascript)

## 🎵 ¿Cómo funciona?

1. **Sube tu Archivo Local** — arrastra o usa el menú (`.mp3`, `.ogg`, `.wav`, `.flac`).
2. **Pega un enlace de YouTube** — si arrancas el servidor proxy local incluido, el juego descargará en cache y reproducirá el audio directamente de YouTube.
3. **El juego analiza tu canción** — detecta BPM, energía y beats al vuelo en el frontend.
4. **Sobrevive** — gira alrededor del hexágono esquivando los muros que llegan al ritmo de tu música. 

## 🕹️ Controles

| Entrada | Acción |
|-------|--------|
| `←` `→` / `A` `D` | Girar izquierda / derecha |
| `W` | Continuar tras morir |
| Touch (móvil) | Toca mitad izq/der de pantalla |
| UI | Botón nativo de *Fullscreen* en el menú |

## 🚀 Ejecutar

El juego tiene ahora un frontend (`index.html` servido de forma estática) y un pequeño backend opcional en `Express` que actúa de proxy para usar `youtube-dl-exec` solucionando problemas de red y CORS de audios directos.

```bash
# 1. Instalar dependencias del servidor NodeJS
npm install

# 2. Arracar el servidor backend proxy (Puerto 3001)
node server.js

# 3. Servir el frontend localmente (Puerto 3000)
npx -y serve . -l 3000
```

Abre `http://localhost:3000` en tu navegador para jugar.

## 🏗️ Arquitectura

```
├── server.js           # Backend Proxy CORS para resolver e inyectar audio de YouTube
├── index.html          # Página principal + UI overlays
├── styles.css          # Tema dark neon + responsive landscape UX
└── js/
    ├── main.js         # Entry point
    ├── game.js         # Game loop + state machine
    ├── renderer3d.js   # Three.js scene, cámara, post-processing intensivo
    ├── audio.js        # Web Audio API, FFT, detección BPM
    ├── levelGenerator.js  # Generación procedural de niveles
    ├── player.js       # Jugador (triángulo orbital con edge-forgiving collisions)
    ├── walls.js        # Sistema de muros hexagonales
    ├── particles.js    # Sistema de partículas 3D reactivas
    └── ui.js           # Controlador de UI (menú y HUD)
```

## ✨ Features

- **Audio-reactivo** — muros, bloom, chromatic aberration y partículas intensas sincronizados con la música.
- **Soporte Local y Web** — Soporta archivos `.mp3`, `.ogg`, `.wav`, `.flac` locales, así como streaming inyectado de YouTube URL.
- **Detección de BPM Frontend** — análisis de onset instantáneo para estimar el tempo de cualquier canción enviada.
- **Post-processing** — Bloom extremo, aberración cromática, vignette (Three.js EffectComposer).
- **Hardcore pero Justo** — Colisiones tolerantes en los laterales de los muros (*forgiving edges*), solo los choques frontales son fatales.
- **Responsive Web Design** — Optimizaciones intensivas CSS para ser perfectamente jugable en la vista horizontal de pantallas móviles.
