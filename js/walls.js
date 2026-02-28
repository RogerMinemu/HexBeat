/**
 * walls.js — Wall obstacle system with hexagonal arc segments
 */
import * as THREE from 'three';

const TWO_PI = Math.PI * 2;
const HEX_SIDES = 6;
const SIDE_ANGLE = TWO_PI / HEX_SIDES;

export class WallSystem {
    constructor(scene) {
        this.scene = scene;
        this.walls = [];
        this.wallGroup = new THREE.Group();
        this.scene.add(this.wallGroup);

        // Settings
        this.baseSpeed = 6; // units per second (inward speed)
        this.spawnRadius = 20; // where walls spawn
        this.despawnRadius = 1.2; // where walls get removed
        this.wallThickness = 0.4;

        // Shared outline material
        this.outlineMat = new THREE.LineBasicMaterial({
            color: 0xff0000, // Rojo vivo
            transparent: true,
            opacity: 0.6,  // Full opacidad para que brille al máximo
            linewidth: 3   // Más gruesa
        });
    }

    /**
     * Spawn a wall pattern
     * @param {number[]} gaps - Array of side indices (0-5) that are OPEN (gaps)
     * @param {object} options - { speed, color, thickness }
     */
    spawnPattern(gaps, options = {}) {
        const speed = options.speed || this.baseSpeed;
        const color = options.color || 0x00f0ff;
        const thickness = options.thickness || this.wallThickness;

        for (let side = 0; side < HEX_SIDES; side++) {
            if (gaps.includes(side)) continue; // This side is a gap

            const wall = this._createWall(side, this.spawnRadius, color, thickness);
            wall.userData = {
                side,
                radius: this.spawnRadius,
                speed,
                angleStart: side * SIDE_ANGLE - Math.PI / 6,
                angleEnd: (side + 1) * SIDE_ANGLE - Math.PI / 6,
                thickness,
                active: true
            };

            this.walls.push(wall);
            this.wallGroup.add(wall);
        }
    }

    _createWall(side, radius, color, thickness) {
        // Create an arc segment
        const angleStart = side * SIDE_ANGLE - Math.PI / 6;
        const angleEnd = (side + 1) * SIDE_ANGLE - Math.PI / 6;
        const segments = 1;

        const shape = new THREE.Shape();

        // Outer arc
        for (let i = 0; i <= segments; i++) {
            const t = i / segments;
            const angle = angleStart + (angleEnd - angleStart) * t;
            const x = Math.cos(angle) * (radius + thickness / 2);
            const y = Math.sin(angle) * (radius + thickness / 2);
            if (i === 0) shape.moveTo(x, y);
            else shape.lineTo(x, y);
        }

        // Inner arc (reverse)
        for (let i = segments; i >= 0; i--) {
            const t = i / segments;
            const angle = angleStart + (angleEnd - angleStart) * t;
            const x = Math.cos(angle) * (radius - thickness / 2);
            const y = Math.sin(angle) * (radius - thickness / 2);
            shape.lineTo(x, y);
        }

        shape.closePath();

        const geometry = new THREE.ShapeGeometry(shape);
        // Dim color so walls stay below bloom threshold
        const brightColor = new THREE.Color(color).multiplyScalar(3.2);
        const material = new THREE.MeshBasicMaterial({
            color: brightColor,
            transparent: true,
            opacity: 1.0,
            side: THREE.DoubleSide
        });

        const mesh = new THREE.Mesh(geometry, material);

        // White outline
        const outlinePoints = this._getOutlinePoints(angleStart, angleEnd, radius, thickness);
        const outlineGeo = new THREE.BufferGeometry().setFromPoints(outlinePoints);
        const outline = new THREE.LineLoop(outlineGeo, this.outlineMat);
        outline.position.z = 0.01;
        mesh.add(outline);
        mesh.userData.outline = outline;

        return mesh;
    }

    _getOutlinePoints(angleStart, angleEnd, radius, thickness) {
        const segments = 1;
        const points = [];

        // Outer arc
        for (let i = 0; i <= segments; i++) {
            const t = i / segments;
            const angle = angleStart + (angleEnd - angleStart) * t;
            points.push(new THREE.Vector3(
                Math.cos(angle) * (radius + thickness / 2),
                Math.sin(angle) * (radius + thickness / 2),
                0
            ));
        }

        // Inner arc (reverse)
        for (let i = segments; i >= 0; i--) {
            const t = i / segments;
            const angle = angleStart + (angleEnd - angleStart) * t;
            points.push(new THREE.Vector3(
                Math.cos(angle) * (radius - thickness / 2),
                Math.sin(angle) * (radius - thickness / 2),
                0
            ));
        }

        return points;
    }

    update(dt, audioData) {
        for (let i = this.walls.length - 1; i >= 0; i--) {
            const wall = this.walls[i];
            const data = wall.userData;

            if (!data.active) continue;

            // Move wall inward
            data.radius -= data.speed * dt;

            // Rebuild geometry at new radius
            this._updateWallGeometry(wall, data);

            // Check if past center
            if (data.radius < this.despawnRadius) {
                this._removeWall(i);
            }
        }
    }

    _updateWallGeometry(wall, data) {
        // Dispose old geometry
        wall.geometry.dispose();

        const radius = data.radius;
        const thickness = data.thickness;
        const angleStart = data.angleStart;
        const angleEnd = data.angleEnd;
        const segments = 1;

        const shape = new THREE.Shape();

        for (let i = 0; i <= segments; i++) {
            const t = i / segments;
            const angle = angleStart + (angleEnd - angleStart) * t;
            const x = Math.cos(angle) * (radius + thickness / 2);
            const y = Math.sin(angle) * (radius + thickness / 2);
            if (i === 0) shape.moveTo(x, y);
            else shape.lineTo(x, y);
        }

        for (let i = segments; i >= 0; i--) {
            const t = i / segments;
            const angle = angleStart + (angleEnd - angleStart) * t;
            const x = Math.cos(angle) * (radius - thickness / 2);
            const y = Math.sin(angle) * (radius - thickness / 2);
            shape.lineTo(x, y);
        }

        shape.closePath();
        wall.geometry = new THREE.ShapeGeometry(shape);

        // Update outline
        const outline = wall.userData.outline;
        if (outline) {
            outline.geometry.dispose();
            const outlinePoints = this._getOutlinePoints(data.angleStart, data.angleEnd, radius, thickness);
            outline.geometry = new THREE.BufferGeometry().setFromPoints(outlinePoints);
        }
    }

    _removeWall(index) {
        const wall = this.walls[index];
        if (wall.userData.outline) {
            wall.userData.outline.geometry.dispose();
        }
        this.wallGroup.remove(wall);
        wall.geometry.dispose();
        wall.material.dispose();
        this.walls.splice(index, 1);
    }

    /**
     * Check collisions with all walls
     * @param {Player} player
     * @returns {boolean} true if collision detected
     */
    checkCollisions(player) {
        for (const wall of this.walls) {
            const data = wall.userData;
            if (!data.active) continue;

            const innerR = data.radius - data.thickness / 2;
            const outerR = data.radius + data.thickness / 2;

            if (player.checkCollision(data.angleStart, data.angleEnd, innerR, outerR)) {
                return true;
            }
        }
        return false;
    }

    setColor(color) {
        // Multiplier set to 3.2 to match bright walls creation
        const brightColor = new THREE.Color(color).multiplyScalar(0.6);
        for (const wall of this.walls) {
            wall.material.color.copy(brightColor);
        }
    }

    clear() {
        for (const wall of this.walls) {
            if (wall.userData.outline) {
                wall.userData.outline.geometry.dispose();
            }
            this.wallGroup.remove(wall);
            wall.geometry.dispose();
            wall.material.dispose();
        }
        this.walls = [];
    }

    dispose() {
        this.clear();
        this.scene.remove(this.wallGroup);
    }
}
