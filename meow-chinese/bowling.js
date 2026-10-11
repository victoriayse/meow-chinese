import * as S from './state.js';
import { spriteCanvas } from './pixel.js';
import { html, $, openModal, closeModal } from './ui.js';

// Standard ten-pin scoring, including strike/spare bonuses and the tenth frame.
export function bowlingScore(rolls) {
  let at = 0, total = 0; const frames = [];
  for (let f = 0; f < 10; f++) {
    const a = rolls[at]; if (a == null) break;
    const b = rolls[at + 1], strike = a === 10, spare = !strike && b != null && a + b === 10;
    const complete = strike || spare ? rolls[at + 2] != null : b != null;
    if (!complete) { frames.push(null); break; }
    total += strike ? 10 + b + rolls[at + 2] : spare ? 10 + rolls[at + 2] : a + b;
    frames.push(total); at += strike ? 1 : 2;
  }
  return { total, frames };
}
export function openBowling() {
  let rolls = [], frame = 0, current = [], standing = Array(10).fill(true), busy = false, finished = false;
  const box = html`<div class="card stack bowling-game"><div class="h-title">🎳 保龄球 Bowling</div>
    <div class="bowling-score"></div><div class="bowling-lane"></div>
    <label>方向 Aim <input id="bowl-aim" type="range" min="-100" max="100" value="0"></label>
    <label>力度 Power <input id="bowl-power" type="range" min="20" max="100" value="75"></label>
    <p id="bowl-message">Aim, set your power, then roll. Ten frames — strikes and spares earn bonus points.</p>
    <div class="row"><button class="btn green" id="bowl-roll">投球 Roll</button><button class="btn white" id="bowl-new">New game</button><button class="btn white" id="bowl-close">Close</button></div></div>`;
  const lane = $('.bowling-lane', box); lane.appendChild(spriteCanvas('mallbowlinglane', 320));
  const positions = [[0,3],[-1,2],[1,2],[-2,1],[0,1],[2,1],[-3,0],[-1,0],[1,0],[3,0]];
  function draw() {
    lane.querySelectorAll('.bowl-pin').forEach((p) => p.remove());
    positions.forEach(([x,y],i) => { if (!standing[i]) return; const p = spriteCanvas('mallpin', 24); p.className='bowl-pin';p.style.left=(50+x*7)+'%';p.style.top=(8+y*7)+'%';lane.appendChild(p); });
    const score=bowlingScore(rolls);
    $('.bowling-score',box).textContent=Array.from({length:10},(_,i)=>`${i+1}: ${score.frames[i] ?? '–'}`).join(' | ')+` · Total ${score.total} · Best ${S.get().bowlingBest || 0}`;
    $('#bowl-roll',box).disabled=busy||finished;
  }
  $('#bowl-roll',box).onclick=async()=>{
    if(busy||finished)return;busy=true;draw();
    const aim=Number($('#bowl-aim',box).value)/25, power=Number($('#bowl-power',box).value)/100;
    const ball=spriteCanvas('mallball',28);ball.className='bowl-ball';lane.appendChild(ball);
    const animation=ball.animate([{left:'50%',top:'90%'},{left:(50+aim*7)+'%',top:'14%'}],{duration:1100,easing:'ease-in'});
    try{await animation.finished;}catch{}ball.remove();if(!box.isConnected)return;
    let hit=0;positions.forEach(([x,y],i)=>{if(standing[i]&&Math.abs(x-aim)<.6+power*3+(3-y)*.2){standing[i]=false;hit++;}});
    rolls.push(hit);current.push(hit);
    if(frame<9){if(hit===10||current.length===2){frame++;current=[];standing.fill(true);}}
    else if(current.length===1&&hit===10)standing.fill(true);
    else if(current.length===2){if(current[0]===10||current[0]+current[1]===10){if(!standing.some(Boolean))standing.fill(true);}else finished=true;}
    else if(current.length===3)finished=true;
    if(finished){const score=bowlingScore(rolls).total;S.get().bowlingBest=Math.max(S.get().bowlingBest||0,score);S.save();}
    $('#bowl-message',box).textContent=finished?`Game complete! ${bowlingScore(rolls).total} points.`:`${hit===10?'Strike!':hit+' pins!'} Frame ${frame+1}`;
    busy=false;draw();
  };
  $('#bowl-new',box).onclick=openBowling;$('#bowl-close',box).onclick=closeModal;draw();openModal(box);
}
