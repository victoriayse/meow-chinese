import * as Radio from './radio.js';
// Shared upload dialogs for home and admin-managed public places.
import * as S from './state.js';
import * as Places from './places.js';
import { ITEMS } from './pixel.js';
import { compressPhoto } from './house.js';
import { $, html, esc, toast, openModal, closeModal } from './ui.js';
import { sfx } from './audio.js';
export function openVideo(id, changed) {
  if (!Places.isAdmin()) return;
  const limit = Places.videoLimit(id), mb = limit / 1048576, tv = limit < Places.MAX_VIDEO;
  const cur = (S.get().screenVideos || {})[id];
  sfx.click();
  const box = html`<div class="card stack" style="align-items:center;text-align:center">
      <div class="h-title"><span class="zh">🎞️ 放电影</span><span class="en">Show a film</span></div>
      ${cur ? `<p class="help" style="margin:0">现在播放 Now showing: <b>${esc(cur.name || 'video')}</b></p>` : ''}
      <label class="btn green"><input type="file" accept="${tv ? 'video/mp4,.mp4' : 'video/mp4,video/webm,video/quicktime,.mp4,.m4v,.mov,.webm'}" hidden>📁 <span class="zh">选视频</span> Choose a video</label>
      <p class="help" style="margin:0" id="vmsg">最大 ${mb}MB · ${tv ? 'MP4 only' : 'MP4 works best'}. Everyone here can watch it.</p>
      <div class="row">${cur ? '<button class="btn white" id="vrm">🗑 <span class="zh">拿掉</span> Remove</button>' : ''}<button class="btn white" id="vc">关闭 Close</button></div>
    </div>`;
  const msg = $('#vmsg', box);
  box.querySelector('input[type=file]').onchange = async (ev) => {
    const f = ev.target.files && ev.target.files[0]; if (!f) return;
    if (f.size > limit) { msg.textContent = `太大了（${(f.size / 1048576).toFixed(1)} MB）· Too big — the video must be ${mb} MB or less`; return; }
    msg.textContent = '上传中… Uploading…';
    try { await Places.uploadScreenVideo(id, f); await changed(); sfx.coin(); closeModal(); toast('🎞️ <span class="zh">电影放好了！</span> Film added to the screen'); }
    catch (x) { msg.textContent = x.message === 'too big' ? `太大了 · Too big — ${mb} MB at most` : x.message === 'not mp4' ? 'Please choose an MP4 file (up to 5 MB)' : x.message === 'not video' ? '这不是视频 · That isn\'t a video file' : '上传不了，再试一次 · Couldn\'t upload — try again'; }
  };
  const rm = $('#vrm', box); if (rm) rm.onclick = async () => {
    try { await Places.removeScreenVideo(id); await changed(); closeModal(); }
    catch (x) { msg.textContent = 'Could not save the change — please try again.'; }
  };
  $('#vc', box).onclick = closeModal;
  openModal(box);
}
export function openPoster(id, changed) {
  const it = ITEMS[id], cur = (S.get().framePhotos || {})[id];
  const box = html`<div class="card stack" style="align-items:center;text-align:center">
      <div class="h-title" style="justify-content:center"><span class="zh">🖼️ ${it.name}</span><span class="en">${esc(it.en)}</span></div>
      <div class="frame-preview">${cur ? `<img src="${cur}" alt="">` : '<span class="help">还没有照片 · No photo yet</span>'}</div>
      <label class="btn blue">📷 <span class="zh">${cur ? '换照片' : '选照片'}</span> ${cur ? 'Change photo' : 'Choose a photo'}<input type="file" accept="image/*" hidden></label>
      <p class="help" id="pmsg" style="margin:0">照片会缩小到 ${it.maxKB || 50}KB 以内。来家里玩的朋友也看得到。<br>Photos are made small (under ${it.maxKB || 50} KB). Friends visiting your house can see them.</p>
      <div class="row">${cur ? '<button class="btn white" id="prm">🗑 <span class="zh">拿掉</span> Remove</button>' : ''}<button class="btn white" id="pc">关闭 Close</button></div>
    </div>`;
  const msg = $('#pmsg', box);
  box.querySelector('input[type=file]').onchange = async (ev) => {
    const f = ev.target.files && ev.target.files[0]; if (!f) return;
    msg.textContent = '处理中… Making it small…';
    try {
      const url = await compressPhoto(f, (it.maxKB || 50) * 1024);   // use the furniture photo limit
      S.setFramePhoto(id, url); await changed(); sfx.coin(); closeModal();
      toast(`🖼️ <span class="zh">照片放好了！</span> Photo added (${Math.round((url.length * 3) / 4 / 1024)} KB)`);

    } catch (x) { msg.textContent = '这张照片用不了，换一张试试。 That photo didn\'t work — try another one.'; }
  };
  const rm = $('#prm', box); if (rm) rm.onclick = async () => {
    try { S.setFramePhoto(id, null); await changed(); closeModal(); }
    catch (x) { msg.textContent = 'Could not save the change — please try again.'; }
  };
  $('#pc', box).onclick = closeModal;
  openModal(box);
}

export async function openRadio(id, { shared = false, changed = async () => {} } = {}) {
  await Radio.moveOldSong(id);
  const song = Radio.mySong(id);
  sfx.click();
  const box = html`<div class="card stack" style="align-items:center;text-align:center">
      <div class="h-title" style="justify-content:center"><span class="zh">📻 收音机</span><span class="en">Radio</span></div>
      <p class="help" style="margin:0" id="rs">${song ? `🎵 <b>${esc(song.name)}</b>` : '还没有歌。选一首你喜欢的歌吧！<br>No song yet — pick one you like.'}</p>
      <label class="btn blue">🎵 <span class="zh">${song ? '换一首歌' : '选一首歌'}</span> ${song ? 'Change song' : 'Choose a song'}<input type="file" accept="audio/*,.mp3" hidden></label>
      <div class="row">${song ? `<button class="btn green" id="rp">${(shared ? song.on !== false : Radio.isPlaying(id)) ? '⏹ <span class="zh">停</span> Stop' : '▶️ <span class="zh">播放</span> Play'}</button><button class="btn white" id="rx">🗑 <span class="zh">删掉</span> Remove</button>` : ''}</div>
      <p class="help" style="margin:0;font-size:13px">最多 10MB。每台收音机都有自己的歌。<br>Up to 10 MB. This song belongs to this radio. Use Play or Stop to control it.</p>
      <button class="btn white" id="rc">关闭 Close</button>
    </div>`;
  const msg = $('#rs', box);
  box.querySelector('input[type=file]').onchange = async (ev) => {
    const f = ev.target.files && ev.target.files[0]; if (!f) return;
    msg.textContent = '上传中… Uploading…';
    try {
      await Radio.setSong(f, id); const playing = await Radio.play(id);
      if (shared) { Radio.setSharedOn(id, true); await changed(); }
      sfx.coin(); closeModal();
      toast(`📻 <span class="zh">${playing ? '正在播放' : '已上传'}</span> ${esc(f.name.replace(/\.[^.]+$/, ''))}`, { ms: 2500 });
    } catch (x) {
      msg.innerHTML = x.message === 'too big' ? '这首歌太大了（最多 10MB）。<br>That song is too big (10 MB at most).' : x.message === 'signed out' ? '要先登录才能放歌。<br>Please log in first.' : '这个文件放不了，换一首试试。<br>That file didn\'t work — try another song.';
    }
  };
  const rp = $('#rp', box); if (rp) rp.onclick = async () => {
    try {
      if (shared) { Radio.setSharedOn(id, song.on === false); await changed(); }
      else await Radio.toggle(id);
      closeModal();
    } catch { msg.textContent = 'Could not save music settings. Please try again.'; }
  };
  const rx = $('#rx', box); if (rx) rx.onclick = async () => { await Radio.removeSong(id); await changed(); closeModal(); toast('🗑 <span class="zh">歌删掉了</span> Song removed'); };
  $('#rc', box).onclick = closeModal;
  openModal(box);
}

// Both home and the admin's public-place view use the same board editor.
export function openBoard(id, changed, current) {
  const it = ITEMS[id], cur = current ?? (S.get().boardTexts || {})[id] ?? it.board.def;
  const box = html`<div class="card stack">
    <div class="h-title"><span class="zh">✏️ ${esc(it.name)}</span><span class="en">${esc(it.en)}</span></div>
    <p class="help">最多 6 行 · Up to 6 lines, 160 characters.</p>
    <textarea class="board-edit" maxlength="160" rows="6"></textarea>
    <p class="help" id="board-message"></p>
    <div class="row"><button class="btn white" id="bc">取消 Cancel</button><button class="btn green" id="bs">✓ 好了 Save</button></div>
  </div>`;
  const ta = box.querySelector('textarea'); ta.value = cur;
  $('#bc', box).onclick = closeModal;
  $('#bs', box).onclick = async () => {
    const button = $('#bs', box); button.disabled = true;
    S.get().boardTexts = S.get().boardTexts || {};
    S.get().boardTexts[id] = ta.value.split('\n').slice(0, 6).join('\n').slice(0, 160); S.save();
    try { await changed(); sfx.coin(); closeModal(); }
    catch (e) { $('#board-message', box).textContent = 'Could not save online. Please try again.'; button.disabled = false; }
  };
  openModal(box); setTimeout(() => { if (box.isConnected) ta.focus(); }, 50);
}
