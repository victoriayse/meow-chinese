// ☕ The home coffee machine: open a pack of coffee pods (10 pods, from the Supermarket / MeowMart), pop a pod in,
// and it pours an espresso into a cup. She picks the cup up (it goes in her bag). An espresso goes cold and
// disappears after 1 day.
import * as S from './state.js';
import { spriteCanvas } from './pixel.js';
import { snackCanvas } from './snacks.js';
import { html, $, openModal, closeModal, toast } from './ui.js';
import { sfx } from './audio.js';

const DAY = 24 * 60 * 60 * 1000;
const pods = () => S.get().coffeePods || 0;
// espressos older than a day are gone
export function purgeEspresso() {
  const st = S.get(), have = (st.snacks || {}).espresso || 0;
  // keep one "made at" time per cup she still has (the newest ones), dropping cups older than a day
  const made = (st.espressoMade || []).slice(-have).filter((t) => Date.now() - t < DAY);
  const changed = made.length !== (st.espressoMade || []).length || made.length !== have;
  if (made.length) st.snacks.espresso = made.length; else if (st.snacks) delete st.snacks.espresso;
  if (st.holding === 'espresso' && !made.length) st.holding = null;
  st.espressoMade = made;
  if (changed) S.save();
}

export function openCoffeeMachine(onChanged = () => {}) {
  purgeEspresso();
  const box = html`<div class="card stack cm-card">
      <div class="h-title">☕ <span class="zh">咖啡机</span> Coffee machine</div>
      <div class="cm-stage"><div class="cm-machine"></div><div class="cm-pod"></div><div class="cm-stream"></div><div class="cm-cup"></div></div>
      <p class="cm-msg"></p>
      <div class="row" style="justify-content:center;flex-wrap:wrap"><button type="button" class="btn white" id="cm-pack"></button><button type="button" class="btn green" id="cm-go"></button></div>
      <button type="button" class="btn white small" id="cm-close">关闭 Close</button></div>`;
  $('.cm-machine', box).append(spriteCanvas('coffeemachine', 150));
  const cup = $('.cm-cup', box); cup.append(snackCanvas('espresso', 3));
  let busy = false, ready = false;
  const draw = () => {
    const packs = (S.snacks().grcoffeepods || 0);
    $('.cm-msg', box).innerHTML = ready ? '😋 <span class="zh">浓缩咖啡好了！点杯子拿起来。</span> Your espresso is ready — tap the cup to pick it up.'
      : `<span class="zh">胶囊</span> Pods in the machine box: <b>${pods()}</b> · <span class="zh">包</span> Packs in your bag: <b>${packs}</b>`;
    const pk = $('#cm-pack', box), go = $('#cm-go', box);
    pk.innerHTML = `📦 <span class="zh">打开一包胶囊</span> Open a pack (+10)`; pk.disabled = busy || ready || !packs;
    go.innerHTML = '☕ <span class="zh">放胶囊，做咖啡</span> Put a pod in'; go.disabled = busy || ready || !pods();
    cup.classList.toggle('full', ready); cup.classList.toggle('show', busy || ready);
    if (!pods() && !packs && !ready) $('.cm-msg', box).innerHTML += '<br><small>🛒 <span class="zh">超市或喵喵超市外卖可以买咖啡胶囊。</span> Buy coffee pods at the Supermarket or on MeowMart delivery.</small>';
  };
  $('#cm-pack', box).onclick = () => {
    const st = S.get(); if (!(S.snacks().grcoffeepods > 0)) return;
    st.snacks.grcoffeepods--; if (!st.snacks.grcoffeepods) delete st.snacks.grcoffeepods; if (st.holding === 'grcoffeepods' && !st.snacks.grcoffeepods) st.holding = null;
    st.coffeePods = pods() + 10; S.save(); sfx.click(); onChanged(); draw();
  };
  $('#cm-go', box).onclick = () => {
    if (busy || ready || !pods()) return;
    busy = true; S.get().coffeePods = pods() - 1; S.save(); sfx.click(); draw();
    const stage = $('.cm-stage', box);
    stage.classList.remove('brew'); void stage.offsetWidth; stage.classList.add('brew');   // the pod drops in, then the coffee pours
    setTimeout(() => { if (!box.isConnected) return; busy = false; ready = true; sfx.coin(); draw(); }, 2600);
  };
  cup.onclick = () => {
    if (!ready) return;
    ready = false; S.addSnack('espresso'); const st = S.get(); st.espressoMade = [...(st.espressoMade || []), Date.now()]; S.save();
    $('.cm-stage', box).classList.remove('brew'); sfx.coin(); onChanged();
    toast('☕ <span class="zh">拿到浓缩咖啡了！一天内要喝掉哦。</span> Espresso in your bag — drink it within a day!', { ms: 2600 });
    draw();
  };
  $('#cm-close', box).onclick = closeModal;
  draw(); openModal(box);
}
