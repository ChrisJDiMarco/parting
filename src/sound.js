export class GameSound {
  constructor() { this.enabled = true; this.context = null; this.lastImpact = 0; }
  unlock() {
    if (!this.enabled) return;
    this.context ??= new AudioContext();
    if (this.context.state === 'suspended') this.context.resume().catch(() => {});
  }
  tone(frequency, duration, volume, type = 'sine', delay = 0) {
    if (!this.enabled || !this.context || this.context.state !== 'running') return;
    const time = this.context.currentTime + delay;
    const oscillator = this.context.createOscillator(); const gain = this.context.createGain();
    oscillator.type = type; oscillator.frequency.setValueAtTime(frequency, time);
    oscillator.frequency.exponentialRampToValueAtTime(frequency * .7, time + duration);
    gain.gain.setValueAtTime(.0001, time); gain.gain.exponentialRampToValueAtTime(volume, time + .006);
    gain.gain.exponentialRampToValueAtTime(.0001, time + duration);
    oscillator.connect(gain); gain.connect(this.context.destination); oscillator.start(time); oscillator.stop(time + duration + .03);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  }
  select() { this.tone(740, .075, .035); }
  release(power) { this.tone(140 + power * 100, .18, .065, 'triangle'); }
  event(event) {
    if (event.type === 'score') { [440, 660, 880].forEach((f, i) => this.tone(f * (event.player ? 1.125 : 1), .4, .045, 'sine', i * .07)); return; }
    if (event.type === 'settled') { this.tone(370, .16, .02); return; }
    if ((event.type === 'wall' || event.type === 'collision') && performance.now() - this.lastImpact > 35) {
      this.lastImpact = performance.now(); this.tone(event.type === 'wall' ? 210 : 510, .06 + event.intensity * .06, .015 + event.intensity * .07, 'triangle');
    }
  }
}
