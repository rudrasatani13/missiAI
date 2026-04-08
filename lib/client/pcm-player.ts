export class PCMPlayer {
  private audioCtx: AudioContext | null = null;
  private nextStartTime = 0;
  private isPlaying = false;
  private gainNode: GainNode | null = null;
  private analyser: AnalyserNode | null = null;

  constructor(private sampleRate: number = 24000) {}

  public init() {
    if (this.audioCtx) return;
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    this.audioCtx = new AudioContextClass({ sampleRate: this.sampleRate });
    
    this.analyser = this.audioCtx.createAnalyser();
    this.analyser.fftSize = 256;

    this.gainNode = this.audioCtx.createGain();
    this.gainNode.connect(this.analyser);
    this.analyser.connect(this.audioCtx.destination);
  }

  public feedBase64(base64: string) {
    if (!this.audioCtx) this.init();
    if (!this.audioCtx || !this.gainNode) return;

    try {
      const binaryString = window.atob(base64);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      // Convert Int16 PCM to Float32
      const pcm16 = new Int16Array(bytes.buffer);
      const float32 = new Float32Array(pcm16.length);
      for (let i = 0; i < pcm16.length; i++) {
        float32[i] = pcm16[i] / 32768.0; // Normalize between -1.0 and 1.0
      }

      const buffer = this.audioCtx.createBuffer(1, float32.length, this.sampleRate);
      buffer.copyToChannel(float32, 0);

      const source = this.audioCtx.createBufferSource();
      source.buffer = buffer;
      source.connect(this.gainNode);

      // Gapless scheduling
      const currentTime = this.audioCtx.currentTime;
      if (this.nextStartTime < currentTime) {
        this.nextStartTime = currentTime + 0.05; // tiny buffer
      }

      source.start(this.nextStartTime);
      this.nextStartTime += buffer.duration;
      this.isPlaying = true;
    } catch (e) {
      console.error("PCMPlayer decoding error:", e);
    }
  }

  public getAnalyser() {
    return this.analyser;
  }

  public stop() {
    this.isPlaying = false;
    this.nextStartTime = 0;
    if (this.audioCtx) {
      this.audioCtx.close().catch(()=>{});
      this.audioCtx = null;
    }
  }
}

export const globalPcmPlayer = new PCMPlayer();
