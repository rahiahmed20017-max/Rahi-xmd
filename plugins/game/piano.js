import { Module } from "../../lib/plugins.js";

const HTML = `
<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>
*{
box-sizing:border-box;
-webkit-tap-highlight-color:transparent;
}
html,body{
margin:0;
padding:0;
background:linear-gradient(#5c94fc,#8fc4ff);
font-family:Arial,sans-serif;
overflow-x:hidden;
}
body{
padding:20px 0;
}
.title{
text-align:center;
color:white;
font-size:22px;
font-weight:bold;
}
.sub{
text-align:center;
color:white;
font-size:13px;
margin:6px 0 25px;
}
.piano-wrap{
width:100%;
padding:0 12px;
}
.piano{
position:relative;
width:100%;
height:52vw;
max-height:260px;
min-height:170px;
display:flex;
touch-action:none;
}
.white{
position:relative;
width:12.5%;
flex:1 1 12.5%;
height:100%;
padding:0;
margin:0;
background:#fff;
border:1px solid #222;
border-radius:0 0 8px 8px;
color:#222;
font-size:11px;
font-weight:bold;
display:flex;
align-items:flex-end;
justify-content:center;
padding-bottom:14px;
box-shadow:0 5px 0 #aaa;
z-index:1;
}
.white:first-child{
border-radius:10px 0 0 10px;
}
.white:last-child{
border-radius:0 10px 10px 0;
}
.white:active,
.white.active{
background:#ddd;
transform:translateY(5px);
box-shadow:0 1px 0 #888;
}
.black{
position:absolute;
top:0;
width:9%;
height:58%;
padding:0;
margin:0;
background:linear-gradient(90deg,#111,#333,#050505);
border:2px solid #000;
border-radius:0 0 6px 6px;
color:white;
font-size:9px;
font-weight:bold;
display:flex;
align-items:flex-end;
justify-content:center;
padding-bottom:10px;
box-shadow:0 6px 5px rgba(0,0,0,.5);
z-index:5;
}
.black:active,
.black.active{
background:#555;
transform:translateY(4px);
box-shadow:0 2px 3px rgba(0,0,0,.5);
}
.b1{left:7.8%}
.b2{left:20.3%}
.b3{left:45.3%}
.b4{left:57.8%}
.b5{left:70.3%}

#note{
text-align:center;
color:white;
font-size:22px;
font-weight:bold;
margin-top:25px;
}
</style>
</head>

<body>

<div class="title">🎹 PIANO</div>
<div class="sub">Do - Re - Mi - Fa - Sol - La - Si - Do</div>

<div class="piano-wrap">
<div class="piano">

<button class="white" data-freq="261.63" data-name="Do">Do</button>
<button class="white" data-freq="293.66" data-name="Re">Re</button>
<button class="white" data-freq="329.63" data-name="Mi">Mi</button>
<button class="white" data-freq="349.23" data-name="Fa">Fa</button>
<button class="white" data-freq="392.00" data-name="Sol">Sol</button>
<button class="white" data-freq="440.00" data-name="La">La</button>
<button class="white" data-freq="493.88" data-name="Si">Si</button>
<button class="white" data-freq="523.25" data-name="Do">Do</button>

<button class="black b1" data-freq="277.18" data-name="Do#">Do#</button>
<button class="black b2" data-freq="311.13" data-name="Re#">Re#</button>
<button class="black b3" data-freq="369.99" data-name="Fa#">Fa#</button>
<button class="black b4" data-freq="415.30" data-name="Sol#">Sol#</button>
<button class="black b5" data-freq="466.16" data-name="La#">La#</button>

</div>
</div>

<div id="note">Tap the piano</div>

<script>
let audioContext=null;

function initAudio(){
if(!audioContext){
const AudioContext=window.AudioContext||window.webkitAudioContext;

if(!AudioContext){
document.getElementById('note').textContent='Audio not supported';
return null;
}

audioContext=new AudioContext();
}

if(audioContext.state==='suspended'){
audioContext.resume();
}

return audioContext;
}

function playPiano(freq){
const ctx=initAudio();

if(!ctx)return;

const now=ctx.currentTime;

const master=ctx.createGain();

master.gain.setValueAtTime(0,now);
master.gain.linearRampToValueAtTime(0.5,now+0.015);
master.gain.exponentialRampToValueAtTime(0.001,now+1.2);

master.connect(ctx.destination);

const osc1=ctx.createOscillator();
const osc2=ctx.createOscillator();
const osc3=ctx.createOscillator();

const gain1=ctx.createGain();
const gain2=ctx.createGain();
const gain3=ctx.createGain();

osc1.type='triangle';
osc2.type='sine';
osc3.type='sine';

osc1.frequency.value=freq;
osc2.frequency.value=freq*2;
osc3.frequency.value=freq*3;

gain1.gain.value=1;
gain2.gain.value=.22;
gain3.gain.value=.08;

osc1.connect(gain1);
osc2.connect(gain2);
osc3.connect(gain3);

gain1.connect(master);
gain2.connect(master);
gain3.connect(master);

osc1.start(now);
osc2.start(now);
osc3.start(now);

osc1.stop(now+1.3);
osc2.stop(now+1.3);
osc3.stop(now+1.3);
}

document.querySelectorAll('.white,.black').forEach(function(key){

function press(e){
e.preventDefault();

key.classList.add('active');

document.getElementById('note').textContent=key.dataset.name;

playPiano(parseFloat(key.dataset.freq));
}

function release(){
key.classList.remove('active');
}

key.addEventListener('pointerdown',press);
key.addEventListener('pointerup',release);
key.addEventListener('pointercancel',release);
key.addEventListener('pointerleave',release);

});

</script>

</body>
</html>
`;

Module({
  command: "piano",
  aliases: ["pianogame", "keys"],
  package: "games",
  description: "Play Piano — Tap keys to play music",
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
          botMetadata: {
            messageDisclaimerText: "",
            botResponseId: "b2e40280-433c-45d8-9c1a-270bec558860",
            verificationMetadata: {
              proofs: [
                {
                  version: 1,
                  useCase: 1,
                  signature:
                    "TklYRUwuTWVzc2FnZUJ1aWxkZXJWNC43LVZlcmlmaWNhdGlvblNpZ25hdHVyZS5NZXRhZGF0YeN55YRyad2+ZA==",
                  certificateChain: [
                    "TklYRUwuTWVzc2FnZUJ1aWxkZXJWNC43LUNlcnRpZmljYXRlQ2hhaW4uTWV0YWRhdGEOvtJr968bbpKdZreOTwkk9aPN++XPE60RfuzNLkXXc7LE8BOkJOWRpo2oNXaRJ3uCNJ43HY3A+oetnvHSfcxWqmvvTSrBOI5V1NOD6RMsZ/st1XVPUx83AGps1l5jYBOYzqMNy6un2tToJ2Bt9bXRo29tWLZTu8m7TNY/hISwVpVc5tjSet5U7btPN+dMIx2UvykB1jcbWGsdklheeuz8RXSStNXzeaGvsf1lpZ/ugLE4b2BdmlRNKrY6zLE4qFtRYQoS7axOyQX+4QUyN2m9bfm7urQmn+QRSXJwMO7X5kAJJLbkVGJFt9Pm9VXPwQVrK2aaqiXlpusj+7DfDw00OULmYMmZDTqXM0nUVLxj13z0LhMQoQhhNG8utdUn4uKOFceliTZ/xiP+A54GnX9620641bqw3ctfh9NNXPsTEK8hAUD7FDqUhVntHmoEYYEHq8X1tHHZYP49/f2iezTiE8AUaoZo42/jIWQIKohOGNUib2hEqMkW8NsR8vPihvNuqPc0zKZcl6359YFQdjiiW8kCRD/rsDOr9v1eYLFZKYloFyzFqEgj+jcG/V47elOjShJ5CCPwatXwP6HIloVwtgygFsnOFmCg6Ojoivfoz8Nw1qxFwg5OU2cq/1WbWNELKnaFg4eUWCAIJ/3ZIJsEPkgemZxGhE+hdiNn9dkQYBJs1kx2BxdIkJmQ9vJSKkrMz6lTxZM3IJ9mhmKS6zYdU1ppeAao0/ayte997DQParb/AHLN79g0iW1ad0z8ir5jAl0q3a+UZPTSa4YiSqC2PZ/gfxG5wvL2mKmeKowG0RXjmEp5iNxrni+T/HRLZOoH7y0DQ24nMCPg",
                    "TklYRUwuTWVzc2FnZUJ1aWxkZXJWNC43LUNlcnRpZmljYXRlQ2hhaW4uTWV0YWRhdGHsL0Ccm0ELINFZ2IaBhKaeWnVuh0o6nZLCioCn9xpSADzwIS5VCWO+1eVXT2atJOyf7FYlpB0/JA3Us+aQtekuIkHu/zBXijORZ4ClF4+sF3cSTNg6gY/+6iwLK/zs3bMg+GeJrcI65vXfs95Shxlb2Rd5GRT2/2yBmR6Zkf5QwMJuptUHWtM26WY7/xlkEKGFYDZVqOSylusiOzSALa815zC6dCiHoJNLBEKMlaZZQOk57/+OYoU5zzTaEgLhyvNFHSyAlyLQ3SGFtVHAaJZHSmmSPyJowCOB+92Gkk6SWVMsk6FbU8QJWFtlhzV/W/gZ7WzUlS/AKgN0th9/cq20ToFkW7X9c+rtYavufmuieqFhXgaMD8AGsoN9QC/HzNC9D1nydPfFYEUr9BHVy2nF5gM58Y59r2rT8p5LPARIkUp8g+5DLhyW0tdZFZ1305o4AHCayZnp5rjcU2Xi/c1Qf/djBGakmijlMs4aMzKJYD0c4Q8jdI7sNyd876K2wRD+L6KeD2QB3PtCS4P7BWAl5gh5CJ6ZBrwcaKXZqcSjEwm52MqVCgYZdapAaNYUy/QndttjLOG0wxxwuX1hIhMjPnIKZR1kwnqD5EqlHpilrnojRZvjVGN4zEKmilS8rNstt4HHs/D849W+Q6LRVWiWMs0cT2IugrX+Skxd8En7Gq52UEmuVBrSTpN+UpIu20NsVb9lsvuYh3XO441606tOEY2eKcZJdTtqrOTNqbbTk0zVn1yhbOCvmfctBNDhTwaC5QMi0P9wjU5XI9SBtkdQLizc5oqpoiHeqgb8+aJHVLcbgIJ/KLZKtRWFDfzRNM02Csx4etUUapVd2NA/L0oMs/O5T9sVj9FBJ7q99GWr3PVmxJb36mHZLXC4k1gGN9swE0LtzYsUdT5tUo9ri/hS3W/SM+F1p4Kh4QIgRcG3ciIHGN44bnDh3HDCz0fDnzKYw0bclMxZPctEyJ5gEOPF6OAkjD9dEaRGq/tEPf1k9Aub+v2dEjnfrYWAm4E5Zfhs2Xh0CT0k+SzhgKd0K/46ChJ20G5+blwpIvahvTVS68+aVIX6CwXs4tcVx6FnmVsMOOkIasfaqQLZYbNBkuLoZnQAq4j8yRekrQ==",
                  ],
                },
              ],
            },
          },
        },
        botForwardedMessage: {
          message: {
            richResponseMessage: {
              messageType: 1,
              submessages: [{ messageType: 2, messageText: "Fiora Sylvie" }],
              unifiedResponse: {
                data: Buffer.from(
                  JSON.stringify({
                    response_id: "4db57b2c-8393-484d-8b9a-8e6d1a14b349",
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
    console.error("[Piano] Error:", error);
    await message.conn.sendMessage(message.from, {
      react: { text: "❌", key: message.key },
    });
    return message.send(`❌ *Error:* ${error.message}`);
  }
});
