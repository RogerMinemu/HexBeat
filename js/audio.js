/**
 * audio.js — Web Audio API: file upload, decode, BPM detection, real-time FFT
 */

export class AudioManager {
    constructor() {
        this.ctx = null;
        this.analyser = null;
        this.source = null;
        this.buffer = null;
        this.gainNode = null;

        // SFX
        this.explosionBuffer = null;

        // Analysis data
        this.bpm = 120;
        this.energyMap = []; // [{time, bass, mid, treble, total}]
        this.beatTimes = []; // seconds where beats occur
        this.melodyOnsets = []; // [{time, intensity}] — melodic note onsets
        this.duration = 0;

        // Real-time melody flux detection
        this._prevMidTreble = 0;
        this._melodyFluxHistory = new Float32Array(8); // rolling buffer
        this._melodyFluxIdx = 0;

        // Real-time data
        this.freqData = null;
        this.timeData = null;
        this.fftSize = 2048;

        // State
        this.isPlaying = false;
        this.startTime = 0;
        this.pauseOffset = 0;
    }

    async init() {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.analyser = this.ctx.createAnalyser();
        this.analyser.fftSize = this.fftSize;
        this.analyser.smoothingTimeConstant = 0.8;

        this.gainNode = this.ctx.createGain();
        this.gainNode.connect(this.ctx.destination);
        this.analyser.connect(this.gainNode);

        this.freqData = new Uint8Array(this.analyser.frequencyBinCount);
        this.timeData = new Uint8Array(this.analyser.frequencyBinCount);

        // Preload SFX
        this._loadSFX();
    }

    async _loadSFX() {
        try {
            const response = await fetch('sounds/daviddumaisaudio-large-underwater-explosion-190270.mp3');
            if (!response.ok) return;
            const arrayBuffer = await response.arrayBuffer();
            this.explosionBuffer = await this.ctx.decodeAudioData(arrayBuffer);
        } catch (e) {
            console.warn("Could not preload explosion sfx:", e);
        }
    }

    async loadFile(file, onProgress) {
        if (!this.ctx) await this.init();

        onProgress?.('Decodificando audio...', 10);
        const arrayBuffer = await file.arrayBuffer();

        onProgress?.('Procesando audio...', 30);
        this.buffer = await this.ctx.decodeAudioData(arrayBuffer);
        this.duration = this.buffer.duration;

        onProgress?.('Analizando energía...', 50);
        this._analyzeEnergy();

        onProgress?.('Detectando BPM...', 70);
        this._detectBPM();

        onProgress?.('Detectando melodía...', 85);
        this._detectMelodyOnsets();

        onProgress?.('Generando nivel...', 90);
        this._detectBeats();

        onProgress?.('¡Listo!', 100);
    }

    _analyzeEnergy() {
        const buffer = this.buffer;
        const sampleRate = buffer.sampleRate;
        const channelData = buffer.getChannelData(0);
        const windowSize = Math.floor(sampleRate * 0.05); // 50ms windows
        const hopSize = Math.floor(sampleRate * 0.025);   // 25ms hops

        this.energyMap = [];

        for (let i = 0; i < channelData.length - windowSize; i += hopSize) {
            const window = channelData.slice(i, i + windowSize);
            const time = i / sampleRate;

            // Simple energy calculation per band using the time-domain signal
            let bass = 0, mid = 0, treble = 0, total = 0;
            const fftSize = 512;
            const realPart = new Float32Array(fftSize);
            const len = Math.min(window.length, fftSize);

            for (let j = 0; j < len; j++) {
                realPart[j] = window[j];
            }

            // Use simple energy approximation instead of full FFT for pre-analysis
            for (let j = 0; j < len; j++) {
                const val = realPart[j] * realPart[j];
                total += val;

                // Approximate frequency band by position in window
                const normalizedPos = j / len;
                if (normalizedPos < 0.15) bass += val;
                else if (normalizedPos < 0.5) mid += val;
                else treble += val;
            }

            const norm = 1 / len;
            this.energyMap.push({
                time,
                bass: Math.sqrt(bass * norm) * 4,
                mid: Math.sqrt(mid * norm) * 4,
                treble: Math.sqrt(treble * norm) * 4,
                total: Math.sqrt(total * norm) * 4
            });
        }

        // Normalize energy values to 0-1 range
        const maxTotal = Math.max(...this.energyMap.map(e => e.total), 0.001);
        const maxBass = Math.max(...this.energyMap.map(e => e.bass), 0.001);
        const maxMid = Math.max(...this.energyMap.map(e => e.mid), 0.001);
        const maxTreble = Math.max(...this.energyMap.map(e => e.treble), 0.001);

        for (const e of this.energyMap) {
            e.total /= maxTotal;
            e.bass /= maxBass;
            e.mid /= maxMid;
            e.treble /= maxTreble;
        }
    }

    _detectBPM() {
        const channelData = this.buffer.getChannelData(0);
        const sampleRate = this.buffer.sampleRate;

        // Use onset detection for BPM: find energy peaks
        const windowSize = Math.floor(sampleRate * 0.01); // 10ms
        const energies = [];

        for (let i = 0; i < channelData.length - windowSize; i += windowSize) {
            let sum = 0;
            for (let j = i; j < i + windowSize; j++) {
                sum += channelData[j] * channelData[j];
            }
            energies.push(sum / windowSize);
        }

        // Find peaks in energy
        const peaks = [];
        const threshold = 1.5;
        const avgWindow = 40;

        for (let i = avgWindow; i < energies.length - avgWindow; i++) {
            let localAvg = 0;
            for (let j = i - avgWindow; j < i + avgWindow; j++) {
                localAvg += energies[j];
            }
            localAvg /= (avgWindow * 2);

            if (energies[i] > localAvg * threshold && energies[i] > energies[i - 1] && energies[i] > energies[i + 1]) {
                peaks.push(i);
            }
        }

        // Calculate intervals between peaks
        if (peaks.length < 2) {
            this.bpm = 120;
            return;
        }

        const intervals = [];
        for (let i = 1; i < peaks.length; i++) {
            const interval = (peaks[i] - peaks[i - 1]) * windowSize / sampleRate;
            if (interval > 0.25 && interval < 2.0) { // 30-240 BPM range
                intervals.push(interval);
            }
        }

        if (intervals.length === 0) {
            this.bpm = 120;
            return;
        }

        // Use median interval for robustness
        intervals.sort((a, b) => a - b);
        const medianInterval = intervals[Math.floor(intervals.length / 2)];
        let bpm = 60 / medianInterval;

        // Normalize to common BPM range (80-180)
        while (bpm < 80) bpm *= 2;
        while (bpm > 180) bpm /= 2;

        this.bpm = Math.round(bpm);
    }

    _detectBeats() {
        const beatInterval = 60 / this.bpm;
        this.beatTimes = [];

        // Find the first strong beat to align beat grid
        let firstBeatTime = 0;
        for (const e of this.energyMap) {
            if (e.total > 0.5) {
                firstBeatTime = e.time;
                break;
            }
        }

        // Generate beat grid
        for (let t = firstBeatTime; t < this.duration; t += beatInterval) {
            this.beatTimes.push(t);
        }
    }

    play() {
        if (this.isPlaying) return;
        if (!this.buffer) return;

        this.source = this.ctx.createBufferSource();
        this.source.buffer = this.buffer;
        this.source.connect(this.analyser);

        this.source.start(0, this.pauseOffset);
        this.startTime = this.ctx.currentTime - this.pauseOffset;
        this.isPlaying = true;

        this.source.onended = () => {
            this.isPlaying = false;
        };
    }

    stop() {
        if (this.source) {
            try { this.source.stop(); } catch (e) { /* already stopped */ }
            this.source = null;
        }
        if (this.gainNode && this.ctx) {
            this.gainNode.gain.cancelScheduledValues(this.ctx.currentTime);
            this.gainNode.gain.setValueAtTime(1, this.ctx.currentTime); // Reset volume for next play
        }
        this.isPlaying = false;
        this.pauseOffset = 0;
        this.startTime = 0;
    }

    fadeOut(duration = 0.8) {
        if (!this.isPlaying || !this.gainNode || !this.ctx) return;

        const now = this.ctx.currentTime;
        this.gainNode.gain.cancelScheduledValues(now);
        this.gainNode.gain.setValueAtTime(this.gainNode.gain.value, now);
        this.gainNode.gain.exponentialRampToValueAtTime(0.001, now + duration);

        // Actually stop the playback node after the fade finishes
        setTimeout(() => {
            if (this.isPlaying) this.stop();
        }, duration * 1000);
    }

    playExplosion() {
        if (!this.ctx || !this.explosionBuffer) return;
        const source = this.ctx.createBufferSource();
        source.buffer = this.explosionBuffer;

        // Optional: route through a separate gain node if we want to control SFX volume
        const sfxGain = this.ctx.createGain();
        sfxGain.gain.value = 1.0;

        source.connect(sfxGain);
        sfxGain.connect(this.ctx.destination);
        source.start(0);
    }

    restart() {
        this.stop();
        this.pauseOffset = 0;
        this.play();
    }

    get currentTime() {
        if (!this.isPlaying) return this.pauseOffset;
        return this.ctx.currentTime - this.startTime;
    }

    // Real-time audio data getters (returns 0-1)
    updateFrequencyData() {
        if (!this.analyser) return;
        this.analyser.getByteFrequencyData(this.freqData);
        this.analyser.getByteTimeDomainData(this.timeData);
    }

    getBass() {
        if (!this.freqData) return 0;
        let sum = 0;
        const binCount = this.analyser.frequencyBinCount;
        const bassEnd = Math.floor(binCount * 0.06); // ~0-250Hz
        for (let i = 0; i < bassEnd; i++) {
            sum += this.freqData[i];
        }
        return sum / (bassEnd * 255);
    }

    getMid() {
        if (!this.freqData) return 0;
        let sum = 0;
        const binCount = this.analyser.frequencyBinCount;
        const start = Math.floor(binCount * 0.06);
        const end = Math.floor(binCount * 0.4); // 250Hz-4kHz
        for (let i = start; i < end; i++) {
            sum += this.freqData[i];
        }
        return sum / ((end - start) * 255);
    }

    getTreble() {
        if (!this.freqData) return 0;
        let sum = 0;
        const binCount = this.analyser.frequencyBinCount;
        const start = Math.floor(binCount * 0.4);
        const end = binCount; // 4kHz+
        for (let i = start; i < end; i++) {
            sum += this.freqData[i];
        }
        return sum / ((end - start) * 255);
    }

    getOverallEnergy() {
        if (!this.freqData) return 0;
        let sum = 0;
        for (let i = 0; i < this.freqData.length; i++) {
            sum += this.freqData[i];
        }
        return sum / (this.freqData.length * 255);
    }

    getEnergyAt(time) {
        if (this.energyMap.length === 0) return { bass: 0, mid: 0, treble: 0, total: 0 };
        const idx = Math.floor(time / 0.025); // Match hop size
        if (idx >= 0 && idx < this.energyMap.length) {
            return this.energyMap[idx];
        }
        return this.energyMap[this.energyMap.length - 1];
    }

    /**
     * Pre-analysis: detect melodic note onsets via spectral flux in mid+treble bands.
     * Produces this.melodyOnsets = [{time, intensity}]
     */
    _detectMelodyOnsets() {
        this.melodyOnsets = [];
        if (this.energyMap.length < 3) return;

        // Compute spectral flux of mid+treble energy (positive differences only)
        const flux = [];
        for (let i = 1; i < this.energyMap.length; i++) {
            const prev = this.energyMap[i - 1];
            const curr = this.energyMap[i];
            // Only positive flux (new energy appearing, not decaying)
            const df = Math.max(0, (curr.mid + curr.treble) - (prev.mid + prev.treble));
            flux.push({ time: curr.time, value: df });
        }

        // Adaptive threshold: local mean over ~200ms window (8 frames at 25ms hop)
        const halfWin = 4;
        const thresholdFactor = 1.8; // onset must be this many times the local average
        const minCooldown = 0.08;    // minimum 80ms between onsets
        let lastOnsetTime = -1;

        for (let i = halfWin; i < flux.length - halfWin; i++) {
            let localSum = 0;
            for (let j = i - halfWin; j <= i + halfWin; j++) {
                localSum += flux[j].value;
            }
            const localMean = localSum / (halfWin * 2 + 1);

            // Must be a local peak and above adaptive threshold
            if (flux[i].value > localMean * thresholdFactor &&
                flux[i].value > flux[i - 1].value &&
                flux[i].value > flux[i + 1].value &&
                flux[i].value > 0.02 && // absolute minimum to reject silence
                flux[i].time - lastOnsetTime > minCooldown) {

                lastOnsetTime = flux[i].time;
                this.melodyOnsets.push({
                    time: flux[i].time,
                    intensity: flux[i].value // will be normalized below
                });
            }
        }

        // Normalize intensities to 0-1
        if (this.melodyOnsets.length > 0) {
            const maxIntensity = Math.max(...this.melodyOnsets.map(o => o.intensity), 0.001);
            for (const o of this.melodyOnsets) {
                o.intensity /= maxIntensity;
            }
        }
    }

    /**
     * Real-time melody flux: returns 0-1 representing how much mid+treble energy
     * is currently rising compared to the recent average. Useful for frame-by-frame
     * reactivity beyond the pre-computed onsets.
     */
    getMelodyFlux() {
        if (!this.freqData) return 0;

        const binCount = this.analyser.frequencyBinCount;
        const midStart = Math.floor(binCount * 0.06);  // ~250Hz
        const trebleEnd = Math.floor(binCount * 0.6);   // ~6kHz (melodic range)

        let sum = 0;
        for (let i = midStart; i < trebleEnd; i++) {
            sum += this.freqData[i];
        }
        const current = sum / ((trebleEnd - midStart) * 255);

        // Positive flux only
        const flux = Math.max(0, current - this._prevMidTreble);
        this._prevMidTreble = current;

        // Store in rolling buffer for adaptive threshold
        this._melodyFluxHistory[this._melodyFluxIdx % this._melodyFluxHistory.length] = flux;
        this._melodyFluxIdx++;

        // Average of recent flux values
        let avg = 0;
        for (let i = 0; i < this._melodyFluxHistory.length; i++) {
            avg += this._melodyFluxHistory[i];
        }
        avg /= this._melodyFluxHistory.length;

        // Return normalized: how much current flux exceeds average (clamped 0-1)
        if (avg < 0.001) return Math.min(flux * 10, 1);
        return Math.min(flux / (avg * 2), 1);
    }
}
