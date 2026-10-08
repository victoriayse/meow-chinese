// A tiny Supabase Realtime client (Phoenix protocol over a WebSocket) for live house visits:
// "broadcast" carries moves and chat, "presence" tells who is in the house.
// Channels are private: only the house owner and their friends may join (database policy).
import * as Auth from './auth.js';

export class Channel {
  constructor(topic, { onBroadcast = () => {}, onPresence = () => {}, onStatus = () => {}, presenceKey = '' } = {}) {
    this.topic = `realtime:${topic}`;
    this.on = { onBroadcast, onPresence, onStatus };
    this.key = presenceKey;
    this.ws = null; this.ref = 0; this.joinRef = null; this.joined = false; this.closed = false;
    this.present = new Map();   // presence key -> latest meta
    this.meta = null; this.retry = 0; this.beat = null; this.timer = null;
  }
  async open() {
    this.closed = false;
    const t = await Auth.token().catch(() => null);
    if (!t || this.closed) return;
    const ws = new WebSocket(`${Auth.API.replace(/^http/, 'ws')}/realtime/v1/websocket?apikey=${encodeURIComponent(Auth.KEY)}&vsn=1.0.0`);
    this.ws = ws;
    ws.onopen = () => {
      this.joinRef = String(++this.ref);
      ws.send(JSON.stringify({ topic: this.topic, event: 'phx_join', ref: this.joinRef, join_ref: this.joinRef,
        payload: { config: { broadcast: { self: false, ack: false }, presence: { key: this.key }, private: true }, access_token: t } }));
      clearInterval(this.beat);
      this.beat = setInterval(async () => {
        this.raw('phoenix', 'heartbeat', {});
        const nt = await Auth.token().catch(() => null); if (nt) this.raw(this.topic, 'access_token', { access_token: nt });
      }, 25000);
    };
    ws.onmessage = (e) => {
      let m; try { m = JSON.parse(e.data); } catch { return; }
      if (m.topic !== this.topic) return;
      if (m.event === 'phx_reply' && m.ref === this.joinRef) {
        if (m.payload && m.payload.status === 'ok') { this.joined = true; this.retry = 0; if (this.meta) this.track(this.meta); this.on.onStatus('joined'); }
        else this.on.onStatus('denied', m.payload);
      } else if (m.event === 'broadcast' && m.payload) {
        this.on.onBroadcast(m.payload.event, m.payload.payload || {});
      } else if (m.event === 'presence_state') {
        this.present.clear();
        Object.entries(m.payload || {}).forEach(([k, v]) => this.present.set(k, (v.metas || [])[0] || {}));
        this.on.onPresence(this.present, Object.keys(m.payload || {}), []);
      } else if (m.event === 'presence_diff') {
        const joins = Object.keys((m.payload || {}).joins || {}), leaves = Object.keys((m.payload || {}).leaves || {});
        joins.forEach((k) => this.present.set(k, ((m.payload.joins[k] || {}).metas || [])[0] || {}));
        leaves.forEach((k) => { if (!joins.includes(k)) this.present.delete(k); });
        this.on.onPresence(this.present, joins, leaves);
      } else if (m.event === 'phx_error' || m.event === 'phx_close') {
        try { ws.close(); } catch {}
      }
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      clearInterval(this.beat); this.beat = null; this.joined = false; this.ws = null;
      this.on.onStatus('closed');
      if (!this.closed) this.timer = setTimeout(() => this.open(), Math.min(30000, 1500 * 2 ** this.retry++));
    };
  }
  raw(topic, event, payload) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify({ topic, event, payload, ref: String(++this.ref), join_ref: this.joinRef })); }
  send(event, payload) { if (this.joined) this.raw(this.topic, 'broadcast', { type: 'broadcast', event, payload }); }
  track(meta) { this.meta = meta; if (this.joined) this.raw(this.topic, 'presence', { type: 'presence', event: 'track', payload: meta }); }
  close() {
    this.closed = true; clearInterval(this.beat); clearTimeout(this.timer);
    const ws = this.ws; this.ws = null; this.joined = false;
    if (ws) { try { ws.send(JSON.stringify({ topic: this.topic, event: 'phx_leave', payload: {}, ref: String(++this.ref), join_ref: this.joinRef })); } catch {} ws.onclose = null; try { ws.close(); } catch {} }
  }
}
