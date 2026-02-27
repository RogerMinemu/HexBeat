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
        const count = 80;
        for (let i = 0; i < count; i++) {
            const p = this._getInactiveParticle();
            if (!p) break;

            const angle = Math.random() * TWO_PI;
            const spd = 2 + Math.random() * 12;

            p.x = x;
            p.y = y;
            p.z = 0;
            p.vx = Math.cos(angle) * spd;
            p.vy = Math.sin(angle) * spd;
            p.vz = (Math.random() - 0.5) * 5;
            p.life = 0.5 + Math.random() * 1.0;
            p.maxLife = p.life;
            p.size = 0.1 + Math.random() * 0.3;

            // Random warm colors for explosion
            p.color.setHSL(Math.random() * 0.15, 1, 0.5 + Math.random() * 0.5);
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

                // Drag
                p.vx *= (1 - 1.5 * dt);
                p.vy *= (1 - 1.5 * dt);
                p.vz *= (1 - 1.5 * dt);

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
