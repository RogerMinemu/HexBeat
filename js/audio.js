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

        // Analysis data
        this.bpm = 120;
        this.energyMap = []; // [{time, bass, mid, treble, total}]
        this.beatTimes = []; // seconds where beats occur
        this.duration = 0;

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
        this.isPlaying = false;
        this.pauseOffset = 0;
        this.startTime = 0;
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
}
