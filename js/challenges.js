/* Jackpot — double-or-nothing challenge screens (UI only; the outcomes come from js/engine.js
   resolveChallenge(), which is fair by construction). Each challenge has:
     text(kind)                         → { title, zh, instruction }
     setup(kind, stage, choicesEl, cb)  → draws the stage and big choice buttons; cb(choice) on tap
     reveal(kind, stage, outcome, done) → animates the result, then done()
   Everything is DOM/CSS; no images. Loaded as window.JP_CHALLENGE. */
(function (root) {
  'use strict';
  const doc = root.document;
  const el = function (tag, cls, html) { const e = doc.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const btn = function (label, sub, cls) { const b = el('button', 'btn gch ' + (cls || ''), '<b>' + label + '</b>' + (sub ? '<span>' + sub + '</span>' : '')); return b; };
  const wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

  const TEXT = {
    coin:    { title: 'COIN TOSS',        zh: '招财硬币', instruction: 'Heads or Tails? Tap one. Right guess = DOUBLE.' },
    dice:    { title: 'BIG OR SMALL',     zh: '猜大小',       instruction: 'One die. BIG is 4–6, SMALL is 1–3. Tap one. Right guess = DOUBLE.' },
    cards:   { title: 'BEAT THE HOUSE',   zh: '比大小',       instruction: 'Tap DRAW. If your card is higher than the House card, you DOUBLE.' },
    cups:    { title: 'GOLDEN CUP',       zh: '猜杯',             instruction: 'The gold is under one cup. Tap LEFT or RIGHT. Find it = DOUBLE.' },
    light:   { title: 'STOP THE LIGHT',   zh: '停灯',             instruction: 'The light runs round. Tap STOP. Land on GOLD = DOUBLE.' },
    rps:     { title: 'ROCK PAPER SCISSORS', zh: '剪刀石头布', instruction: 'Pick one. Beat the machine = DOUBLE. A tie plays again.' },
    packets: { title: 'LUCKY PACKET',     zh: '选红包',       instruction: 'One of three red packets holds TRIPLE. Tap one. Find it = TRIPLE.' },
  };
  function text(kind) { return TEXT[kind] || { title: 'DOUBLE OR NOTHING', zh: '', instruction: '' }; }

  // ---- coin ---------------------------------------------------------------------------
  function coinFace(side) { return side === 'heads' ? '福' : '7'; }
  const S = {};
  S.coin = {
    setup: function (stage, choices, cb) {
      stage.innerHTML = ''; const c = el('div', 'gcoin', '<div class="face">?</div>'); stage.appendChild(c);
      const h = btn('HEADS', '福', 'gold'), t = btn('TAILS', '7', 'dark');
      h.onclick = function () { cb('heads'); }; t.onclick = function () { cb('tails'); };
      choices.appendChild(h); choices.appendChild(t);
    },
    reveal: function (stage, out, done) {
      const c = stage.querySelector('.gcoin'); const f = c.querySelector('.face');
      c.classList.add('flip'); f.textContent = '';
      wait(1300).then(function () { c.classList.remove('flip'); c.classList.add(out.detail.result); f.textContent = coinFace(out.detail.result); done(); });
    },
  };

  // ---- dice ---------------------------------------------------------------------------
  const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
  function dieHtml(v) { let h = ''; for (let i = 0; i < 9; i++) h += '<i class="' + (v && PIPS[v].indexOf(i) >= 0 ? 'on' : '') + '"></i>'; return h; }
  S.dice = {
    setup: function (stage, choices, cb) {
      stage.innerHTML = ''; stage.appendChild(el('div', 'gdie', dieHtml(0)));
      const b = btn('BIG', '4 · 5 · 6', 'gold'), s = btn('SMALL', '1 · 2 · 3', 'dark');
      b.onclick = function () { cb('big'); }; s.onclick = function () { cb('small'); };
      choices.appendChild(b); choices.appendChild(s);
    },
    reveal: function (stage, out, done) {
      const d = stage.querySelector('.gdie'); d.classList.add('shake');
      let n = 0; const iv = setInterval(function () { d.innerHTML = dieHtml(1 + Math.floor(Math.random() * 6)); if (++n > 9) { clearInterval(iv); d.classList.remove('shake'); d.innerHTML = dieHtml(out.detail.value); d.classList.add(out.detail.value >= 4 ? 'big' : 'small'); const tag = el('div', 'gtag', out.detail.value >= 4 ? 'BIG' : 'SMALL'); stage.appendChild(tag); done(); } }, 110);
    },
  };

  // ---- cards --------------------------------------------------------------------------
  function rank(n) { return n === 1 ? 'A' : n === 11 ? 'J' : n === 12 ? 'Q' : n === 13 ? 'K' : String(n); }
  S.cards = {
    setup: function (stage, choices, cb) {
      stage.innerHTML = '';
      const row = el('div', 'gcards');
      row.appendChild(el('div', 'gcardWrap', '<span>YOU</span><div class="gcard back" id="gcYou">?</div>'));
      row.appendChild(el('div', 'gcardWrap', '<span>HOUSE</span><div class="gcard back" id="gcHouse">?</div>'));
      stage.appendChild(row);
      const d = btn('DRAW', 'higher card wins', 'gold'); d.onclick = function () { cb('draw'); }; choices.appendChild(d);
    },
    reveal: function (stage, out, done) {
      const you = stage.querySelector('#gcYou'), house = stage.querySelector('#gcHouse');
      you.classList.add('flip'); house.classList.add('flip');
      wait(500).then(function () {
        you.classList.remove('back', 'flip'); you.textContent = rank(out.detail.you); if (out.win) you.classList.add('winc');
        return wait(700);
      }).then(function () {
        house.classList.remove('back', 'flip'); house.textContent = rank(out.detail.house); if (!out.win) house.classList.add('winc');
        done();
      });
    },
  };

  // ---- cups ---------------------------------------------------------------------------
  S.cups = {
    setup: function (stage, choices, cb) {
      stage.innerHTML = '';
      const row = el('div', 'gcups');
      for (let i = 0; i < 2; i++) row.appendChild(el('div', 'gcupWrap', '<div class="gcup"></div><div class="gingot"> </div>'));
      stage.appendChild(row);
      // a little shuffle so it feels like a game (the outcome is decided fairly on the tap)
      let k = 0; const iv = setInterval(function () { row.classList.toggle('swap'); if (++k >= 5) { clearInterval(iv); row.classList.remove('swap'); } }, 260);
      const l = btn('LEFT', '左', 'gold'), r = btn('RIGHT', '右', 'gold');
      l.onclick = function () { clearInterval(iv); row.classList.remove('swap'); cb('left'); }; r.onclick = function () { clearInterval(iv); row.classList.remove('swap'); cb('right'); };
      choices.appendChild(l); choices.appendChild(r);
    },
    reveal: function (stage, out, done) {
      const wraps = stage.querySelectorAll('.gcupWrap');
      wraps.forEach(function (w, i) { w.querySelector('.gingot').textContent = i === out.detail.index ? '元宝' : ''; if (i === out.detail.index) w.querySelector('.gingot').classList.add('has'); });
      const chosen = out.chosenIndex != null ? out.chosenIndex : (out.win ? out.detail.index : 1 - out.detail.index);
      wraps[chosen].classList.add('lift');
      wait(900).then(function () { wraps[1 - chosen].classList.add('lift'); done(); });
    },
  };

  // ---- light --------------------------------------------------------------------------
  S.light = {
    setup: function (stage, choices, cb) {
      stage.innerHTML = '';
      const ring = el('div', 'gring');
      for (let i = 0; i < 8; i++) { const d = el('div', 'gdot ' + (i % 2 ? 'black' : 'gold')); d.style.transform = 'rotate(' + (i * 45) + 'deg) translateY(-72px)'; ring.appendChild(d); }
      ring.appendChild(el('div', 'gringLabel', 'GOLD<br>wins'));
      stage.appendChild(ring);
      const run = { i: 0, timer: 0 };
      const step = function () { ring.querySelectorAll('.gdot').forEach(function (d, j) { d.classList.toggle('lit', j === run.i); }); run.i = (run.i + 1) % 8; };
      run.timer = setInterval(step, 90); step();
      ring._run = run;
      const s = btn('STOP', 'tap when ready', 'red'); s.onclick = function () { cb('stop'); }; choices.appendChild(s);
    },
    reveal: function (stage, out, done) {
      const ring = stage.querySelector('.gring'); const run = ring._run; clearInterval(run.timer);
      const dots = ring.querySelectorAll('.gdot');
      // current lit index is run.i - 1; pick a target dot of the outcome colour 9..12 steps ahead
      const cur = (run.i + 7) % 8; const want = out.detail.result === 'gold' ? 0 : 1;
      let steps = 9; while (((cur + steps) % 8) % 2 !== want) steps++;
      let k = 0, delay = 90;
      const tick = function () {
        k++; const idx = (cur + k) % 8; dots.forEach(function (d, j) { d.classList.toggle('lit', j === idx); });
        if (k < steps) { delay = Math.round(delay * 1.18); setTimeout(tick, delay); }
        else { dots[idx].classList.add('final'); done(); }
      };
      setTimeout(tick, delay);
    },
  };

  // ---- rock paper scissors -------------------------------------------------------------
  const HAND = { rock: '✊', paper: '✋', scissors: '✌️' };
  S.rps = {
    setup: function (stage, choices, cb) {
      stage.innerHTML = '';
      const row = el('div', 'grps');
      row.appendChild(el('div', 'ghandWrap', '<span>YOU</span><div class="ghand" id="ghYou">?</div>'));
      row.appendChild(el('div', 'ghandWrap', '<span>MACHINE</span><div class="ghand" id="ghHouse">?</div>'));
      stage.appendChild(row);
      ['rock', 'paper', 'scissors'].forEach(function (c) { const b = btn(HAND[c], c.toUpperCase(), 'gold'); b.onclick = function () { cb(c); }; choices.appendChild(b); });
    },
    reveal: function (stage, out, done) {
      const you = stage.querySelector('#ghYou'), house = stage.querySelector('#ghHouse');
      you.textContent = HAND[out.choice]; house.textContent = '✊'; house.classList.add('shake');
      wait(1100).then(function () { house.classList.remove('shake'); house.textContent = HAND[out.detail.house]; if (out.tie) { house.classList.add('tie'); you.classList.add('tie'); } else if (out.win) you.classList.add('winc'); else house.classList.add('winc'); done(); });
    },
  };

  // ---- packets ------------------------------------------------------------------------
  S.packets = {
    setup: function (stage, choices, cb) {
      stage.innerHTML = '';
      const row = el('div', 'gpackets');
      for (let i = 0; i < 3; i++) { const p = el('button', 'packet gpacket', '<i>福</i>'); p.onclick = function () { row.querySelectorAll('.gpacket').forEach(function (q) { q.disabled = true; }); cb(String(i)); }; row.appendChild(p); }
      stage.appendChild(row);
      choices.appendChild(el('div', 'ghint', 'Tap a red packet above'));
    },
    reveal: function (stage, out, done) {
      const ps = stage.querySelectorAll('.gpacket'); const chosen = parseInt(out.choice, 10);
      ps[chosen].classList.add('open'); ps[chosen].innerHTML = chosen === out.detail.index ? '<b>×3</b><span>TRIPLE!</span>' : '<b>—</b><span>empty</span>';
      wait(900).then(function () { ps.forEach(function (p, i) { if (i !== chosen) { p.classList.add('missed'); p.innerHTML = i === out.detail.index ? '<b>×3</b><span>was here</span>' : '<b>—</b><span>empty</span>'; } }); done(); });
    },
  };

  function setup(kind, stage, choices, cb) { choices.innerHTML = ''; const g = S[kind]; if (g) g.setup(stage, choices, cb); }
  function reveal(kind, stage, outcome, done) { const g = S[kind]; if (g) g.reveal(stage, outcome, done); else done(); }

  root.JP_CHALLENGE = { text, setup, reveal, kinds: Object.keys(S) };
})(typeof window !== 'undefined' ? window : globalThis);
