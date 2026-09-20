/* Jackpot — audio. All sound is synthesised live with WebAudio; there are no audio files.
   iOS requires the AudioContext to be created/resumed inside a user gesture, so
   JP_AUDIO.unlock() is called from the first pointerdown anywhere on the page.
   Every public method is a no-op if audio is unavailable or the user turned it off. */
(function (root) {
  'use strict';

  let ctx = null, master = null, sfxBus = null, musicBus = null;
  let sfxOn = true, musicOn = true;
  let unlocked = false;

  function ensure() {
    if (ctx) return true;
    const AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return false;
    try {
      ctx = new AC();
      master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination);
      sfxBus = ctx.createGain(); sfxBus.gain.value = 1; sfxBus.connect(master);
      musicBus = ctx.createGain(); musicBus.gain.value = 0.16; musicBus.connect(master);
      return true;
    } catch (e) { ctx = null; return false; }
  }

  function unlock() {
    if (!ensure()) return;
    if (ctx.state === 'suspended') ctx.resume().catch(function () {});
    if (!unlocked) {
      unlocked = true;
      // iOS: play a silent buffer inside the gesture to fully unlock.
      try {
        const b = ctx.createBuffer(1, 1, 22050); const s = ctx.createBufferSource(); s.buffer = b; s.connect(master); s.start(0);
      } catch (e) {}
      if (musicOn) startMusic();
    }
  }

  function now() { return ctx ? ctx.currentTime : 0; }
  function ok() { return sfxOn && ctx && ctx.state === 'running'; }

  // ---- primitive voices -----------------------------------------------------------
  function tone(o) {
    // o: {f, f2, t, dur, type, g, a, bus}
    if (!ctx) return;
    const t0 = o.t != null ? o.t : now();
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.f, t0);
    if (o.f2) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.f2), t0 + o.dur);
    const a = o.a || 0.005;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(o.g || 0.2, t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
    osc.connect(g); g.connect(o.bus || sfxBus);
    osc.start(t0); osc.stop(t0 + o.dur + 0.02);
  }

  let noiseBuf = null;
  function noise(o) {
    // o: {t, dur, g, type:'bandpass'|'lowpass', f, q, f2}
    if (!ctx) return;
    if (!noiseBuf) {
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 1.5, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const t0 = o.t != null ? o.t : now();
    const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    const flt = ctx.createBiquadFilter(); flt.type = o.type || 'bandpass';
    flt.frequency.setValueAtTime(o.f || 1500, t0);
    if (o.f2) flt.frequency.exponentialRampToValueAtTime(o.f2, t0 + o.dur);
    flt.Q.value = o.q || 0.8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(o.g || 0.3, t0 + (o.a || 0.004));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
    src.connect(flt); flt.connect(g); g.connect(o.bus || sfxBus);
    src.start(t0); src.stop(t0 + o.dur + 0.02);
  }

  // ---- sound effects --------------------------------------------------------------
  const SFX = {
    button() { if (!ok()) return; tone({ f: 900, f2: 600, dur: 0.05, type: 'square', g: 0.05 }); },
    spinStart() { if (!ok()) return; noise({ dur: 0.35, g: 0.12, f: 400, f2: 2400, q: 1.2 }); tone({ f: 220, f2: 440, dur: 0.25, type: 'triangle', g: 0.06 }); },
    reelTick() { if (!ok()) return; tone({ f: 1800, f2: 1200, dur: 0.02, type: 'square', g: 0.02 }); },
    reelStop(i) {
      if (!ok()) return;
      tone({ f: 140 - i * 8, f2: 55, dur: 0.12, type: 'sine', g: 0.35 });
      noise({ dur: 0.05, g: 0.12, f: 2500, q: 0.6 });
    },
    anticipation() {
      if (!ok()) return;
      const t = now();
      for (let i = 0; i < 8; i++) tone({ t: t + i * 0.11, f: 440 + i * 55, dur: 0.09, type: 'sawtooth', g: 0.05 });
    },
    scatterLand(n) {
      if (!ok()) return;
      const t = now(); const base = 660 + n * 110;
      [0, 4, 7, 12].forEach(function (st, i) { tone({ t: t + i * 0.05, f: base * Math.pow(2, st / 12), dur: 0.25, type: 'triangle', g: 0.12 }); });
    },
    winLine() {
      if (!ok()) return;
      const t = now();
      tone({ t: t, f: 880, dur: 0.18, type: 'triangle', g: 0.14 });
      tone({ t: t + 0.09, f: 1320, dur: 0.22, type: 'triangle', g: 0.12 });
    },
    countTick(p) {
      // p: 0..1 progress → pitch rises
      if (!ok()) return;
      tone({ f: 1200 + p * 900, dur: 0.035, type: 'square', g: 0.045 });
    },
    coin() {
      if (!ok()) return;
      const f = 1900 + Math.random() * 700;
      tone({ f: f, dur: 0.16, type: 'triangle', g: 0.09 });
      tone({ f: f * 1.5, dur: 0.1, type: 'sine', g: 0.05 });
    },
    fanfare(level) {
      if (!ok()) return;
      const t = now();
      const seq = level >= 3 ? [0, 4, 7, 12, 16, 19, 24] : level === 2 ? [0, 4, 7, 12, 16] : [0, 4, 7, 12];
      seq.forEach(function (st, i) {
        const f = 523.25 * Math.pow(2, st / 12);
        tone({ t: t + i * 0.09, f: f, dur: 0.35, type: 'sawtooth', g: 0.09 });
        tone({ t: t + i * 0.09, f: f * 0.5, dur: 0.35, type: 'square', g: 0.04 });
      });
      const last = seq.length * 0.09;
      tone({ t: t + last, f: 1046.5, dur: 1.1, type: 'sawtooth', g: 0.1 });
      tone({ t: t + last, f: 1318.5, dur: 1.1, type: 'sawtooth', g: 0.08 });
      tone({ t: t + last, f: 1568, dur: 1.1, type: 'sawtooth', g: 0.08 });
    },
    gong() {
      if (!ok()) return;
      const t = now();
      noise({ t: t, dur: 0.08, g: 0.35, f: 900, q: 0.5 });
      [110, 165, 221, 331, 441].forEach(function (f, i) { tone({ t: t, f: f, dur: 2.6 - i * 0.3, type: 'sine', g: 0.22 / (i + 1), a: 0.01 }); });
    },
    drum(kind) {
      if (!ok()) return;
      if (kind === 'kick') { tone({ f: 160, f2: 40, dur: 0.22, type: 'sine', g: 0.5 }); noise({ dur: 0.03, g: 0.1, f: 3000 }); }
      else { tone({ f: 260, f2: 90, dur: 0.3, type: 'sine', g: 0.4 }); noise({ dur: 0.05, g: 0.12, f: 1800 }); }
    },
    cymbal() { if (!ok()) return; noise({ dur: 0.9, g: 0.16, f: 6000, type: 'highpass', q: 0.4 }); },
    firecracker() {
      if (!ok()) return;
      noise({ dur: 0.06, g: 0.4, f: 1800 + Math.random() * 1500, q: 0.7 });
      tone({ f: 2400, f2: 300, dur: 0.05, type: 'square', g: 0.06 });
    },
    fireworkLaunch() { if (!ok()) return; tone({ f: 500, f2: 1500, dur: 0.7, type: 'sine', g: 0.05 }); noise({ dur: 0.6, g: 0.05, f: 800, f2: 3000 }); },
    fireworkBurst() { if (!ok()) return; noise({ dur: 0.7, g: 0.35, f: 500, f2: 120, type: 'lowpass', q: 0.5 }); noise({ dur: 0.25, g: 0.15, f: 4000, q: 0.5 }); },
    fsIntro() {
      if (!ok()) return;
      const t = now(); const pent = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
      pent.forEach(function (st, i) { tone({ t: t + i * 0.07, f: 523.25 * Math.pow(2, st / 12), dur: 0.3, type: 'triangle', g: 0.12 }); });
    },
    refill() { if (!ok()) return; const t = now(); [0, 7, 12].forEach(function (st, i) { tone({ t: t + i * 0.08, f: 440 * Math.pow(2, st / 12), dur: 0.3, type: 'triangle', g: 0.12 }); }); },
    lose() { if (!ok()) return; tone({ f: 300, f2: 220, dur: 0.18, type: 'triangle', g: 0.05 }); },
  };

  // ---- music: cheerful pentatonic loop -------------------------------------------
  // C major pentatonic, 100 BPM, 32 sixteenth-note steps. Plucked lead + bass + soft hat.
  const LEAD = [ 0, null, 2, null, 4, null, 7, null, 9, null, 7, null, 4, null, 2, null,
                 4, null, 7, null, 9, null, 12, null, 9, null, 7, null, 4, null, 2, null ];
  const LEAD_B = [ 7, null, 9, null, 12, null, 9, null, 7, null, 4, null, 2, null, 0, null,
                   -3, null, 0, null, 2, null, 4, null, 7, null, 4, null, 2, null, 0, null ];
  const BASS = [ 0, null, null, null, 0, null, null, null, -5, null, null, null, -3, null, null, null,
                 0, null, null, null, 0, null, null, null, -5, null, null, null, -7, null, null, null ];
  let musicTimer = null, step = 0, nextTime = 0, bar = 0, tempoMult = 1;
  const BASE_STEP = 60 / 100 / 4;

  function pluck(f, t, dur, g) {
    const o = ctx.createOscillator(); const gn = ctx.createGain();
    o.type = 'triangle'; o.frequency.value = f;
    gn.gain.setValueAtTime(0.0001, t); gn.gain.exponentialRampToValueAtTime(g, t + 0.008); gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(gn); gn.connect(musicBus); o.start(t); o.stop(t + dur + 0.02);
  }

  function schedule() {
    if (!ctx || !musicOn) return;
    const stepDur = BASE_STEP / tempoMult;
    while (nextTime < ctx.currentTime + 0.25) {
      const lead = (bar % 2 === 0 ? LEAD : LEAD_B)[step];
      if (lead != null) pluck(523.25 * Math.pow(2, lead / 12), nextTime, stepDur * 3.2, 0.5);
      const b = BASS[step];
      if (b != null) pluck(130.81 * Math.pow(2, b / 12), nextTime, stepDur * 3.6, 0.7);
      if (step % 4 === 2) noise({ t: nextTime, dur: 0.03, g: 0.05, f: 8000, type: 'highpass', bus: musicBus });
      if (step % 8 === 0) tone({ t: nextTime, f: 120, f2: 50, dur: 0.12, type: 'sine', g: 0.35, bus: musicBus });
      nextTime += stepDur;
      step = (step + 1) % 32;
      if (step === 0) bar++;
    }
    musicTimer = setTimeout(schedule, 80);
  }

  function startMusic() {
    if (!ensure() || !musicOn || musicTimer) return;
    if (ctx.state !== 'running') return;
    nextTime = ctx.currentTime + 0.05; step = 0;
    schedule();
  }
  function stopMusic() { if (musicTimer) { clearTimeout(musicTimer); musicTimer = null; } }

  function setSfx(on) { sfxOn = !!on; }
  function setMusic(on) { musicOn = !!on; if (musicOn) { if (unlocked) startMusic(); } else stopMusic(); }
  function setTempo(m) { tempoMult = m || 1; }

  // Pause music when the page is hidden (saves battery, avoids ghost sound).
  if (root.document) {
    root.document.addEventListener('visibilitychange', function () {
      if (!ctx) return;
      if (root.document.hidden) { stopMusic(); }
      else if (musicOn && unlocked) { ctx.resume().then(startMusic).catch(function () {}); }
    });
  }

  root.JP_AUDIO = { unlock, sfx: SFX, setSfx, setMusic, setTempo, startMusic, stopMusic, isUnlocked: function () { return unlocked; } };
})(typeof window !== 'undefined' ? window : globalThis);
