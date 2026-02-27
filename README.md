# 🎮 HexBeat

Un juego estilo **Open Hexagon** donde subes tu propia música y el juego genera un nivel procedural sincronizado con el ritmo.

Built with **Three.js** + **Web Audio API**.

![Three.js](https://img.shields.io/badge/Three.js-0.170-black?logo=threedotjs) ![Vanilla JS](https://img.shields.io/badge/Vanilla-JS-yellow?logo=javascript)

## 🎵 ¿Cómo funciona?

1. **Sube tu MP3/OGG** — arrastra o haz clic para seleccionar
2. **El juego analiza tu canción** — detecta BPM, energía y beats
3. **Sobrevive** — gira alrededor del hexágono esquivando los muros que llegan al ritmo de tu música

## 🕹️ Controles

| Tecla | Acción |
|-------|--------|
| `←` `→` / `A` `D` | Girar izquierda / derecha |
| `W` | Continuar tras morir |
| Touch (móvil) | Toca mitad izq/der de pantalla |

## 🚀 Ejecutar

```bash
# Sirve los archivos localmente (cualquier servidor HTTP estático)
npx -y serve . -l 3000
```

Abre `http://localhost:3000` en tu navegador.

## 🏗️ Arquitectura

```
├── index.html          # Página principal + UI overlays
├── styles.css          # Tema dark neon + glassmorphism
└── js/
    ├── main.js         # Entry point
    ├── game.js         # Game loop + state machine
    ├── renderer3d.js   # Three.js scene, cámara, post-processing
    ├── audio.js        # Web Audio API, FFT, detección BPM
    ├── levelGenerator.js  # Generación procedural de niveles
    ├── player.js       # Jugador (triángulo orbital)
    ├── walls.js        # Sistema de muros hexagonales
    ├── particles.js    # Sistema de partículas 3D
    └── ui.js           # Controlador de UI (menú, HUD, game over)
```

## ✨ Features

- **Audio-reactivo** — muros, bloom, chromatic aberration y partículas sincronizados con la música
- **Detección de BPM** — análisis de onset para detectar el tempo de cualquier canción
- **Post-processing** — Bloom, aberración cromática, vignette (Three.js EffectComposer)
- **Rotación del mundo** — efecto signature de Open Hexagon en 3D
- **Color cycling** — paleta de colores que cambia durante la partida
- **Framerate independiente** — delta time adaptado al refresh rate del monitor (Aprended AAA del mundo)
- **Touch support** — jugable en dispositivos móviles
