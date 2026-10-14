import { SIZE } from '/shared/rules.js';
const PAL = ['#ffffff', '#2b2a33', '#e74c3c', '#f39c12', '#27ae60', '#3d5af1', '#9b59b6'];
const app = document.getElementById('app');
const S = { ws: null, room: null, side: 0, grid: null, color: 1, reveal: null, log: null, err: '', closed: null, pending: [], waking: false };
const h = (html) => { app.innerHTML = html; };
const $ = (s) => app.querySelector(s);

function connect(first) {
  const ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host);
  S.ws = ws;
  const wake = setTimeout(() => { S.waking = true; render(); }, 2000);
  ws.onopen = () => { clearTimeout(wake); S.waking = false; ws.send(JSON.stringify(first)); };
  ws.onmessage = (e) => onMsg(JSON.parse(e.data));
  ws.onclose = () => {
    clearTimeout(wake);
    const sess = JSON.parse(sessionStorage.getItem('pw') || 'null');
    if (S.room && !S.closed && sess) { S.reconnecting = true; render(); setTimeout(() => connect({ t: 'join', code: sess.code, token: sess.token }), 1500); }
  };
}
const send = (m) => S.ws && S.ws.readyState === 1 && S.ws.send(JSON.stringify(m));

function onMsg(m) {
  if (m.t === 'session') { sessionStorage.setItem('pw', JSON.stringify({ code: m.code, token: m.token })); S.side = m.side; S.reconnecting = false; render(); }
  else if (m.t === 'room') { const prev = S.room?.phase; S.room = m; S.skew = m.now - Date.now(); if (m.phase === 'drawing' && prev !== 'drawing') { S.reveal = null; S.log = null; } render(); }
  else if (m.t === 'own_grid') { S.grid = m.grid; render(); }
  else if (m.t === 'reveal') { S.reveal = m; render(); }
  else if (m.t === 'battle_log') { S.log = m; render(); }
  else if (m.t === 'error') { S.err = m.message; if (m.code !== 'too_little_ink') { sessionStorage.removeItem('pw'); S.room = null; } render(); }
  else if (m.t === 'closed') { S.closed = m.reason; sessionStorage.removeItem('pw'); if (!(S.closed === 'partner_left' && S.room?.phase === 'battle' && playing && S.log && playing.i < S.log.events.length)) render(); }
}

function drawGrid(cv, grid, opts = {}) {
  const c = cv.getContext('2d'), n = cv.width / SIZE;
  c.fillStyle = '#fff'; c.fillRect(0, 0, cv.width, cv.height);
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    const hidden = opts.hideSide !== undefined && (x < 16 ? 0 : 1) === opts.hideSide;
    if (hidden) { c.fillStyle = (x + y) % 2 ? '#e8e2d6' : '#ded7c9'; c.fillRect(x * n, y * n, n, n); continue; }
    if (grid[y][x]) { c.fillStyle = PAL[grid[y][x]]; c.fillRect(x * n, y * n, n, n); }
  }
  if (opts.lines) { c.strokeStyle = '#0001'; for (let i = 0; i <= SIZE; i++) { c.beginPath(); c.moveTo(i * n, 0); c.lineTo(i * n, cv.height); c.moveTo(0, i * n); c.lineTo(cv.width, i * n); c.stroke(); }
    c.strokeStyle = '#3d5af1'; c.lineWidth = 2; c.beginPath(); c.moveTo(cv.width / 2, 0); c.lineTo(cv.width / 2, cv.height); c.stroke(); c.lineWidth = 1; }
}

function stockArt(name) { // simple fixed pixel art per stock creature
  const g = Array.from({ length: SIZE }, () => new Array(SIZE).fill(0));
  const set = (x, y, c) => { if (x >= 0 && x < SIZE && y >= 0 && y < SIZE) g[y][x] = c; };
  if (name === 'Rok') { for (let y = 10; y < 28; y++) for (let x = 6; x < 26; x++) if ((x - 16) ** 2 / 100 + (y - 19) ** 2 / 81 < 1) set(x, y, 1); set(12, 16, 3); set(20, 16, 3); }
  else if (name === 'Zipp') { for (let x = 4; x < 28; x++) set(x, 16 + Math.round(Math.sin(x / 2) * 2), 4); for (let y = 6; y < 26; y++) set(16, y, 4); set(16, 5, 2); set(15, 5, 2); }
  else { for (let y = 8; y < 26; y++) for (let x = 8; x < 24; x++) if ((x - 16) ** 2 + (y - 17) ** 2 < 64) set(x, y, (x + y) % 3 ? 4 : 5); set(13, 14, 1); set(19, 14, 1); }
  return g;
}

let timerInt = null, playing = null;
function render() {
  clearInterval(timerInt);
  if (S.closed === 'partner_left' && S.reveal) {
    if (S.room?.phase === 'battle' && playing && S.log && playing.i < S.log.events.length) return;
    h(`<div class="banner"><b>Your partner left.</b><br><span class="small">Your creature still counts. Start a new room to play again.</span></div>
      <h2>~ ${S.reveal.name} ~</h2><canvas id="cv" width="256" height="256"></canvas><br>
      <button id="new">New room</button><button id="home" class="alt">Home</button><button id="rep" class="alt">Report/Hide</button>`);
    drawGrid($('#cv'), S.reveal.grid);
    $('#new').onclick = () => { S.closed = null; S.room = null; S.reveal = null; S.log = null; connect({ t: 'create' }); };
    $('#home').onclick = () => { location.href = '/'; };
    $('#rep').onclick = () => { if (confirm('Hide this creature?')) { S.reveal = null; render(); } };
    return;
  }
  if (S.closed) {
    const msg = { hidden: 'This creature was hidden and the room was closed.', partner_left: 'Your friend left the room.', expired: 'This room expired, start a new one.' }[S.closed] || 'Room closed.';
    return h(`<h1>PATCHWORK</h1><p>${msg}</p><button id="home">New room</button>`), $('#home').onclick = () => location.reload();
  }
  if (S.waking && !S.room) return h(`<h1>PATCHWORK</h1><p><span class="spin"></span> Waking up the server…</p>`);
  if (S.reconnecting) return h(`<h1>PATCHWORK</h1><p><span class="spin"></span> Reconnecting…</p>`);
  const r = S.room;
  if (!r) {
    h(`<h1>PATCHWORK</h1><p>Draw half a creature each. See what you made together.</p>
      <button id="create">Create room</button><p class="small">or</p>
      <input id="code" maxlength="6" placeholder="CODE"> <button id="join" class="alt">Join</button><p class="err">${S.err}</p>`);
    $('#create').onclick = () => { S.err = ''; connect({ t: 'create' }); };
    const join = () => { S.err = ''; connect({ t: 'join', code: $('#code').value }); };
    $('#join').onclick = join; $('#code').onkeydown = (e) => e.key === 'Enter' && join();
    const q = new URLSearchParams(location.search).get('room'); if (q) $('#code').value = q;
    return;
  }
  const me = r.players.find(p => p.side === r.you), them = r.players.find(p => p.side !== r.you);
  const partnerLine = !them ? '' : them.connected ? '' : '<p class="small"><span class="spin"></span> Friend reconnecting…</p>';
  if (r.phase === 'lobby') {
    const link = `${location.origin}/?room=${r.code}`;
    h(`<h2>Room code</h2><div class="code">${r.code}</div><button id="copy" class="alt">Copy invite link</button>
      <p>You ✔ &nbsp; Friend <span class="spin"></span></p><p class="small">Waiting for your friend to join…</p>`);
    $('#copy').onclick = () => { navigator.clipboard?.writeText(link); $('#copy').textContent = 'Copied!'; };
    return;
  }
  if (r.phase === 'drawing' && !me.done) {
    h(`<div class="timer" id="t"></div><p class="small">You draw the ${r.you === 0 ? 'LEFT' : 'RIGHT'} half. Your friend's half stays hidden.</p>
      <canvas id="cv" width="512" height="512"></canvas>
      <div class="palette">${PAL.map((c, i) => `<div class="sw ${i === S.color ? 'on' : ''}" data-c="${i}" style="background:${i ? c : '#fff'};${i ? '' : 'border-style:dashed;border-color:#999'}" title="${i ? '' : 'eraser'}"></div>`).join('')}</div>
      <button id="clear" class="alt">Clear</button><button id="done">Done</button><p class="err">${S.err}</p>${partnerLine}`);
    const cv = $('#cv'); const grid = S.grid || Array.from({ length: SIZE }, () => new Array(SIZE).fill(0)); S.grid = grid;
    drawGrid(cv, grid, { hideSide: 1 - r.you, lines: true });
    let down = false;
    const at = (e) => { const b = cv.getBoundingClientRect(); return [Math.floor((e.clientX - b.left) / b.width * SIZE), Math.floor((e.clientY - b.top) / b.height * SIZE)]; };
    const paint = (e) => { const [x, y] = at(e); const x0 = r.you * 16; if (x < x0 || x >= x0 + 16 || y < 0 || y >= SIZE) return;
      if (grid[y][x] !== S.color) { grid[y][x] = S.color; S.pending.push([x, y, S.color]); drawGrid(cv, grid, { hideSide: 1 - r.you, lines: true }); } };
    cv.onpointerdown = (e) => { down = true; cv.setPointerCapture(e.pointerId); paint(e); };
    cv.onpointermove = (e) => down && paint(e); cv.onpointerup = () => { down = false; };
    app.querySelectorAll('.sw').forEach(el => el.onclick = () => { S.color = +el.dataset.c; app.querySelectorAll('.sw').forEach(x => x.classList.toggle('on', x === el)); });
    $('#clear').onclick = () => { for (let y = 0; y < SIZE; y++) for (let x = r.you * 16; x < r.you * 16 + 16; x++) if (grid[y][x]) { grid[y][x] = 0; S.pending.push([x, y, 0]); } drawGrid(cv, grid, { hideSide: 1 - r.you, lines: true }); };
    $('#done').onclick = () => { flush(); S.err = ''; send({ t: 'done' }); };
    tick(); timerInt = setInterval(tick, 250);
    return;
  }
  if (r.phase === 'drawing') { h(`<h2>Nice!</h2><p><span class="spin"></span> ${them?.done ? 'Merging…' : 'Partner still drawing…'}</p><div class="timer" id="t"></div>${partnerLine}`); tick(); timerInt = setInterval(tick, 250); return; }
  if (r.phase === 'reveal' && S.reveal) {
    const st = S.reveal.stats;
    h(`<h2>~ ${S.reveal.name} ~</h2><canvas id="cv" width="384" height="384"></canvas>
      <div class="stats"><div>HP<br><b>${st.hp}</b></div><div>PWR<br><b>${st.power}</b></div><div>SPD<br><b>${st.speed}</b></div><div>RCH<br><b>${st.reach}</b></div><div>DEF<br><b>${st.defense}</b></div><div>vs<br><b>${S.reveal.foe.name}</b></div></div>
      <button id="go">Battle!</button> <button id="rep" class="alt">Report/Hide</button>${partnerLine}`);
    drawGrid($('#cv'), S.reveal.grid); $('#go').onclick = () => send({ t: 'battle' }); $('#rep').onclick = report; return;
  }
  if (r.phase === 'battle' && S.log && S.reveal) return playBattle();
  if (r.phase === 'result' && S.log) {
    const win = S.log.winner === 'you'; const again = me.again;
    h(`<h1>${win ? 'YOU WIN!' : 'YOU LOSE!'}</h1><p>${S.reveal.name} ${win ? 'beat' : 'lost to'} ${S.reveal.foe.name}${S.log.reason === 'rounds' ? ' on points' : ''}.</p>
      <canvas id="cv" width="256" height="256"></canvas><br>
      <button id="again" ${again ? 'disabled' : ''}>${again ? 'Waiting for friend…' : 'Play again'}</button><button id="leave" class="alt">Leave</button><button id="rep" class="alt">Report/Hide</button>${partnerLine}`);
    drawGrid($('#cv'), S.reveal.grid);
    $('#again').onclick = () => send({ t: 'play_again' }); $('#leave').onclick = () => { sessionStorage.removeItem('pw'); location.href = '/'; }; $('#rep').onclick = report; return;
  }
  h(`<p><span class="spin"></span></p>`);
}
function report() { if (confirm('Hide this creature for both players and close the room?')) send({ t: 'report_hide' }); }
function flush() { if (S.pending.length) { send({ t: 'paint', cells: S.pending }); S.pending = []; } }
setInterval(flush, 50);
function tick() { const t = $('#t'); if (!t || !S.room?.deadline) return; const left = Math.max(0, Math.ceil((S.room.deadline - (Date.now() + (S.skew || 0))) / 1000)); t.textContent = `0:${String(left).padStart(2, '0')}`; }

function playBattle(solo) {
  const rv = S.reveal, log = S.log, key = rv.seed + ':' + S.room.code;
  h(`<div class="vs"><div style="flex:1"><b>${rv.name}</b><div class="bar"><i id="hy" style="width:100%"></i></div><canvas id="a" width="192" height="192"></canvas></div>
     <b>vs</b><div style="flex:1"><b>${rv.foe.name}</b><div class="bar"><i id="hf" style="width:100%"></i></div><canvas id="b" width="192" height="192"></canvas></div></div>
     <div class="log" id="log">Fight!</div><button id="skip" class="alt">Skip</button>`);
  drawGrid($('#a'), rv.grid); drawGrid($('#b'), stockArt(rv.foe.name));
  if (playing && playing.key === key) { /* re-render mid-battle: resume */ } else playing = { key, i: 0 };
  const step = () => {
    if (!$('#log')) return;
    const e = log.events[playing.i];
    if (!e) { if (S.closed) { playing.i = Infinity; return render(); } send({ t: 'battle_over' }); return; }
    const who = e.attacker === 'you' ? rv.name : rv.foe.name;
    $('#log').textContent = `${who} hits for ${e.dmg}!${e.double ? ' Double strike!' : ''}`;
    $('#hy').style.width = (e.hp.you / rv.stats.hp * 100) + '%'; $('#hf').style.width = (e.hp.foe / rv.foe.hp * 100) + '%';
    playing.i++; playing.t = setTimeout(step, 700);
  };
  clearTimeout(playing.t); step();
  $('#skip').onclick = () => { clearTimeout(playing.t); if (S.closed) { playing.i = Infinity; return render(); } send({ t: 'battle_over' }); };
}

const sess = JSON.parse(sessionStorage.getItem('pw') || 'null');
if (sess) { S.room = { phase: 'joining', players: [] }; S.reconnecting = true; render(); connect({ t: 'join', code: sess.code, token: sess.token }); } else render();
