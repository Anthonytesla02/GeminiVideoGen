/**
 * Decodes a base64 string into a Uint8Array.
 */
export function decodeBase64(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Decodes raw PCM audio data into an AudioBuffer.
 */
export async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number = 24000,
  numChannels: number = 1
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

/**
 * Creates a Bass Boost EQ Filter (LowShelf).
 */
export function createBassBoost(ctx: AudioContext): BiquadFilterNode {
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowshelf';
  filter.frequency.value = 200; // Boost frequencies below 200Hz
  filter.gain.value = 4; // +4dB Boost
  return filter;
}

/**
 * Synthesizes a "Pop" SFX for text appearance.
 */
export function playPopSFX(ctx: AudioContext, destination: AudioNode) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(800, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.1);

  gain.gain.setValueAtTime(0.1, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);

  osc.connect(gain);
  gain.connect(destination);

  osc.start();
  osc.stop(ctx.currentTime + 0.1);
}

/**
 * Synthesizes a "Whoosh" SFX for transitions (White Noise Filter Sweep).
 */
export function playWhooshSFX(ctx: AudioContext, destination: AudioNode) {
  const bufferSize = ctx.sampleRate * 0.5; // 0.5 seconds
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);

  // Create White Noise
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }

  const noise = ctx.createBufferSource();
  noise.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(200, ctx.currentTime);
  filter.frequency.exponentialRampToValueAtTime(2000, ctx.currentTime + 0.3);
  filter.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + 0.5);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, ctx.currentTime);
  gain.gain.linearRampToValueAtTime(0.1, ctx.currentTime + 0.25);
  gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.5);

  noise.connect(filter);
  filter.connect(gain);
  gain.connect(destination);

  noise.start();
}

/**
 * Creates a simple Lofi Drone (simulated background music).
 */
export function createLofiDrone(ctx: AudioContext): AudioNode {
  const osc1 = ctx.createOscillator();
  osc1.type = 'triangle';
  osc1.frequency.value = 55; // A1

  const osc2 = ctx.createOscillator();
  osc2.type = 'sine';
  osc2.frequency.value = 57; // Detuned slightly

  const gain = ctx.createGain();
  gain.gain.value = 0.05; // Very quiet

  osc1.connect(gain);
  osc2.connect(gain);
  osc1.start();
  osc2.start();

  return gain;
}