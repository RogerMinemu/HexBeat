/**
 * particles.js — 3D particle system for visual effects
 */
import * as THREE from 'three';

const TWO_PI = Math.PI * 2;

class Particle {
    constructor() {
        this.x = 0;
        this.y = 0;
        this.z = 0;
        this.vx = 0;
        this.vy = 0;
        this.vz = 0;
        this.life = 0;
        this.maxLife = 0;
        this.size = 1;
        this.drag = 1.5;
        this.color = new THREE.Color(1, 1, 1);
        this.active = false;
    }
}

export class ParticleSystem {
    constructor(scene, maxParticles = 500) {
        this.scene = scene;
        this.maxParticles = maxParticles;
        this.particles = [];

        for (let i = 0; i < maxParticles; i++) {
            this.particles.push(new Particle());
        }

        // Create geometry
        const positions = new Float32Array(maxParticles * 3);
        const colors = new Float32Array(maxParticles * 3);
        const sizes = new Float32Array(maxParticles);

        this.geometry = new THREE.BufferGeometry();
        this.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        this.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        this.geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

        // Material
        this.material = new THREE.PointsMaterial({
            size: 0.15,
            vertexColors: true,
            transparent: true,
            opacity: 0.8,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            sizeAttenuation: true
        });

        this.points = new THREE.Points(this.geometry, this.material);
        this.scene.add(this.points);
    }

    _getInactiveParticle() {
        for (const p of this.particles) {
            if (!p.active) return p;
        }
        return null;
    }

    /**
     * Emit a burst of particles
     */
    emit(x, y, count, options = {}) {
        const {
            color = new THREE.Color(0x00f0ff),
            speed = 3,
            life = 0.8,
            size = 0.15,
            spread = TWO_PI,
            baseAngle = 0
        } = options;

        for (let i = 0; i < count; i++) {
            const p = this._getInactiveParticle();
            if (!p) break;

            const angle = baseAngle + (Math.random() - 0.5) * spread;
            const spd = speed * (0.3 + Math.random() * 0.7);

            p.x = x;
            p.y = y;
            p.z = 0;
            p.vx = Math.cos(angle) * spd;
            p.vy = Math.sin(angle) * spd;
            p.vz = (Math.random() - 0.5) * 2;
            p.life = life * (0.5 + Math.random() * 0.5);
            p.maxLife = p.life;
            p.size = size;
            p.color.copy(color);
            p.active = true;
        }
    }

    /**
     * Beat pulse — ring of particles expanding from center
     */
    emitBeatPulse(intensity, color) {
        const count = Math.floor(12 + intensity * 20);
        for (let i = 0; i < count; i++) {
            const p = this._getInactiveParticle();
            if (!p) break;

            const angle = (i / count) * TWO_PI;
            const spd = 4 + intensity * 8;

            p.x = Math.cos(angle) * 2;
            p.y = Math.sin(angle) * 2;
            p.z = 0;
            p.vx = Math.cos(angle) * spd;
            p.vy = Math.sin(angle) * spd;
            p.vz = 0;
            p.life = 0.5 + intensity * 0.3;
            p.maxLife = p.life;
            p.size = 0.1 + intensity * 0.15;
            p.color.set(color);
            p.active = true;
        }
    }

    /**
     * Game over explosion
     */
    emitExplosion(x, y) {
        const count = 300; // Increased particle count massively
        for (let i = 0; i < count; i++) {
            const p = this._getInactiveParticle();
            if (!p) break;

            const angle = Math.random() * TWO_PI;
            const spd = 5 + Math.random() * 25; // Much faster burst

            p.x = x;
            p.y = y;
            p.z = 0;
            p.vx = Math.cos(angle) * spd;
            p.vy = Math.sin(angle) * spd;
            p.vz = (Math.random() - 0.5) * 8;
            p.life = 0.6 + Math.random() * 1.5;
            p.maxLife = p.life;
            p.size = 0.2 + Math.random() * 0.5; // Bigger particles

            // Random warm colors for explosion
            p.color.setHSL(Math.random() * 0.15, 1, 0.5 + Math.random() * 0.5);
            p.active = true;
        }
    }

    /**
     * Melody constellation burst — ethereal particles from center outward.
     * Slower, longer-lived, and smaller than beat pulses or explosions,
     * creating a starfield / constellation trail effect.
     */
    emitMelodyBurst(intensity, color) {
        const count = Math.floor(4 + intensity * 10);
        const baseHSL = {};
        new THREE.Color(color).getHSL(baseHSL);

        for (let i = 0; i < count; i++) {
            const p = this._getInactiveParticle();
            if (!p) break;

            const angle = Math.random() * TWO_PI;
            const spd = 0.3 + Math.random() * 1.2;

            // Spawn randomly across the visible area
            p.x = (Math.random() - 0.5) * 20;
            p.y = (Math.random() - 0.5) * 20;
            p.z = (Math.random() - 0.5) * 1;

            // Very slow drift
            p.vx = Math.cos(angle) * spd;
            p.vy = Math.sin(angle) * spd;
            p.vz = (Math.random() - 0.5) * 0.3;

            // Long life for trailing constellation effect
            p.life = 1.5 + Math.random() * 2.0;
            p.maxLife = p.life;

            // Visible star size
            p.size = 0.15 + Math.random() * 0.25 + intensity * 0.2;

            // Very low drag so particles float outward like stars
            p.drag = 0.4;

            // Color: blend from palette hue → white based on intensity
            // Low intensity = colored, high intensity (peaks) = near-white
            const hueShift = (Math.random() - 0.5) * 0.12;
            const saturation = (1 - intensity) * (0.7 + Math.random() * 0.3); // desaturate toward white
            const lightness = 0.55 + intensity * 0.35 + Math.random() * 0.1;  // brighter at peaks
            p.color.setHSL(
                (baseHSL.h + hueShift + 1) % 1,
                saturation,
                Math.min(lightness, 1)
            );
            p.active = true;
        }
    }

    update(dt) {
        const positions = this.geometry.attributes.position.array;
        const colors = this.geometry.attributes.color.array;
        const sizes = this.geometry.attributes.size.array;

        for (let i = 0; i < this.maxParticles; i++) {
            const p = this.particles[i];

            if (p.active) {
                p.life -= dt;
                if (p.life <= 0) {
                    p.active = false;
                    positions[i * 3] = 0;
                    positions[i * 3 + 1] = 0;
                    positions[i * 3 + 2] = -100; // Hide off-screen
                    sizes[i] = 0;
                    continue;
                }

                // Update position
                p.x += p.vx * dt;
                p.y += p.vy * dt;
                p.z += p.vz * dt;

                // Drag (per-particle)
                const dragFactor = 1 - p.drag * dt;
                p.vx *= dragFactor;
                p.vy *= dragFactor;
                p.vz *= dragFactor;

                const lifeRatio = p.life / p.maxLife;

                positions[i * 3] = p.x;
                positions[i * 3 + 1] = p.y;
                positions[i * 3 + 2] = p.z;

                colors[i * 3] = p.color.r * lifeRatio;
                colors[i * 3 + 1] = p.color.g * lifeRatio;
                colors[i * 3 + 2] = p.color.b * lifeRatio;

                sizes[i] = p.size * lifeRatio;
            } else {
                sizes[i] = 0;
            }
        }

        this.geometry.attributes.position.needsUpdate = true;
        this.geometry.attributes.color.needsUpdate = true;
        this.geometry.attributes.size.needsUpdate = true;
    }

    clear() {
        for (const p of this.particles) {
            p.active = false;
        }
    }

    dispose() {
        this.scene.remove(this.points);
        this.geometry.dispose();
        this.material.dispose();
    }
}
