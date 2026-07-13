/* ============================================================
 * collab.js — Capa colaborativa simplificada (password + nombre)
 * ============================================================
 * Modelo:
 *   1) Password compartida (window.SHARED_PASSWORD).
 *   2) Cada usuario introduce su nombre; se guarda en localStorage.
 *   3) Todos los cambios quedan registrados con ese nombre.
 * ============================================================ */

(function(){
  'use strict';

  const LS_KEY = 'hanwha_dc_user_v1';

  const STATE = {
    client: null,
    user: null,
    authorized: false,
  };

  function loadUser(){
    try {
      const raw = localStorage.getItem(LS_KEY);
      if(!raw) return null;
      const obj = JSON.parse(raw);
      return (obj && obj.name && obj.ok) ? obj : null;
    } catch(_){ return null; }
  }
  function saveUser(user){ localStorage.setItem(LS_KEY, JSON.stringify(user)); }
  function clearUser(){ localStorage.removeItem(LS_KEY); }

  window.Collab = {
    _state: STATE,

    ready(){
      return !!(window.SUPABASE_URL && window.SUPABASE_ANON_KEY && window.SHARED_PASSWORD && window.supabase);
    },

    async init(){
      if(!this.ready()){
        console.warn('[Collab] Configuración incompleta. Crea config.js con SUPABASE_URL, SUPABASE_ANON_KEY y SHARED_PASSWORD.');
        this._injectStyles();
        this._renderUI();
        return;
      }
      STATE.client = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY, {
        auth: { persistSession: false }
      });
      const prev = loadUser();
      if(prev){
        STATE.user = { name: prev.name };
        STATE.authorized = true;
      }
      this._injectStyles();
      this._renderUI();
    },

    user(){ return STATE.user ? { name: STATE.user.name } : null; },
    isAuthorized(){ return STATE.authorized; },

    signIn(password, name){
      const p1 = String(password || '');
      const p2 = String(window.SHARED_PASSWORD || '');
      let mismatch = p1.length !== p2.length ? 1 : 0;
      const n = Math.max(p1.length, p2.length);
      for(let i=0; i<n; i++){ mismatch |= (p1.charCodeAt(i) || 0) ^ (p2.charCodeAt(i) || 0); }
      if(mismatch !== 0) throw new Error('Wrong password');
      const clean = String(name || '').trim();
      if(!clean) throw new Error('Please enter your name');
      STATE.user = { name: clean };
      STATE.authorized = true;
      saveUser({ name: clean, ok: true });
      this._renderUI();
      window.dispatchEvent(new CustomEvent('collab:signin'));
    },

    signOut(){
      STATE.user = null;
      STATE.authorized = false;
      clearUser();
      this._renderUI();
      window.dispatchEvent(new CustomEvent('collab:signout'));
    },

    async listAnnouncements(){
      if(!STATE.client) return [];
      const { data, error } = await STATE.client
        .from('announcements')
        .select('*')
        .order('updated_at', { ascending: false });
      if(error){ console.error('[Collab] listAnnouncements', error); return []; }
      return data || [];
    },

    async insertAnnouncement(payload){
      if(!STATE.client || !STATE.authorized) throw new Error('Not signed in');
      const row = Object.assign({}, payload, { created_by: STATE.user.name });
      const { data, error } = await STATE.client.from('announcements').insert(row).select().single();
      if(error) throw error;
      return data;
    },

    async updateAnnouncement(id, patch){
      if(!STATE.client || !STATE.authorized) throw new Error('Not signed in');
      const row = Object.assign({}, patch, { updated_by: STATE.user.name });
      const { data, error } = await STATE.client.from('announcements').update(row).eq('id', id).select().single();
      if(error) throw error;
      return data;
    },

    async deleteAnnouncement(id){
      if(!STATE.client || !STATE.authorized) throw new Error('Not signed in');
      await STATE.client.from('announcements').update({ updated_by: STATE.user.name }).eq('id', id);
      const { error } = await STATE.client.from('announcements').delete().eq('id', id);
      if(error) throw error;
    },

    async listHistory(entity, entity_id){
      if(!STATE.client) return [];
      const { data, error } = await STATE.client
        .from('edits_log')
        .select('*')
        .eq('entity', entity).eq('entity_id', entity_id)
        .order('at_ts', { ascending: false });
      if(error){ console.error('[Collab] listHistory', error); return []; }
      return data || [];
    },

    onAnnouncementsChange(cb){
      if(!STATE.client) return () => {};
      const ch = STATE.client
        .channel('rt-ann')
        .on('postgres_changes', { event:'*', schema:'public', table:'announcements' }, () => cb())
        .subscribe();
      return () => STATE.client.removeChannel(ch);
    },

    _injectStyles(){
      if(document.getElementById('collab-styles')) return;
      const css = `
        #collabBar { display:flex; align-items:center; gap:10px; padding:6px 14px; background:#fff; border-bottom:1px solid var(--line,#ddd); font-family:var(--mono,monospace); font-size:12px; color:#333; }
        #collabBar .flex { flex:1; }
        #collabBar .badge { padding:2px 8px; border-radius:9px; font-size:10px; letter-spacing:.5px; }
        #collabBar .badge.ok { background:#e7f2e7; color:#1e6b34; }
        #collabBar .badge.off { background:#eee; color:#666; }
        #collabBar button { border:1px solid var(--line,#ccc); background:#fff; padding:4px 10px; border-radius:3px; cursor:pointer; font-family:inherit; font-size:12px; }
        #collabBar button:hover { background:#f5f5f5; }
        #collabGate { position:fixed; inset:0; background:rgba(20,20,20,.78); display:flex; align-items:center; justify-content:center; z-index:9999; font-family:var(--sans,system-ui,sans-serif); }
        #collabGate .card { background:#fff; padding:34px 36px; border-radius:6px; box-shadow:0 20px 60px rgba(0,0,0,.35); max-width:420px; width:90%; }
        #collabGate h2 { margin:0 0 6px; font-size:19px; }
        #collabGate p { margin:0 0 18px; color:#666; font-size:13px; line-height:1.5; }
        #collabGate label { display:block; margin:12px 0 4px; font-size:12px; color:#333; font-weight:500; }
        #collabGate input { width:100%; padding:8px 10px; border:1px solid #ccc; border-radius:4px; font-size:14px; box-sizing:border-box; }
        #collabGate .row { display:flex; gap:8px; margin-top:20px; }
        #collabGate button.primary { flex:1; background:var(--accent,#f47220); color:#fff; border:none; padding:10px; border-radius:4px; cursor:pointer; font-size:14px; font-weight:500; }
        #collabGate button.primary:hover { background:#d95f18; }
        #collabGate .err { color:#c0392b; font-size:12px; margin-top:8px; min-height:16px; }
        #collabGate .note { color:#888; font-size:11px; margin-top:14px; line-height:1.5; }
      `;
      const s = document.createElement('style'); s.id='collab-styles'; s.textContent = css;
      document.head.appendChild(s);
    },

    _renderUI(){
      let bar = document.getElementById('collabBar');
      if(!bar){
        bar = document.createElement('div');
        bar.id = 'collabBar';
        const anchor = document.querySelector('nav') || document.body.firstElementChild;
        anchor.parentNode.insertBefore(bar, anchor);
      }
      let gate = document.getElementById('collabGate');

      if(!this.ready()){
        bar.innerHTML = '<div class="flex">📄 Static mode — read-only (config.js not set)</div><span class="badge off">OFFLINE</span>';
        if(gate) gate.remove();
        return;
      }

      const needGate = !STATE.authorized;
      if(needGate){
        bar.innerHTML = '<div class="flex">🔒 Locked · sign in to view/edit</div>';
        if(!gate){
          gate = document.createElement('div');
          gate.id = 'collabGate';
          gate.innerHTML = `
            <div class="card">
              <h2>Hanwha DC Intelligence</h2>
              <p>Internal use only. Enter the shared password and your name to continue.</p>
              <label for="_cg_name">Your name (for edit history)</label>
              <input id="_cg_name" type="text" autocomplete="name" placeholder="e.g. Alberto Quintana">
              <label for="_cg_pw">Access password</label>
              <input id="_cg_pw" type="password" autocomplete="current-password">
              <div class="row"><button class="primary" id="_cg_go">Enter</button></div>
              <div class="err" id="_cg_err"></div>
              <div class="note">Your name is stored in your browser (localStorage) and attached to every change you make. This dashboard shares one password across the team; keep it internal.</div>
            </div>`;
          document.body.appendChild(gate);
          const go = () => {
            try {
              this.signIn(document.getElementById('_cg_pw').value, document.getElementById('_cg_name').value);
              gate.remove();
            } catch(e){
              document.getElementById('_cg_err').textContent = e.message || String(e);
            }
          };
          document.getElementById('_cg_go').onclick = go;
          document.getElementById('_cg_pw').addEventListener('keydown', e => { if(e.key==='Enter') go(); });
          document.getElementById('_cg_name').addEventListener('keydown', e => { if(e.key==='Enter') document.getElementById('_cg_pw').focus(); });
          setTimeout(() => { const n=document.getElementById('_cg_name'); if(n && !n.value) n.focus(); else document.getElementById('_cg_pw').focus(); }, 50);
        }
        return;
      }

      if(gate) gate.remove();
      const u = this.user();
      bar.innerHTML = `
        <div class="flex">👤 <b>${u.name}</b> <span class="badge ok">SIGNED IN</span> · editing enabled · <span style="color:#888">changes are logged to your name</span></div>
        <button id="collabSignOut">Sign out</button>`;
      document.getElementById('collabSignOut').onclick = () => {
        if(confirm('Sign out and forget your name on this browser?')) this.signOut();
      };
    }
  };
})();
