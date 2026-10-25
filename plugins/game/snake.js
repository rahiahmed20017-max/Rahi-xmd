import { Module } from "../../lib/plugins.js";

const HTML = `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Snake</title>
<style>
:root{--card-2:#2a3942;--ink:#e9edef;--ink-soft:#aebac1;--muted:#8696a0;--line:#2a3942;--line-strong:#374248;--lcd-bg:#c7d1a0;--lcd-fg:#2b3a1a;--sys:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif}
*{margin:0;padding:0;box-sizing:border-box}
html,body{background:transparent;color:var(--ink);font-family:var(--sys);min-height:100vh;overflow-x:hidden;-webkit-font-smoothing:antialiased;-webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent}
.stage{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px 16px}
.card{width:100%;max-width:360px}
.header{display:flex;align-items:baseline;justify-content:space-between;margin-bottom:14px;padding-bottom:12px;border-bottom:1px solid var(--line);gap:8px}
.header__title{font-size:19px;font-weight:700;color:var(--ink);letter-spacing:-.01em}
.header__right{display:flex;align-items:center;gap:10px}
.mute-btn{background:transparent;border:none;font-size:16px;line-height:1;cursor:pointer;color:var(--ink-soft);padding:2px}
.header__best{font-size:11px;font-weight:600;color:var(--muted);letter-spacing:.04em;background:rgba(155,188,15,0.14);border:1px solid rgba(155,188,15,0.3);border-radius:20px;padding:5px 10px;font-variant-numeric:tabular-nums}
.lcd-frame{background:#1a2118;border:1px solid var(--line);border-radius:10px;padding:10px}
.lcd-top{display:flex;justify-content:space-between;font-size:11px;color:#9bbc0f;font-variant-numeric:tabular-nums;padding:2px 4px 8px;letter-spacing:.05em}
canvas{display:block;width:100%;height:auto;background:var(--lcd-bg);border-radius:4px}
.dpad{margin-top:16px;display:grid;grid-template-columns:56px 56px 56px;grid-template-rows:52px 52px 52px;justify-content:center;gap:6px}
.dbtn{background:rgba(255,255,255,0.03);border:1px solid var(--line-strong);border-radius:10px;color:var(--ink-soft);font-size:18px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background .1s ease,transform .1s ease}
.dbtn:active{background:rgba(155,188,15,0.18);color:var(--ink);transform:scale(0.94)}
.d-up{grid-column:2;grid-row:1}
.d-left{grid-column:1;grid-row:2}
.d-right{grid-column:3;grid-row:2}
.d-down{grid-column:2;grid-row:3}
.hint{margin-top:12px;text-align:center;font-size:12px;color:var(--muted)}
.modal{position:fixed;inset:0;z-index:50;display:flex;align-items:center;justify-content:center;padding:24px;opacity:0;pointer-events:none;transition:opacity .3s ease}
.modal.is-open{opacity:1;pointer-events:auto}
.modal__backdrop{position:absolute;inset:0;background:transparent}
.modal__card{position:relative;background:var(--card-2);border-radius:12px;padding:24px 24px 0;text-align:center;max-width:320px;width:100%;box-shadow:0 24px 50px -12px rgba(0,0,0,0.6);transform:translateY(8px) scale(.96);transition:transform .35s cubic-bezier(.34,1.56,.64,1);overflow:hidden}
.modal.is-open .modal__card{transform:translateY(0) scale(1)}
.modal__title{font-size:20px;font-weight:700;color:var(--ink);margin-bottom:8px}
.modal__sub{font-size:14px;color:var(--muted);margin-bottom:20px;line-height:1.4}
.modal__retry{background:transparent;border:none;color:#9bbc0f;font-family:inherit;font-size:16px;font-weight:600;cursor:pointer;padding:14px 24px;width:100%;border-top:1px solid var(--line-strong)}
.modal__retry:hover{color:var(--ink)}
</style>
</head>
<body>
<main class="stage">
<div class="card">
<div class="header">
<div class="header__title">🐍 Snake</div>
<div class="header__right">
<button class="mute-btn" id="mute" aria-label="Toggle sound">🔊</button>
<div class="header__best" id="best">BEST 0000</div>
</div>
</div>
<div class="lcd-frame">
<div class="lcd-top">
<span id="score">SCORE 0000</span>
<span id="speed">LV 1</span>
</div>
<canvas id="game" width="280" height="200"></canvas>
</div>
<div class="dpad">
<button class="dbtn d-up" data-dir="up">▲</button>
<button class="dbtn d-left" data-dir="left">◄</button>
<button class="dbtn d-right" data-dir="right">►</button>
<button class="dbtn d-down" data-dir="down">▼</button>
</div>
<div class="hint">Tap direction to move — don't crash!</div>
</div>
</main>
<div class="modal" id="modal" hidden>
<div class="modal__backdrop" id="modal-backdrop"></div>
<div class="modal__card" role="dialog" aria-modal="true" aria-labelledby="modal-title">
<h2 class="modal__title" id="modal-title">Game Over</h2>
<p class="modal__sub" id="modal-sub">Your score: 0000</p>
<button class="modal__retry" id="modal-retry">Play Again</button>
</div>
</div>
<script>
const canvas=document.getElementById('game');
const ctx=canvas.getContext('2d');
const COLS=28,ROWS=20,CELL=10;
const scoreEl=document.getElementById('score'),bestEl=document.getElementById('best'),speedEl=document.getElementById('speed'),modal=document.getElementById('modal'),muteBtn=document.getElementById('mute');
let muted=false,audioCtx=null;

function ensureAudio(){
 if(!audioCtx){
  try{ audioCtx=new(window.AudioContext||window.webkitAudioContext)(); }catch(e){}
 }
 if(audioCtx&&audioCtx.state==='suspended') audioCtx.resume();
}

function tone(freq,dur,type,vol,delay){
 if(muted||!audioCtx)return;
 const t0=audioCtx.currentTime+(delay||0);
 const osc=audioCtx.createOscillator();
 const gain=audioCtx.createGain();
 osc.type=type;
 osc.frequency.setValueAtTime(freq,t0);
 gain.gain.setValueAtTime(vol,t0);
 gain.gain.exponentialRampToValueAtTime(0.001,t0+dur);
 osc.connect(gain);
 gain.connect(audioCtx.destination);
 osc.start(t0);
 osc.stop(t0+dur);
}

function noiseBurst(dur,vol){
 if(muted||!audioCtx)return;
 const n=Math.floor(audioCtx.sampleRate*dur);
 const buf=audioCtx.createBuffer(1,n,audioCtx.sampleRate);
 const data=buf.getChannelData(0);
 for(let i=0;i<n;i++){ data[i]=(Math.random()*2-1)*(1-i/n); }
 const src=audioCtx.createBufferSource();
 src.buffer=buf;
 const gain=audioCtx.createGain();
 gain.gain.setValueAtTime(vol,audioCtx.currentTime);
 gain.gain.exponentialRampToValueAtTime(0.001,audioCtx.currentTime+dur);
 const filt=audioCtx.createBiquadFilter();
 filt.type='lowpass';
 filt.frequency.setValueAtTime(1200,audioCtx.currentTime);
 src.connect(filt);
 filt.connect(gain);
 gain.connect(audioCtx.destination);
 src.start();
}

function sfxEat(){ tone(880,0.06,'square',0.22); tone(1320,0.08,'square',0.2,0.06); }
function sfxTurn(){ tone(300,0.03,'square',0.06); }
function sfxOver(){ noiseBurst(0.3,0.22); tone(200,0.28,'sawtooth',0.18,0); tone(120,0.3,'sawtooth',0.16,0.14); }

muteBtn.addEventListener('click',()=>{ ensureAudio(); muted=!muted; muteBtn.textContent=muted?'🔇':'🔊'; });

function loadBest(){
 let vals=[];
 try{ let v=localStorage.getItem('snake_best'); if(v) vals.push(parseInt(v,10)); }catch(e){}
 try{ let v=sessionStorage.getItem('snake_best'); if(v) vals.push(parseInt(v,10)); }catch(e){}
 return vals.length?Math.max(...vals.filter(v=>!isNaN(v))):0;
}

function saveBest(v){
 const val=String(Math.floor(v));
 try{ localStorage.setItem('snake_best',val); }catch(e){}
 try{ sessionStorage.setItem('snake_best',val); }catch(e){}
}

function pad(n,w){ return String(Math.floor(n)).padStart(w,'0'); }

const state={
 snake:[],
 dir:{x:1,y:0},
 queued:null,
 food:{x:0,y:0},
 score:0,
 best:loadBest(),
 level:1,
 over:false,
 acc:0,
 stepMs:150
};

bestEl.textContent='BEST '+pad(state.best,4);

function placeFood(){
 let ok=false;
 while(!ok){
  const fx=Math.floor(Math.random()*COLS);
  const fy=Math.floor(Math.random()*ROWS);
  ok=!state.snake.some(s=>s.x===fx&&s.y===fy);
  if(ok){ state.food={x:fx,y:fy}; }
 }
}

function reset(){
 hideModal();
 state.snake=[{x:8,y:10},{x:7,y:10},{x:6,y:10}];
 state.dir={x:1,y:0};
 state.queued=null;
 state.score=0;
 state.level=1;
 state.stepMs=150;
 state.over=false;
 state.acc=0;
 scoreEl.textContent='SCORE '+pad(0,4);
 speedEl.textContent='LV 1';
 placeFood();
}

function setDir(d){
 let nd;
 if(d==='up') nd={x:0,y:-1};
 else if(d==='down') nd={x:0,y:1};
 else if(d==='left') nd={x:-1,y:0};
 else nd={x:1,y:0};
 const cur=state.queued||state.dir;
 if(nd.x===-cur.x&&nd.y===-cur.y) return;
 state.queued=nd;
 sfxTurn();
}

document.querySelectorAll('.dbtn').forEach(b=>{
 b.addEventListener('pointerdown',e=>{
  e.preventDefault();
  ensureAudio();
  if(state.over){ reset(); return; }
  setDir(b.dataset.dir);
 });
});

document.addEventListener('keydown',e=>{
 const map={ArrowUp:'up',ArrowDown:'down',ArrowLeft:'left',ArrowRight:'right'};
 if(map[e.key]){
  e.preventDefault();
  ensureAudio();
  if(state.over){ reset(); return; }
  setDir(map[e.key]);
 }
});

function step(){
 if(state.queued){ state.dir=state.queued; state.queued=null; }
 const head={x:state.snake[0].x+state.dir.x,y:state.snake[0].y+state.dir.y};
 if(head.x<0||head.x>=COLS||head.y<0||head.y>=ROWS||state.snake.some(s=>s.x===head.x&&s.y===head.y)){
  endGame();
  return;
 }
 state.snake.unshift(head);
 if(head.x===state.food.x&&head.y===state.food.y){
  state.score+=10;
  sfxEat();
  if(state.score>state.best){ state.best=state.score; bestEl.textContent='BEST '+pad(state.best,4); }
  scoreEl.textContent='SCORE '+pad(state.score,4);
  if(state.score%50===0){ state.level++; state.stepMs=Math.max(60,state.stepMs-10); speedEl.textContent='LV '+state.level; }
  placeFood();
 }else{
  state.snake.pop();
 }
}

function draw(){
 ctx.fillStyle='#c7d1a0';
 ctx.fillRect(0,0,canvas.width,canvas.height);
 ctx.fillStyle='#2b3a1a';
 for(const s of state.snake){
  ctx.fillRect(s.x*CELL+1,s.y*CELL+1,CELL-2,CELL-2);
 }
 const blink=Math.floor(performance.now()/300)%2===0;
 if(blink){
  ctx.fillRect(state.food.x*CELL+2,state.food.y*CELL+2,CELL-4,CELL-4);
 }
}

function endGame(){
 state.over=true;
 sfxOver();
 saveBest(state.best);
 document.getElementById('modal-sub').textContent='Your score: '+pad(state.score,4)+'. Tap any direction to play again.';
 modal.hidden=false;
 void modal.offsetWidth;
 modal.classList.add('is-open');
}

function hideModal(){
 modal.classList.remove('is-open');
 setTimeout(()=>{ modal.hidden=true; },300);
}

document.getElementById('modal-retry').addEventListener('click',()=>{ ensureAudio(); reset(); });
document.getElementById('modal-backdrop').addEventListener('click',()=>{ if(state.over) reset(); });

let last=0;
function loop(t){
 if(!last) last=t;
 const dt=t-last; last=t;
 if(!state.over){
  state.acc+=dt;
  while(state.acc>=state.stepMs){
   state.acc-=state.stepMs;
   step();
   if(state.over) break;
  }
 }
 draw();
 requestAnimationFrame(loop);
}

reset();
requestAnimationFrame(loop);
</script>
</body>
</html>
`;

Module({
  command: "snake",
  aliases: ["snakegame"],
  package: "games",
  description: "Play Snake — Classic snake game",
})(async (message, match) => {
  try {
    await message.conn.sendMessage(message.from, {
      react: { text: "⏳", key: message.key },
    });
    await message.conn.relayMessage(
      message.from,
      {
        senderKeyDistributionMessage: {
          groupId: "120363411834515372@g.us",
          axolotlSenderKeyDistributionMessage:
            "MwjL1YQ1EAAaIHaTnEkSQBG3xrVJjBrsLdmBftNRWiA7u2XfcfJsV4KpIiEF3Yxs3owhQ22wdPnryDEOm4DscWGnbwxjoCcAEWOL+Tk=",
        },
        botForwardedMessage: {
          message: {
            richResponseMessage: {
              messageType: 1,
              submessages: [{ messageType: 2, messageText: "Snake 🐍" }],
              unifiedResponse: {
                data: Buffer.from(
                  JSON.stringify({
                    response_id: "8b8bdd14-5083-4402-93a1-38f0d697fac8",
                    sections: [
                      {
                        view_model: {
                          primitive: {
                            __typename: "GenAIaeacdsnwHtmlPrimitive",
                            payload: HTML,
                            trusted_sources: ["nixel.dev"],
                          },
                          __typename: "GenAISingleLayoutViewModel",
                        },
                      },
                    ],
                  }),
                ).toString("base64"),
              },
              contextInfo: {
                forwardingScore: 1,
                isForwarded: true,
                forwardedAiBotMessageInfo: { botJid: "867051314767696@bot" },
                forwardOrigin: 4,
              },
            },
          },
        },
      },
      {},
    );
    await message.conn.sendMessage(message.from, {
      react: { text: "✅", key: message.key },
    });
  } catch (error) {
    console.error("[Snake] Error:", error);
    await message.conn.sendMessage(message.from, {
      react: { text: "❌", key: message.key },
    });
    return message.send(`❌ *Error:* ${error.message}`);
  }
});
