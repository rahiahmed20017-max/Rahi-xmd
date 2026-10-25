import { Module } from "../../lib/plugins.js";

const HTML = `
<style>
*{margin:0;padding:0;box-sizing:border-box;user-select:none;-webkit-tap-highlight-color:transparent}
body{background:transparent;color:#fff;font-family:Arial,sans-serif}
.card{
 width:100%;max-width:500px;margin:auto;overflow:hidden;
 background:#09091b;border:3px solid #7c4dff;border-radius:22px;
 box-shadow:0 0 30px rgba(124,77,255,.45)
}
.head{
 padding:14px 17px;background:linear-gradient(135deg,#17133b,#32157a);
 display:flex;justify-content:space-between;align-items:center
}
.brand{font-size:10px;letter-spacing:3px;color:#bdaeff}
.title{font-size:21px;font-weight:bold}
.score{text-align:right;font-weight:bold;font-size:19px}
.best{font-size:9px;color:#aaa;margin-top:3px}
.info{
 display:flex;justify-content:space-around;padding:9px;
 background:#101027;font-size:12px;color:#bbb
}
.info b{color:#fff}
.stage{
 position:relative;height:390px;overflow:hidden;
 background:
 radial-gradient(circle at 50% 20%,rgba(124,77,255,.2),transparent 35%),
 linear-gradient(#080817,#11102b)
}
.lane{
 position:absolute;top:0;bottom:0;width:25%;
 border-left:1px solid rgba(255,255,255,.07);
 border-right:1px solid rgba(255,255,255,.03)
}
.l1{left:0}.l2{left:25%}.l3{left:50%}.l4{left:75%}
.note{
 position:absolute;width:42px;height:18px;border-radius:9px;
 box-shadow:0 0 14px currentColor;
 transform:translateX(-50%)
}
.n1{background:#ff4f91;color:#ff4f91}
.n2{background:#55dfff;color:#55dfff}
.n3{background:#b36cff;color:#b36cff}
.n4{background:#ffd84d;color:#ffd84d}
.hitline{
 position:absolute;bottom:62px;left:4%;right:4%;height:4px;
 background:rgba(255,255,255,.35);box-shadow:0 0 15px #fff
}
.target{
 position:absolute;bottom:45px;width:48px;height:48px;
 border:3px solid currentColor;border-radius:50%;
 transform:translateX(-50%);box-shadow:0 0 18px currentColor
}
.t1{left:12.5%;color:#ff4f91}.t2{left:37.5%;color:#55dfff}
.t3{left:62.5%;color:#b36cff}.t4{left:87.5%;color:#ffd84d}
.pop{
 position:absolute;top:42%;left:50%;transform:translate(-50%,-50%);
 font-size:24px;font-weight:bold;opacity:0;pointer-events:none;
 text-shadow:0 0 15px currentColor
}
.combo{
 position:absolute;top:14px;left:50%;transform:translateX(-50%);
 font-size:13px;color:#cfc5ff
}
.controls{
 padding:13px;background:#0d0d24;display:flex;gap:8px
}
.key{
 flex:1;height:62px;border:0;border-radius:14px;color:#fff;
 font-size:18px;font-weight:bold;background:#191942;
 box-shadow:0 5px 0 #08081b
}
.key:active{transform:translateY(3px);box-shadow:0 2px 0 #08081b}
.k1{border-bottom:4px solid #ff4f91}
.k2{border-bottom:4px solid #55dfff}
.k3{border-bottom:4px solid #b36cff}
.k4{border-bottom:4px solid #ffd84d}
.bottom{text-align:center;padding:9px;color:#777;font-size:10px}
</style>

<div class="card">
 <div class="head">
  <div>
   <div class="brand">NIXEL OFFICIAL</div>
   <div class="title">🎸 GUITAR HERO</div>
  </div>
  <div class="score">
   <span id="score">000000</span>
   <div class="best">BEST <span id="best">000000</span></div>
  </div>
 </div>

 <div class="info">
  <span>❤️ <b id="life">5</b></span>
  <span>🔥 COMBO <b id="comboTop">0</b></span>
  <span>LEVEL <b id="level">1</b></span>
 </div>

 <div class="stage" id="stage">
  <div class="lane l1"></div>
  <div class="lane l2"></div>
  <div class="lane l3"></div>
  <div class="lane l4"></div>

  <div class="combo" id="combo">READY TO ROCK 🎸</div>

  <div class="target t1"></div>
  <div class="target t2"></div>
  <div class="target t3"></div>
  <div class="target t4"></div>

  <div class="hitline"></div>
  <div class="pop" id="pop">PERFECT!</div>
 </div>

 <div class="controls">
  <button class="key k1" id="b1">●</button>
  <button class="key k2" id="b2">●</button>
  <button class="key k3" id="b3">●</button>
  <button class="key k4" id="b4">●</button>
 </div>

 <div class="bottom">
  Hit the notes • Keep the rhythm • Rock on 🎸
 </div>
</div>

<script>
const stage=document.getElementById("stage");
const scoreEl=document.getElementById("score");
const bestEl=document.getElementById("best");
const lifeEl=document.getElementById("life");
const comboEl=document.getElementById("combo");
const comboTop=document.getElementById("comboTop");
const levelEl=document.getElementById("level");
const pop=document.getElementById("pop");

let score=0,best=0,combo=0,life=5,level=1;
let notes=[],running=true,lastSpawn=0,speed=2.7;
let audioCtx=null;

try{
 best=Number(localStorage.getItem("guitar_best")||0);
}catch(e){}

bestEl.textContent=String(best).padStart(6,"0");

function sound(freq){
 try{
  if(!audioCtx) audioCtx=new(window.AudioContext||window.webkitAudioContext)();
  const o=audioCtx.createOscillator();
  const g=audioCtx.createGain();
  o.type="triangle";
  o.frequency.value=freq;
  g.gain.setValueAtTime(.0001,audioCtx.currentTime);
  g.gain.exponentialRampToValueAtTime(.12,audioCtx.currentTime+.01);
  g.gain.exponentialRampToValueAtTime(.0001,audioCtx.currentTime+.13);
  o.connect(g);g.connect(audioCtx.destination);
  o.start();o.stop(audioCtx.currentTime+.14);
 }catch(e){}
}

function spawn(){
 const lane=Math.floor(Math.random()*4);
 const n=document.createElement("div");
 n.className="note n"+(lane+1);
 n.style.left=(12.5+lane*25)+"%";
 n.style.top="-25px";
 stage.appendChild(n);
 notes.push({ el:n, lane, y:-25, hit:false });
}

function popup(text){
 pop.textContent=text;
 pop.style.color=text==="MISS"?"#ff4f70":"#fff";
 pop.style.opacity="1";
 pop.style.transform="translate(-50%,-50%) scale(1.25)";
 setTimeout(()=>{ pop.style.opacity="0"; pop.style.transform="translate(-50%,-50%) scale(1)"; },280);
}

function updateUI(){
 scoreEl.textContent=String(Math.floor(score)).padStart(6,"0");
 bestEl.textContent=String(Math.floor(best)).padStart(6,"0");
 comboTop.textContent=combo;
 levelEl.textContent=level;
 lifeEl.textContent=life;
}

function hitLane(lane){
 if(!running)return;
 let candidate=null;
 let distance=999;
 for(const n of notes){
  if(n.lane!==lane||n.hit)continue;
  const d=Math.abs(n.y-318);
  if(d<distance){ distance=d; candidate=n; }
 }
 if(candidate && distance<48){
  candidate.hit=true;
  if(distance<18){
   score+=100+combo*5; combo++; popup("PERFECT!"); sound([261,329,392,523][lane]);
  }else{
   score+=50+combo*2; combo++; popup("GOOD!"); sound([294,349,440,587][lane]);
  }
  candidate.el.remove(); notes=notes.filter(n=>n!==candidate);
  if(combo>0 && combo%10===0){
   level++; speed=Math.min(6,speed+.35); comboEl.textContent="LEVEL UP! 🔥";
  }else{ comboEl.textContent=combo+"x COMBO 🔥"; }
  if(score>best){ best=score; try{localStorage.setItem("guitar_best",best)}catch(e){} }
  updateUI();
 }else{
  combo=0; comboEl.textContent="MISS! 🎸"; popup("MISS"); life--; sound(120);
  if(life<=0)endGame(); updateUI();
 }
}

function endGame(){
 running=false;
 comboEl.textContent="GAME OVER • Tap to restart";
}

function restart(){
 score=0; combo=0; life=5; level=1; speed=2.7; running=true;
 notes.forEach(n=>n.el.remove()); notes=[];
 comboEl.textContent="READY TO ROCK 🎸"; updateUI();
}

function loop(t){
 if(!lastSpawn)lastSpawn=t;
 if(running){
  if(t-lastSpawn>Math.max(330,800-level*55)){ spawn(); lastSpawn=t; }
  notes.forEach(n=>{ n.y+=speed; n.el.style.top=n.y+"px"; });
  for(const n of [...notes]){
   if(n.y>390){
    n.el.remove(); notes=notes.filter(x=>x!==n);
    combo=0; life--; comboEl.textContent="MISS!"; popup("MISS");
    if(life<=0)endGame(); updateUI();
   }
  }
 }
 requestAnimationFrame(loop);
}

function press(i){
 if(!running){ restart(); return; }
 hitLane(i);
}

["b1","b2","b3","b4"].forEach((id,i)=>{
 const b=document.getElementById(id);
 b.addEventListener("pointerdown",e=>{ e.preventDefault(); press(i); });
});

document.addEventListener("keydown",e=>{
 const k={"1":0,"2":1,"3":2,"4":3, "d":0,"f":1,"j":2,"k":3}[e.key.toLowerCase()];
 if(k!==undefined)press(k);
});

stage.addEventListener("pointerdown",()=>{ if(!running)restart(); });

updateUI();
requestAnimationFrame(loop);
</script>
`;

Module({
  command: "guitar",
  package: "games",
  description: "Play Guitar Hero — Hit the notes",
})(async (message, match) => {
  try {
    await message.conn.sendMessage(message.from, {
      react: { text: "⏳", key: message.key },
    });
    await message.conn.relayMessage(
      message.from,
      {
        messageContextInfo: {
          deviceListMetadata: {},
          deviceListMetadataVersion: 2,
        },
        botForwardedMessage: {
          message: {
            richResponseMessage: {
              messageType: 1,
              submessages: [{ messageType: 2, messageText: "🎸 Guitar Hero" }],
              unifiedResponse: {
                data: Buffer.from(
                  JSON.stringify({
                    response_id: "nixel-guitar-hero",
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
    console.error("[Guitar] Error:", error);
    await message.conn.sendMessage(message.from, {
      react: { text: "❌", key: message.key },
    });
    return message.send(`❌ *Error:* ${error.message}`);
  }
});
