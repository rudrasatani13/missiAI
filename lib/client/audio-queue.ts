export class AudioQueue {
  private context: AudioContext | null = null
  private analyser: AnalyserNode | null = null
  private queue: ArrayBuffer[] = []
  private isProcessing = false
  private isInterrupted = false
  private currentSource: AudioBufferSourceNode | null = null
  private scheduleTime = 0
  private levelAnimFrame: number | null = null

  // Callback whenever the playback queue completely empties and stops playing
  public onEnded?: () => void
  public onLevelUpdate?: (level: number) => void

  constructor() {
    this.initContext()
  }

  private initContext() {
    if (typeof window === "undefined") return
    if (!this.context) {
      const AC = window.AudioContext || (window as any).webkitAudioContext
      this.context = new AC()
      this.analyser = this.context.createAnalyser()
      this.analyser.fftSize = 256
      this.analyser.smoothingTimeConstant = 0.85
      this.analyser.connect(this.context.destination)
    }
  }

  public async enqueue(audioData: ArrayBuffer) {
    if (this.isInterrupted) return
    this.initContext()
    
    // Copy the buffer so it's not disconnected if the caller modifies it
    const copy = audioData.slice(0)
    this.queue.push(copy)
    
    if (!this.isProcessing) {
      this.isProcessing = true
      // Resume context if it was suspended (browser policy)
      if (this.context?.state === "suspended") {
        await this.context.resume()
      }
      this.scheduleTime = this.context!.currentTime + 0.05
      this.processQueue()
      this.startLevelMonitor()
    }
  }

  private async processQueue() {
    if (this.isInterrupted || !this.context) {
      this.isProcessing = false
      return
    }

    if (this.queue.length === 0) {
      this.isProcessing = false
      return
    }

    const chunk = this.queue.shift()!
    try {
      const audioBuffer = await this.context.decodeAudioData(chunk)
      
      const source = this.context.createBufferSource()
      source.buffer = audioBuffer
      source.connect(this.analyser!)

      // If we fell behind, aggressively reset the schedule time to now to prevent huge gaps,
      // but ideally we append perfectly to the end of the last buffer.
      const currentTime = this.context.currentTime
      if (this.scheduleTime < currentTime) {
        this.scheduleTime = currentTime + 0.02
      }

      source.start(this.scheduleTime)
      this.currentSource = source
      
      this.scheduleTime += audioBuffer.duration

      // Listen for when THIS specific chunk finishes playing physically
      source.onended = () => {
        if (this.isInterrupted) return
        // If queue is completely empty and we just finished the last scheduled audio, fire onEnded
        if (this.queue.length === 0 && this.context!.currentTime >= this.scheduleTime - 0.05) {
          this.isProcessing = false
          this.stopLevelMonitor()
          if (this.onEnded) this.onEnded()
        }
      }

      // Check if we need to process next immediately to queue it in time
      this.processQueue()
    } catch (e) {
      console.error("AudioQueue decode error:", e)
      this.processQueue() // Skip and continue
    }
  }

  public interrupt() {
    this.isInterrupted = true
    this.isProcessing = false
    this.queue = []
    
    if (this.currentSource) {
      try { this.currentSource.stop() } catch {}
      this.currentSource = null
    }
    
    this.stopLevelMonitor()
  }

  public reset() {
    this.interrupt()
    this.isInterrupted = false
    this.scheduleTime = 0
  }

  private startLevelMonitor() {
    if (this.levelAnimFrame) return
    const data = new Uint8Array(this.analyser!.frequencyBinCount)
    
    const monitor = () => {
      if (!this.analyser) return
      this.analyser.getByteFrequencyData(data)
      let sum = 0
      for (let i = 0; i < data.length; i++) sum += data[i] * data[i]
      const rms = Math.sqrt(sum / data.length) / 255
      if (this.onLevelUpdate) {
        this.onLevelUpdate(Math.min(1, rms * 4))
      }
      this.levelAnimFrame = requestAnimationFrame(monitor)
    }
    this.levelAnimFrame = requestAnimationFrame(monitor)
  }

  private stopLevelMonitor() {
    if (this.levelAnimFrame) {
      cancelAnimationFrame(this.levelAnimFrame)
      this.levelAnimFrame = null
    }
    if (this.onLevelUpdate) {
      this.onLevelUpdate(0)
    }
  }
}
