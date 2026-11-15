// A shared-clock audition engine. Live playback and WAV export use the same note plan.
import { sharedContext } from './foley.js';

function outputGraph(ctx, volume, muted) {
  const master = ctx.createGain(); master.gain.value = volume;
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -12; limiter.knee.value = 6; limiter.ratio.value = 6;
  master.connect(limiter); limiter.connect(ctx.destination);
  const tracks = [0,1].map(i => { const g = ctx.createGain(); g.gain.value = muted[i] ? 0 : 1; g.connect(master); return g; });
  return { master, tracks, limiter };
}

function addNote(ctx, out, note, start, sources) {
  const osc = ctx.createOscillator(); const env = ctx.createGain();
  const t = start + note.at; const end = t + note.duration;
  osc.type = note.dataset === 'rain' ? 'triangle' : 'sine';
  osc.frequency.value = 440 * 2 ** ((note.pitch - 69) / 12);
  env.gain.setValueAtTime(0,t);
  env.gain.linearRampToValueAtTime(0.18,t + 0.025);
  env.gain.exponentialRampToValueAtTime(0.07,end - 0.1);
  env.gain.linearRampToValueAtTime(0,end);
  osc.connect(env); env.connect(out);
  osc.onended = () => { osc.disconnect(); env.disconnect(); sources?.delete(osc); };
  sources?.add(osc); osc.start(t); osc.stop(end + 0.01);
}

export function createSeasonalAudio({ onTick = () => {}, onEnd = () => {} } = {}) {
  let ctx = null, graph = null, timer = null, plan = null, start = 0, generation = 0, lastKey = '';
  let volume = 0.8; let muted = [false,false];
  const sources = new Set();
  function stop() {
    generation++; clearInterval(timer); timer = null; plan = null;
    for (const src of sources) { try { src.stop(); } catch {} }
    sources.clear();
    if (graph) { graph.tracks.forEach(g => g.disconnect()); graph.master.disconnect(); graph.limiter.disconnect(); graph = null; }
  }
  return {
    stop,
    get playing() { return plan !== null; },
    async play(next) {
      stop(); if (!next.slots.length) return false;
      const token = generation;
      ctx = sharedContext();
      if (!ctx) throw new Error('This browser does not support audio.');
      await ctx.resume(); if (token !== generation) return false;
      graph = outputGraph(ctx, volume, muted); plan = next; start = ctx.currentTime + 0.06; lastKey = '';
      for (const note of next.events) addNote(ctx, graph.tracks[note.track], note, start, sources);
      const tick = () => {
        if (!plan) return;
        const elapsed = Math.max(0,ctx.currentTime - start);
        if (elapsed >= plan.duration) { stop(); onEnd(); return; }
        const index = Math.min(plan.slots.length - 1, Math.floor(elapsed / 2));
        const track = plan.duet ? -1 : Math.floor(elapsed % 2);
        const key = `${index}:${track}`;
        if (key !== lastKey) { lastKey = key; onTick(plan.slots[index].month,track,plan.slots[index].status); }
      };
      tick(); timer = setInterval(tick,50); return true;
    },
    setVolume(value) { volume = Math.max(0,Math.min(1,Number(value) || 0)); if (graph) graph.master.gain.setTargetAtTime(volume,ctx.currentTime,0.03); },
    setMuted(values) { muted = values.map(Boolean); if (graph) graph.tracks.forEach((g,i) => g.gain.setTargetAtTime(muted[i] ? 0 : 1,ctx.currentTime,0.02)); },
    async export(planToExport) {
      if (!planToExport.duration) throw new Error('There are no changed comparable months to export.');
      const Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
      if (!Offline) throw new Error('Audio export is not available in this browser.');
      const offline = new Offline(1,Math.ceil(planToExport.duration * 44100),44100);
      const out = outputGraph(offline,volume,muted);
      for (const note of planToExport.events) addNote(offline,out.tracks[note.track],note,0);
      return encodeWav(await offline.startRendering());
    },
  };
}

export function encodeWav(buffer) {
  const channels = buffer.numberOfChannels; const bytes = buffer.length * channels * 2;
  const result = new ArrayBuffer(44 + bytes); const v = new DataView(result);
  const word = (offset,text) => [...text].forEach((c,i) => v.setUint8(offset+i,c.charCodeAt(0)));
  word(0,'RIFF'); v.setUint32(4,36+bytes,true); word(8,'WAVE'); word(12,'fmt ');
  v.setUint32(16,16,true); v.setUint16(20,1,true); v.setUint16(22,channels,true);
  v.setUint32(24,buffer.sampleRate,true); v.setUint32(28,buffer.sampleRate*channels*2,true);
  v.setUint16(32,channels*2,true); v.setUint16(34,16,true); word(36,'data'); v.setUint32(40,bytes,true);
  const data = Array.from({length:channels},(_,i) => buffer.getChannelData(i));
  for (let i=0;i<buffer.length;i++) for (let c=0;c<channels;c++) {
    const s = Math.max(-1,Math.min(1,data[c][i]));
    v.setInt16(44+(i*channels+c)*2,Math.round(s*(s<0 ? 32768 : 32767)),true);
  }
  return result;
}
