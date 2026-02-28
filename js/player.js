/**
 * player.js — Player triangle orbiting the hexagon
 */
import * as THREE from 'three';

export class Player {
    constructor(scene) {
        this.scene = scene;

        // Position (angle around the center)
        this.angle = Math.PI / 2; // Start at top
        this.orbitRadius = 2.2;

        // Movement — instant, no acceleration
        this.moveSpeed = 6.5; // radians per second

        // Input
        this.movingLeft = false;
        this.movingRight = false;

        // Visual
        this.mesh = null;
        this.trail = [];
        this.trailGroup = new THREE.Group();
        this.scene.add(this.trailGroup);

        this._createMesh();
        this._setupInput();
    }

    _createMesh() {
        // Triangle shape
        const shape = new THREE.Shape();
        const size = 0.3;
        shape.moveTo(0, size);
        shape.lineTo(-size * 0.7, -size * 0.5);
        shape.lineTo(size * 0.7, -size * 0.5);
        shape.lineTo(0, size);

        const geo = new THREE.ShapeGeometry(shape);
        const mat = new THREE.MeshBasicMaterial({
            color: 0xE0E0E0,
            side: THREE.DoubleSide
        });

        this.mesh = new THREE.Mesh(geo, mat);
        this.mesh.position.z = 0.1;
        this.scene.add(this.mesh);
    }

    _setupInput() {
        this._onKeyDown = (e) => {
            if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') this.movingLeft = true;
            if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') this.movingRight = true;
        };

        this._onKeyUp = (e) => {
            if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') this.movingLeft = false;
            if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') this.movingRight = false;
        };

        // Touch support
        this._onTouchStart = (e) => {
            for (const touch of e.changedTouches) {
                if (touch.clientX < window.innerWidth / 2) this.movingLeft = true;
                else this.movingRight = true;
            }
        };

        this._onTouchEnd = (e) => {
            if (e.touches.length === 0) {
                this.movingLeft = false;
                this.movingRight = false;
            }
        };

        window.addEventListener('keydown', this._onKeyDown);
        window.addEventListener('keyup', this._onKeyUp);
        window.addEventListener('touchstart', this._onTouchStart);
        window.addEventListener('touchend', this._onTouchEnd);
    }

    update(dt) {
        // Instant movement — no acceleration, immediate response
        let dir = 0;
        if (this.movingLeft) dir += 1;
        if (this.movingRight) dir -= 1;

        // Update angle directly
        this.angle += dir * this.moveSpeed * dt;

        // Update mesh position
        const x = Math.cos(this.angle) * this.orbitRadius;
        const y = Math.sin(this.angle) * this.orbitRadius;
        this.mesh.position.set(x, y, 0.1);

        // Rotate mesh to face outward (tangent to orbit)
        this.mesh.rotation.z = this.angle - Math.PI / 2;

        // Update trail
        this._updateTrail(x, y);
    }

    _updateTrail(x, y) {
        // Add trail point
        if (this.movingLeft || this.movingRight) {
            const geo = new THREE.CircleGeometry(0.06, 6);
            const mat = new THREE.MeshBasicMaterial({
                color: 0xffffff,
                transparent: true,
                opacity: 0.6
            });
            const dot = new THREE.Mesh(geo, mat);
            dot.position.set(x, y, 0.05);
            this.trailGroup.add(dot);

            this.trail.push({ mesh: dot, life: 0.4 });
        }

        // Update existing trail
        for (let i = this.trail.length - 1; i >= 0; i--) {
            this.trail[i].life -= 0.016; // approximate
            this.trail[i].mesh.material.opacity = Math.max(0, this.trail[i].life);
            this.trail[i].mesh.scale.setScalar(this.trail[i].life * 2);

            if (this.trail[i].life <= 0) {
                this.trailGroup.remove(this.trail[i].mesh);
                this.trail[i].mesh.geometry.dispose();
                this.trail[i].mesh.material.dispose();
                this.trail.splice(i, 1);
            }
        }

        // Limit trail length
        while (this.trail.length > 30) {
            const old = this.trail.shift();
            this.trailGroup.remove(old.mesh);
            old.mesh.geometry.dispose();
            old.mesh.material.dispose();
        }
    }

    // Check collision with a wall defined by angle range and radius range
    checkCollision(wallAngleStart, wallAngleEnd, wallInnerRadius, wallOuterRadius) {
        const playerR = this.orbitRadius;
        const playerAngle = ((this.angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
        const playerSize = 0.2; // collision radius

        // Check radial overlap
        const hitDepth = 0.05;
        const lethalOuterBound = Math.min(wallOuterRadius, wallInnerRadius + hitDepth);

        if (playerR + playerSize < wallInnerRadius || playerR - playerSize > lethalOuterBound) {
            return false;
        }

        // Normalize wall angles
        let aStart = ((wallAngleStart % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
        let aEnd = ((wallAngleEnd % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);

        // Angular collision check with player size
        const angularSize = (playerSize * 0.7) / playerR;

        // Handle wrapping
        if (aStart <= aEnd) {
            if (playerAngle + angularSize > aStart && playerAngle - angularSize < aEnd) return true;
        } else {
            // Wraps around 0
            if (playerAngle + angularSize > aStart || playerAngle - angularSize < aEnd) return true;
        }

        return false;
    }

    reset() {
        this.angle = Math.PI / 2;
        this.movingLeft = false;
        this.movingRight = false;

        // Clear trail
        for (const t of this.trail) {
            this.trailGroup.remove(t.mesh);
            t.mesh.geometry.dispose();
            t.mesh.material.dispose();
        }
        this.trail = [];
    }

    dispose() {
        window.removeEventListener('keydown', this._onKeyDown);
        window.removeEventListener('keyup', this._onKeyUp);
        window.removeEventListener('touchstart', this._onTouchStart);
        window.removeEventListener('touchend', this._onTouchEnd);

        this.scene.remove(this.mesh);
        this.scene.remove(this.trailGroup);
    }
}
