/**
 * renderer3d.js — Three.js scene, camera, post-processing
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

// Chromatic Aberration shader
const ChromaticAberrationShader = {
    uniforms: {
        tDiffuse: { value: null },
        uIntensity: { value: 0.002 },
        uTime: { value: 0 }
    },
    vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float uIntensity;
        uniform float uTime;
        varying vec2 vUv;
        void main() {
            vec2 offset = uIntensity * (vUv - 0.5);
            float r = texture2D(tDiffuse, vUv + offset).r;
            float g = texture2D(tDiffuse, vUv).g;
            float b = texture2D(tDiffuse, vUv - offset).b;
            gl_FragColor = vec4(r, g, b, 1.0);
        }
    `
};

// Vignette shader
const VignetteShader = {
    uniforms: {
        tDiffuse: { value: null },
        uDarkness: { value: 1.2 },
        uOffset: { value: 1.0 }
    },
    vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float uDarkness;
        uniform float uOffset;
        varying vec2 vUv;
        void main() {
            vec4 color = texture2D(tDiffuse, vUv);
            vec2 uv = (vUv - 0.5) * 2.0;
            float vignette = 1.0 - dot(uv, uv) * uDarkness * 0.25;
            vignette = clamp(vignette, 0.0, 1.0);
            color.rgb *= vignette;
            gl_FragColor = color;
        }
    `
};

export class Renderer3D {
    constructor(canvas) {
        this.canvas = canvas;
        this.width = window.innerWidth;
        this.height = window.innerHeight;

        // Three.js core
        this.renderer = new THREE.WebGLRenderer({
            canvas,
            antialias: true,
            alpha: false
        });
        this.renderer.setSize(this.width, this.height);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.setClearColor(0x050510);

        // Scene
        this.scene = new THREE.Scene();

        // Camera — top-down with slight perspective
        this.camera = new THREE.PerspectiveCamera(60, this.width / this.height, 0.1, 1000);
        this.camera.position.set(0, 0, 18);
        this.camera.lookAt(0, 0, 0);

        // Post-processing
        this.composer = new EffectComposer(this.renderer);

        const renderPass = new RenderPass(this.scene, this.camera);
        this.composer.addPass(renderPass);

        // Bloom
        this.bloomPass = new UnrealBloomPass(
            new THREE.Vector2(this.width, this.height),
            1.0,   // strength — cranked up
            0.5,   // radius
            0.6    // threshold — lowered so waveform lines glow
        );
        this.composer.addPass(this.bloomPass);

        // Chromatic aberration
        this.chromaPass = new ShaderPass(ChromaticAberrationShader);
        this.composer.addPass(this.chromaPass);

        // Vignette
        this.vignettePass = new ShaderPass(VignetteShader);
        this.composer.addPass(this.vignettePass);

        // Central hexagon
        this.hexagon = null;
        this.hexagonOutline = null;

        // Background elements
        this.bgRotationGroup = new THREE.Group();
        this.scene.add(this.bgRotationGroup);

        this._createHexagon();
        this._createBackground();
        this._createWaveform();

        // Color system
        this.hue = 0;
        this.targetHue = 0;
        this.colorPalettes = [
            { primary: 0x00f0ff, secondary: 0xff00aa },  // cyan/magenta
            { primary: 0xff6600, secondary: 0x0066ff },  // orange/blue
            { primary: 0x00ff88, secondary: 0xff0044 },  // green/red
            { primary: 0xffee00, secondary: 0x8800ff },  // yellow/purple
            { primary: 0xff0088, secondary: 0x00ffcc },  // pink/teal
        ];
        this.currentPalette = 0;
        this.paletteChangeTimer = 0;

        // RGB wall cycling
        this.wallHue = 0; // 0-1 continuous cycle

        // Resize handler
        window.addEventListener('resize', () => this._onResize());
    }

    _createHexagon() {
        const radius = 1.8;
        const sides = 6;
        const shape = new THREE.Shape();

        for (let i = 0; i <= sides; i++) {
            const angle = (i / sides) * Math.PI * 2 - Math.PI / 6;
            const x = Math.cos(angle) * radius;
            const y = Math.sin(angle) * radius;
            if (i === 0) shape.moveTo(x, y);
            else shape.lineTo(x, y);
        }

        // Filled hexagon
        const hexGeo = new THREE.ShapeGeometry(shape);
        const hexMat = new THREE.MeshBasicMaterial({
            color: 0x0a0a18,
            transparent: true,
            opacity: 0.9,
            side: THREE.DoubleSide
        });
        this.hexagon = new THREE.Mesh(hexGeo, hexMat);
        this.hexagon.position.z = 0.01;
        this.scene.add(this.hexagon);

        // Outline
        const points = [];
        for (let i = 0; i <= sides; i++) {
            const angle = (i / sides) * Math.PI * 2 - Math.PI / 6;
            points.push(new THREE.Vector3(
                Math.cos(angle) * radius,
                Math.sin(angle) * radius,
                0.02
            ));
        }
        const outlineGeo = new THREE.BufferGeometry().setFromPoints(points);
        const outlineMat = new THREE.LineBasicMaterial({
            color: 0x00f0ff,
            linewidth: 2,
            transparent: true,
            opacity: 0.8
        });
        this.hexagonOutline = new THREE.LineLoop(outlineGeo, outlineMat);
        this.scene.add(this.hexagonOutline);
    }

    _createBackground() {
        // Create background hex grid
        const sides = 6;

        for (let ring = 1; ring <= 6; ring++) {
            const radius = 3 + ring * 3.5;
            const points = [];
            for (let i = 0; i <= sides; i++) {
                const angle = (i / sides) * Math.PI * 2 - Math.PI / 6;
                points.push(new THREE.Vector3(
                    Math.cos(angle) * radius,
                    Math.sin(angle) * radius,
                    -0.5
                ));
            }
            const geo = new THREE.BufferGeometry().setFromPoints(points);
            const mat = new THREE.LineBasicMaterial({
                color: 0x00f0ff,
                transparent: true,
                opacity: 0.03 + (0.06 / ring)
            });
            const line = new THREE.LineLoop(geo, mat);
            this.bgRotationGroup.add(line);
        }

        // Radial lines from center
        for (let i = 0; i < 6; i++) {
            const angle = (i / 6) * Math.PI * 2 - Math.PI / 6;
            const points = [
                new THREE.Vector3(0, 0, -0.5),
                new THREE.Vector3(
                    Math.cos(angle) * 30,
                    Math.sin(angle) * 30,
                    -0.5
                )
            ];
            const geo = new THREE.BufferGeometry().setFromPoints(points);
            const mat = new THREE.LineBasicMaterial({
                color: 0x00f0ff,
                transparent: true,
                opacity: 0.04
            });
            const line = new THREE.Line(geo, mat);
            this.bgRotationGroup.add(line);
        }
    }

    _createWaveform() {
        const SEGMENTS = 128;

        // --- Outer ring: frequency spectrum (bars going outward) ---
        this.wfFreqSegments = SEGMENTS;
        const freqPositions = new Float32Array(SEGMENTS * 3);
        const freqColors = new Float32Array(SEGMENTS * 3);
        for (let i = 0; i < SEGMENTS; i++) {
            const angle = (i / SEGMENTS) * Math.PI * 2;
            const r = 7;
            freqPositions[i * 3] = Math.cos(angle) * r;
            freqPositions[i * 3 + 1] = Math.sin(angle) * r;
            freqPositions[i * 3 + 2] = -0.3;
            freqColors[i * 3] = 0;
            freqColors[i * 3 + 1] = 0.94;
            freqColors[i * 3 + 2] = 1;
        }

        this.wfFreqGeo = new THREE.BufferGeometry();
        this.wfFreqGeo.setAttribute('position', new THREE.BufferAttribute(freqPositions, 3));
        this.wfFreqGeo.setAttribute('color', new THREE.BufferAttribute(freqColors, 3));

        this.wfFreqMat = new THREE.LineBasicMaterial({
            vertexColors: true,
            transparent: true,
            opacity: 0.85,
            linewidth: 2
        });

        this.wfFreqLine = new THREE.LineLoop(this.wfFreqGeo, this.wfFreqMat);
        this.scene.add(this.wfFreqLine);

        // --- Inner ring: time-domain waveform ---
        this.wfTimeSegments = SEGMENTS;
        const timePositions = new Float32Array(SEGMENTS * 3);
        const timeColors = new Float32Array(SEGMENTS * 3);
        for (let i = 0; i < SEGMENTS; i++) {
            const angle = (i / SEGMENTS) * Math.PI * 2;
            const r = 5;
            timePositions[i * 3] = Math.cos(angle) * r;
            timePositions[i * 3 + 1] = Math.sin(angle) * r;
            timePositions[i * 3 + 2] = -0.3;
            timeColors[i * 3] = 1;
            timeColors[i * 3 + 1] = 0;
            timeColors[i * 3 + 2] = 0.67;
        }

        this.wfTimeGeo = new THREE.BufferGeometry();
        this.wfTimeGeo.setAttribute('position', new THREE.BufferAttribute(timePositions, 3));
        this.wfTimeGeo.setAttribute('color', new THREE.BufferAttribute(timeColors, 3));

        this.wfTimeMat = new THREE.LineBasicMaterial({
            vertexColors: true,
            transparent: true,
            opacity: 0.7,
            linewidth: 2
        });

        this.wfTimeLine = new THREE.LineLoop(this.wfTimeGeo, this.wfTimeMat);
        this.scene.add(this.wfTimeLine);

        // --- Third ring: mirrored frequency (subtle, outermost) ---
        const mirrorPositions = new Float32Array(SEGMENTS * 3);
        this.wfMirrorGeo = new THREE.BufferGeometry();
        this.wfMirrorGeo.setAttribute('position', new THREE.BufferAttribute(mirrorPositions, 3));

        this.wfMirrorMat = new THREE.LineBasicMaterial({
            color: 0x00f0ff,
            transparent: true,
            opacity: 0.35,
            linewidth: 1
        });

        this.wfMirrorLine = new THREE.LineLoop(this.wfMirrorGeo, this.wfMirrorMat);
        this.scene.add(this.wfMirrorLine);
    }

    _onResize() {
        this.width = window.innerWidth;
        this.height = window.innerHeight;
        this.camera.aspect = this.width / this.height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(this.width, this.height);
        this.composer.setSize(this.width, this.height);
    }

    update(dt, gameTime, audioData, freqData, timeData) {
        const { bass, mid, treble, energy } = audioData;

        // Color cycling based on time
        this.paletteChangeTimer += dt;
        if (this.paletteChangeTimer > 15) {
            this.paletteChangeTimer = 0;
            this.currentPalette = (this.currentPalette + 1) % this.colorPalettes.length;
        }

        const palette = this.colorPalettes[this.currentPalette];
        const primaryColor = new THREE.Color(palette.primary);
        const secondaryColor = new THREE.Color(palette.secondary);

        // RGB wall hue cycling — continuous rainbow
        this.wallHue = (this.wallHue + dt * 0.08) % 1;

        // Update hexagon outline color and pulse
        const pulseScale = 1.0 + bass * 0.35;
        this.hexagonOutline.scale.set(pulseScale, pulseScale, 1);
        this.hexagon.scale.set(pulseScale, pulseScale, 1);

        this.hexagonOutline.material.color = primaryColor;
        this.hexagonOutline.material.opacity = 0.5 + bass * 0.5;

        // Hexagon fill pulses with bass
        this.hexagon.material.opacity = 0.7 + bass * 0.3;
        const hexBrightness = 0.02 + bass * 0.06;
        this.hexagon.material.color.setHSL(this.wallHue, 0.3, hexBrightness);

        // Background rotation
        this.bgRotationGroup.rotation.z += dt * 0.1 * (1 + bass * 0.5);

        // Update background colors
        this.bgRotationGroup.children.forEach(child => {
            child.material.color = primaryColor;
        });

        // === WAVEFORM VISUALIZER UPDATE ===
        this._updateWaveform(gameTime, audioData, freqData, timeData, primaryColor, secondaryColor);

        // Bloom intensity reacts to bass — high base for neon glow
        this.bloomPass.strength = 1.0 + bass * 2.0;

        // Chromatic aberration reacts to bass
        this.chromaPass.uniforms.uIntensity.value = 0.001 + bass * 0.008;
        this.chromaPass.uniforms.uTime.value = gameTime;

        // Background color shifts
        const bgHue = (gameTime * 0.02) % 1;
        const bgColor = new THREE.Color().setHSL(bgHue, 0.3, 0.02 + energy * 0.03);
        this.renderer.setClearColor(bgColor);
    }

    _updateWaveform(gameTime, audioData, freqData, timeData, primaryColor, secondaryColor) {
        const SEGMENTS = this.wfFreqSegments;
        const { bass, energy } = audioData;

        // Slow rotation for the waveform rings
        const wfRotation = gameTime * 0.15;

        // --- Frequency ring (outer) ---
        if (freqData && freqData.length > 0) {
            const freqPos = this.wfFreqGeo.attributes.position.array;
            const freqCol = this.wfFreqGeo.attributes.color.array;
            const binStep = Math.floor(freqData.length / SEGMENTS);

            for (let i = 0; i < SEGMENTS; i++) {
                const angle = (i / SEGMENTS) * Math.PI * 2 + wfRotation;
                const bin = Math.min(i * binStep, freqData.length - 1);
                const amplitude = (freqData[bin] / 255) * 6.0; // BIG deformation
                const r = 7 + amplitude;

                freqPos[i * 3] = Math.cos(angle) * r;
                freqPos[i * 3 + 1] = Math.sin(angle) * r;
                freqPos[i * 3 + 2] = -0.3;

                // Color gradient: primary → secondary, boosted brightness
                const t = i / SEGMENTS;
                const boost = 1.3 + amplitude * 0.15; // glow brighter on peaks
                freqCol[i * 3] = Math.min(1, (primaryColor.r * (1 - t) + secondaryColor.r * t) * boost);
                freqCol[i * 3 + 1] = Math.min(1, (primaryColor.g * (1 - t) + secondaryColor.g * t) * boost);
                freqCol[i * 3 + 2] = Math.min(1, (primaryColor.b * (1 - t) + secondaryColor.b * t) * boost);
            }

            this.wfFreqGeo.attributes.position.needsUpdate = true;
            this.wfFreqGeo.attributes.color.needsUpdate = true;
        }
        this.wfFreqMat.opacity = 0.5 + energy * 0.5;

        // --- Time-domain ring (inner waveform) ---
        if (timeData && timeData.length > 0) {
            const timePos = this.wfTimeGeo.attributes.position.array;
            const timeCol = this.wfTimeGeo.attributes.color.array;
            const timeStep = Math.floor(timeData.length / SEGMENTS);

            for (let i = 0; i < SEGMENTS; i++) {
                const angle = (i / SEGMENTS) * Math.PI * 2 - wfRotation * 0.7;
                const bin = Math.min(i * timeStep, timeData.length - 1);
                // timeData is 0-255 centered at 128
                const deviation = (timeData[bin] - 128) / 128;
                const r = 5 + deviation * 3.0; // bigger wave deformation

                timePos[i * 3] = Math.cos(angle) * r;
                timePos[i * 3 + 1] = Math.sin(angle) * r;
                timePos[i * 3 + 2] = -0.3;

                // Secondary color, boosted brightness on peaks
                const brightness = 0.8 + Math.abs(deviation) * 1.2;
                timeCol[i * 3] = Math.min(1, secondaryColor.r * brightness);
                timeCol[i * 3 + 1] = Math.min(1, secondaryColor.g * brightness);
                timeCol[i * 3 + 2] = Math.min(1, secondaryColor.b * brightness);
            }

            this.wfTimeGeo.attributes.position.needsUpdate = true;
            this.wfTimeGeo.attributes.color.needsUpdate = true;
        }
        this.wfTimeMat.opacity = 0.4 + bass * 0.6;

        // --- Mirror ring (outermost, subtle) ---
        if (freqData && freqData.length > 0) {
            const mirrorPos = this.wfMirrorGeo.attributes.position.array;
            const binStep = Math.floor(freqData.length / SEGMENTS);

            for (let i = 0; i < SEGMENTS; i++) {
                const angle = (i / SEGMENTS) * Math.PI * 2 - wfRotation * 0.5;
                const bin = Math.min(i * binStep, freqData.length - 1);
                const amplitude = (freqData[bin] / 255) * 5.0;
                const r = 10 + amplitude;

                mirrorPos[i * 3] = Math.cos(angle) * r;
                mirrorPos[i * 3 + 1] = Math.sin(angle) * r;
                mirrorPos[i * 3 + 2] = -0.5;
            }

            this.wfMirrorGeo.attributes.position.needsUpdate = true;
        }
        this.wfMirrorMat.color = primaryColor;
        this.wfMirrorMat.opacity = 0.15 + energy * 0.3;
    }

    getPrimaryColor() {
        return this.colorPalettes[this.currentPalette].primary;
    }

    getSecondaryColor() {
        return this.colorPalettes[this.currentPalette].secondary;
    }

    /**
     * Get the current RGB cycling color for walls
     */
    getWallColor() {
        return new THREE.Color().setHSL(this.wallHue, 1.0, 0.5);
    }

    render() {
        this.composer.render();
    }

    dispose() {
        this.renderer.dispose();
    }
}
