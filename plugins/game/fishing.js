import { Module } from "../../lib/plugins.js";

const HTML = `
<style>
*{margin:0;padding:0;box-sizing:border-box;-webkit-tap-highlight-color:transparent;user-select:none;font-family:'Arial'}
body{background:transparent;color:#fff}
.card{width:100%;max-width:500px;margin:auto;background:#001a33;border:3px solid #00aaff;border-radius:20px;overflow:hidden;box-shadow:0 0 25px rgba(0,170,255,.4)}
.topbar{padding:12px 16px;background:linear-gradient(90deg,#003366,#0055aa);display:flex;justify-content:space-between;align-items:center}
.coins{color:#ffdd00;font-weight:bold;font-size:14px}
.gems{color:#00ffaa;font-weight:bold;font-size:14px}
.game{position:relative;width:100%;height:350px;background:linear-gradient(to bottom,#87CEEB 0%,#87CEEB 30%,#0066aa 30%,#004477 100%);overflow:hidden}
.sky{position:absolute;top:0;left:0;width:100%;height:30%;background:linear-gradient(to bottom,#87CEEB,#B0E0E6)}
.sun{position:absolute;top:20px;right:40px;width:50px;height:50px;background:#ffdd00;border-radius:50%;box-shadow:0 0 30px #ffdd00}
.cloud{position:absolute;width:60px;height:30px;background:#fff;border-radius:50%;opacity:.7;animation:move 20s linear infinite}
@keyframes move{0%{left:-100px}100%{left:500px}}
.wave{position:absolute;bottom:0;width:100%;height:70%;background:repeating-linear-gradient(0deg,transparent,transparent 8px,rgba(255,255,255,.1) 8px,rgba(255,255,255,.1) 10px);animation:wave 3s ease-in-out infinite}
@keyframes wave{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}
.boat{position:absolute;bottom:65%;left:50%;transform:translateX(-50%);width:80px;height:30px;background:#8B4513;border-radius:0 0 40px 40px;border:2px solid #654321}
.mast{position:absolute;bottom:30px;left:35px;width:4px;height:40px;background:#654321}
.sail{position:absolute;bottom:35px;left:40px;width:30px;height:35px;background:#fff;border-radius:0 20px 0 0;opacity:.8}
.rod{position:absolute;bottom:25px;left:65px;width:3px;height:50px;background:#333;transform-origin:bottom;transform:rotate(-20deg);transition:.3s}
.line{position:absolute;bottom:75px;left:66px;width:2px;height:100px;background:#000;transform-origin:top;animation:cast 2s ease-in-out infinite}
.hook{position:absolute;bottom:175px;left:65px;width:6px;height:6px;background:#888;border-radius:50%}
@keyframes cast{0%,100%{height:100px}50%{height:150px}}
.fish{position:absolute;border-radius:50%;animation:swim 4s linear infinite}
@keyframes swim{0%{left:-30px}100%{left:530px}}
.fish1{width:18px;height:12px;background:#ff6600}
.fish2{width:22px;height:15px;background:#00aaff}
.fish3{width:25px;height:18px;background:#aa00ff}
.gem-fish{width:20px;height:14px;background:radial-gradient(circle,#00ffaa,#00aa88);box-shadow:0 0 10px #00ffaa}
.bubble{position:absolute;width:6px;height:6px;background:rgba(255,255,255,.3);border-radius:50%;animation:bubble 3s linear infinite}
@keyframes bubble{0%{bottom:0;opacity:0}50%{opacity:1}100%{bottom:350px;opacity:0}}
.controls{padding:14px;background:#002244}
.row{display:flex;gap:10px;margin-bottom:10px}
.btn{flex:1;padding:16px;background:linear-gradient(135deg,#00aaff,#0066cc);border:none;border-radius:12px;color:#fff;font-size:15px;font-weight:bold;box-shadow:0 4px 0 #004488}
.btn:active{transform:translateY(2px);box-shadow:0 2px 0 #004488}
.btn-cast{background:linear-gradient(135deg,#ff6600,#cc4400);box-shadow:0 4px 0 #993300}
.btn-cast:active{box-shadow:0 2px 0 #993300}
.status{text-align:center;font-size:12px;color:#aaddff;margin-top:8px}
</style>

<div class="card">
  <div class="topbar">
    <div class="coins">💰 <span id="coins">100</span></div>
    <div style="font-size:16px;font-weight:bold">🎣 FISHING MASTER</div>
    <div class="gems">💎 <span id="gems">0</span></div>
  </div>

  <div class="game" id="game">
    <div class="sky">
      <div class="sun"></div>
      <div class="cloud" style="top:30px;animation-delay:0s"></div>
      <div class="cloud" style="top:50px;animation-delay:5s"></div>
    </div>
    <div class="wave"></div>
    <div class="boat">
      <div class="mast"></div>
      <div class="sail"></div>
      <div class="rod" id="rod"></div>
      <div class="line" id="line"></div>
      <div class="hook" id="hook"></div>
    </div>
  </div>

  <div class="controls">
    <div class="row">
      <button class="btn" id="left">◀ LEFT</button>
      <button class="btn btn-cast" id="cast">🎣 CAST</button>
      <button class="btn" id="right">RIGHT ▶</button>
    </div>
    <div class="status" id="status">Waiting for fish... 🐟</div>
  </div>
</div>

<script>
const game=document.getElementById('game');
let boatX=250,coins=100,gems=0,isCasting=false,fish=[],bubbles=[];

function spawnFish(){
  const types=[
    {c:'fish1',coin:5,gem:0},
    {c:'fish2',coin:10,gem:0},
    {c:'fish3',coin:20,gem:1},
    {c:'gem-fish',coin:50,gem:5}
  ];
  let t=types[Math.floor(Math.random()*4)];
  let f=document.createElement('div');f.className='fish '+t.c;
  f.style.top=180+Math.random()*150+'px';
  game.appendChild(f);
  fish.push({el:f,x:-30,y:parseInt(f.style.top),type:t,caught:false});
}
setInterval(spawnFish,2000);

function spawnBubble(){
  let b=document.createElement('div');b.className='bubble';
  b.style.left=Math.random()*500+'px';
  game.appendChild(b);bubbles.push(b);
  setTimeout(()=>{b.remove()},3000);
}
setInterval(spawnBubble,500);

function cast(){
  if(isCasting)return;isCasting=true;
  document.getElementById('status').textContent='Casting... 🎣';
  document.getElementById('rod').style.transform='rotate(-60deg)';
  document.getElementById('line').style.height='150px';
  
  setTimeout(()=>{
    checkCatch();
    document.getElementById('rod').style.transform='rotate(-20deg)';
    document.getElementById('line').style.height='100px';
    isCasting=false;
    document.getElementById('status').textContent='Waiting for fish... 🐟';
  },2000);
}

function checkCatch(){
  let hookY=175;
  fish.forEach((f,i)=>{
    if(!f.caught && Math.abs(f.x-boatX)<40 && Math.abs(f.y-hookY)<30){
      f.caught=true;
      coins+=f.type.coin;
      gems+=f.type.gem;
      document.getElementById('coins').textContent=coins;
      document.getElementById('gems').textContent=gems;
      document.getElementById('status').textContent='CAUGHT! +'+f.type.coin+' coins +'+f.type.gem+' gems';
      f.el.style.transform='translateY(-100px)';
      setTimeout(()=>f.el.remove(),500);
      fish.splice(i,1);
    }
  });
}

document.getElementById('left').ontouchstart=()=>{boatX=Math.max(50,boatX-20);document.querySelector('.boat').style.left=boatX+'px'};
document.getElementById('right').ontouchstart=()=>{boatX=Math.min(450,boatX+20);document.querySelector('.boat').style.left=boatX+'px'};
document.getElementById('cast').ontouchstart=cast;

setInterval(()=>{
  fish.forEach(f=>{
    if(!f.caught){f.x+=2;f.el.style.left=f.x+'px'}
  });
},50);
</script>
`;

Module({
  command: "fishing",
  aliases: ["fish", "fishingmaster"],
  category: "games",
  description: "Play Fishing Master — Catch fish and earn coins",
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
              submessages: [
                { messageType: 2, messageText: "🎣 Fishing Master" },
              ],
              unifiedResponse: {
                data: Buffer.from(
                  JSON.stringify({
                    response_id: "nixel-fishing-2026",
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
                forwardingScore: 999,
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
    console.error("[Fishing] Error:", error);
    await message.conn.sendMessage(message.from, {
      react: { text: "❌", key: message.key },
    });
    return message.send(`❌ *Error:* ${error.message}`);
  }
});
