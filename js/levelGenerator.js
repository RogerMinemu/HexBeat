/**
 * levelGenerator.js — Procedural wall pattern generation from audio analysis
 */

const TWO_PI = Math.PI * 2;
const HEX_SIDES = 6;

// Pattern templates: arrays of gap indices (which sides are open)
const PATTERNS = {
    // Single gap
    single: (side) => [side % HEX_SIDES],

    // Opposite gap (two gaps across from each other)
    opposite: (side) => [side % HEX_SIDES, (side + 3) % HEX_SIDES],

    // Adjacent double gap
    adjacent: (side) => [side % HEX_SIDES, (side + 1) % HEX_SIDES],

    // Triple gap (half open)
    halfOpen: (side) => [side % HEX_SIDES, (side + 1) % HEX_SIDES, (side + 2) % HEX_SIDES],

    // Narrow: only one side open
    narrow: (side) => [side % HEX_SIDES],

    // Wide: three consecutive open
    wide: (side) => [side % HEX_SIDES, (side + 1) % HEX_SIDES, (side + 2) % HEX_SIDES],

    // Alternating: every other side open
    alternating: (side) => [side % HEX_SIDES, (side + 2) % HEX_SIDES, (side + 4) % HEX_SIDES],
};

export class LevelGenerator {
    constructor() {
        this.events = []; // [{time, gaps, speed, color, spawnTime}]
        this.currentEventIndex = 0;

        // Difficulty params
        this.baseSpeed = 6;
        this.spawnRadius = 20; // must match WallSystem.spawnRadius
        this.difficultyRamp = 0;
    }

    /**
     * Generate level events from audio analysis data
     */
    generate(audioManager) {
        this.events = [];
        this.currentEventIndex = 0;

        const bpm = audioManager.bpm;
        const beatInterval = 60 / bpm;
        const duration = audioManager.duration;

        // Grace period: must be longer than max travel time so first wall doesn't appear instantly
        const maxTravelTime = this.spawnRadius / (this.baseSpeed * 0.7);
        const gracePeriod = maxTravelTime + 2.0; // ~5.7 seconds grace

        // Use a half-beat as minimum interval for walls
        const minInterval = beatInterval * 0.5;
        let lastEventTime = -minInterval;

        let spiralDirection = 0;
        let patternPhase = 0;
        let lastGaps = null; // Track last pattern's gaps to ensure passability

        // Walk through beats
        for (const beatTime of audioManager.beatTimes) {
            if (beatTime < gracePeriod) continue; // Skip grace period
            if (beatTime - lastEventTime < minInterval * 0.8) continue;

            // Get energy at this beat
            const energy = audioManager.getEnergyAt(beatTime);

            // Calculate difficulty based on time
            const timeFactor = Math.min(beatTime / duration, 1);
            const difficulty = timeFactor;

            // Determine pattern based on energy and difficulty
            let pattern;
            let speed = this.baseSpeed;

            // First 5 events are always easy (wide gaps)
            if (this.events.length < 5) {
                pattern = PATTERNS.halfOpen(patternPhase);
                patternPhase = (patternPhase + 1) % HEX_SIDES;
                speed = this.baseSpeed * 0.8;
            } else if (energy.total > 0.8 && difficulty > 0.3) {
                // High energy = harder patterns
                const roll = Math.random();
                if (roll < 0.3) {
                    pattern = PATTERNS.narrow(spiralDirection);
                    spiralDirection = (spiralDirection + 1) % HEX_SIDES;
                } else if (roll < 0.6) {
                    pattern = PATTERNS.single(Math.floor(Math.random() * HEX_SIDES));
                } else {
                    pattern = PATTERNS.opposite(Math.floor(Math.random() * HEX_SIDES));
                }
                speed = this.baseSpeed * (1.0 + difficulty * 0.8);
            } else if (energy.total > 0.5) {
                // Medium energy
                const roll = Math.random();
                if (roll < 0.4) {
                    pattern = PATTERNS.opposite(patternPhase);
                } else if (roll < 0.7) {
                    pattern = PATTERNS.adjacent(patternPhase);
                } else {
                    pattern = PATTERNS.single(patternPhase);
                }
                patternPhase = (patternPhase + 1) % HEX_SIDES;
                speed = this.baseSpeed * (1.0 + difficulty * 0.5);
            } else if (energy.total > 0.2) {
                // Low energy = easier
                const roll = Math.random();
                if (roll < 0.5) {
                    pattern = PATTERNS.halfOpen(Math.floor(Math.random() * HEX_SIDES));
                } else {
                    pattern = PATTERNS.wide(Math.floor(Math.random() * HEX_SIDES));
                }
                speed = this.baseSpeed * (0.8 + difficulty * 0.3);
            } else {
                // Very low energy — skip or very easy
                if (Math.random() < 0.5) continue;
                pattern = PATTERNS.alternating(Math.floor(Math.random() * HEX_SIDES));
                speed = this.baseSpeed * 0.7;
            }

            // CRITICAL: ensure consecutive patterns share at least one gap
            // so overlapping walls are always passable
            if (lastGaps !== null) {
                const commonGaps = pattern.filter(g => lastGaps.includes(g));
                if (commonGaps.length === 0) {
                    // Force at least one shared gap with previous pattern
                    const sharedGap = lastGaps[Math.floor(Math.random() * lastGaps.length)];
                    if (!pattern.includes(sharedGap)) {
                        pattern.push(sharedGap);
                    }
                }
            }
            lastGaps = pattern;

            // Add some speed variety on strong beats
            if (energy.bass > 0.7) {
                speed *= 1.2;
            }

            // Calculate when this wall should spawn so it arrives at beatTime
            const travelTime = this.spawnRadius / speed;
            const spawnTime = beatTime - travelTime;

            this.events.push({
                time: beatTime,
                spawnTime: spawnTime,
                gaps: pattern,
                speed,
                thickness: 0.3 + difficulty * 0.3
            });

            lastEventTime = beatTime;
        }

        // Add extra patterns between beats during high-energy sections
        this._addSubBeatPatterns(audioManager, beatInterval);

        // Recalculate spawn times after adding sub-beat patterns and re-sort
        this.events.sort((a, b) => a.spawnTime - b.spawnTime);
    }

    _addSubBeatPatterns(audioManager, beatInterval) {
        const subEvents = [];

        for (let i = 0; i < this.events.length - 1; i++) {
            const event = this.events[i];
            const nextEvent = this.events[i + 1];
            const gap = nextEvent.time - event.time;

            // If gap is larger than 1.5 beats and energy is high, add sub-beat
            if (gap > beatInterval * 1.5) {
                const energy = audioManager.getEnergyAt(event.time + gap / 2);
                if (energy.total > 0.6) {
                    // Ensure sub-beat shares a gap with surrounding events
                    const sharedGap = event.gaps[0];
                    const subGaps = PATTERNS.opposite(sharedGap);
                    const speed = event.speed * 0.9;
                    const travelTime = this.spawnRadius / speed;

                    subEvents.push({
                        time: event.time + gap / 2,
                        spawnTime: event.time + gap / 2 - travelTime,
                        gaps: subGaps,
                        speed,
                        thickness: 0.3
                    });
                }
            }
        }

        this.events.push(...subEvents);
        this.events.sort((a, b) => a.spawnTime - b.spawnTime);
    }

    /**
     * Get events that should spawn at the current audio time.
     * Each event has a pre-calculated spawnTime based on its travel time.
     */
    getEventsForTime(audioTime) {
        const toSpawn = [];

        while (this.currentEventIndex < this.events.length) {
            const event = this.events[this.currentEventIndex];
            if (event.spawnTime <= audioTime) {
                toSpawn.push(event);
                this.currentEventIndex++;
            } else {
                break;
            }
        }

        return toSpawn;
    }

    reset() {
        this.currentEventIndex = 0;
        this.difficultyRamp = 0;
    }

    get totalEvents() {
        return this.events.length;
    }
}
