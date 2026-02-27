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
            0.8,   // strength
            0.4,   // radius
            0.85   // threshold
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

    _onResize() {
        this.width = window.innerWidth;
        this.height = window.innerHeight;
        this.camera.aspect = this.width / this.height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(this.width, this.height);
        this.composer.setSize(this.width, this.height);
    }

    update(dt, gameTime, audioData) {
        const { bass, mid, treble, energy } = audioData;

        // Color cycling based on time
        this.paletteChangeTimer += dt;
        if (this.paletteChangeTimer > 15) {
            this.paletteChangeTimer = 0;
            this.currentPalette = (this.currentPalette + 1) % this.colorPalettes.length;
        }

        const palette = this.colorPalettes[this.currentPalette];

        // Update hexagon outline color and pulse
        const pulseScale = 1.0 + bass * 0.15;
        this.hexagonOutline.scale.set(pulseScale, pulseScale, 1);

        const outlineColor = new THREE.Color(palette.primary);
        this.hexagonOutline.material.color = outlineColor;
        this.hexagonOutline.material.opacity = 0.5 + bass * 0.5;

        // Background rotation
        this.bgRotationGroup.rotation.z += dt * 0.1 * (1 + bass * 0.5);

        // Update background colors
        this.bgRotationGroup.children.forEach(child => {
            child.material.color = outlineColor;
        });

        // Bloom intensity reacts to bass
        this.bloomPass.strength = 0.6 + bass * 1.5;

        // Chromatic aberration reacts to bass
        this.chromaPass.uniforms.uIntensity.value = 0.001 + bass * 0.008;
        this.chromaPass.uniforms.uTime.value = gameTime;

        // Background color shifts
        const bgHue = (gameTime * 0.02) % 1;
        const bgColor = new THREE.Color().setHSL(bgHue, 0.3, 0.02 + energy * 0.03);
        this.renderer.setClearColor(bgColor);
    }

    getPrimaryColor() {
        return this.colorPalettes[this.currentPalette].primary;
    }

    getSecondaryColor() {
        return this.colorPalettes[this.currentPalette].secondary;
    }

    render() {
        this.composer.render();
    }

    dispose() {
        this.renderer.dispose();
    }
}
