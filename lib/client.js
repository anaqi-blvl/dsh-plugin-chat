/**
 * dsh-chat — browser half (real-session, client-driven).
 *
 * Chats are REAL DSH sessions in hidden temp-folder workspaces. This client
 * adds a Chat | Code tab bar, a "New chat" button (identical to New Session),
 * and workspace-group filtering. New chat uses the OFFICIAL
 * `ctx.workspaces.startSession()` flow — the exact code path the workspace
 * "+" button uses — so the session is created, listed, and opened with the
 * full agent toolset, exactly like Code.
 */
window.__ModuleLoader__.load({
  id: "dsh-chat",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    const React = require("react");
    const { createElement, useState, useEffect, useCallback, useRef } = React;
    const { createPortal } = require("react-dom");
    const h = createElement;

    const primitives = require("@deepseek-ai/dsh-client-ui-primitives");
    const { IconNewChatOutline16, IconFolderClose16, IconPlusOutline16, Menu, Modal, Button } = primitives;

    // Home glyph — the icon set has no house icon, so draw one in the same
    // stroke/currentColor style as the rest of the set.
    const IconHome = (props) => h('svg', {
      viewBox: '0 0 16 16', width: props.size || 16, height: props.size || 16,
      fill: 'none', stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true',
    },
      h('path', { d: 'M2.5 7.5 8 3l5.5 4.5' }),
      h('path', { d: 'M4 6.8V13h8V6.8' }),
      h('path', { d: 'M6.8 13v-3h2.4v3' }),
    );

    // Code glyph — Claude-style "</>" code brackets.
    const IconCode = (props) => h('svg', {
      viewBox: '0 0 16 16', width: props.size || 16, height: props.size || 16,
      fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true',
    },
      h('path', { d: 'M5.5 4.5 2.5 8l3 3.5' }),
      h('path', { d: 'M10.5 4.5 13.5 8l-3 3.5' }),
      h('path', { d: 'M7.7 12.5 8.3 3.5' }),
    );

    const NS = "dsh-chat";
    const WORK_TITLE = 'Chat';
    // Parent folder chat workspaces live under — fetched from the host at boot
    // (never hardcoded, so the plugin stays portable across machines).
    let chatWorkRoot = '';

    const en = { "chat": "Chat", "code": "Code", "newChat": "New chat", "addWorkspace": "Add workspace", "useFolder": "Use this folder", "cancel": "Cancel", "loading": "Loading…" };
    const zh = { "chat": "聊天", "code": "代码", "newChat": "新对话", "addWorkspace": "添加工作区", "useFolder": "使用此文件夹", "cancel": "取消", "loading": "加载中…" };

    const css = `/* dsh-chat — Chat/Code tabs + workspace filtering */
.dsh-chat-switcher{display:flex;gap:4px;margin:0 2px 8px;flex:none}
.dsh-chat-switcher-tab{box-sizing:border-box;cursor:pointer;height:40px;flex:1;color:var(--dsw-alias-label-primary);background:0 0;border:none;border-radius:12px;align-items:center;justify-content:center;gap:8px;padding:9px 12px;font-family:inherit;font-size:14px;font-weight:400;line-height:22px;display:flex;min-width:0}
.dsh-chat-switcher-tab:hover{background:var(--dsw-specific-sidebar-nav-item-hover)}
.dsh-chat-switcher-tab[data-active="true"]{background:var(--dsw-specific-sidebar-nav-item-active)}
.dsh-chat-switcher-tab-icon{flex:none;display:flex;align-items:center}
.dsh-chat-switcher-tab-label{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dsh-chat-switcher[data-rail="true"]{flex-direction:column;align-items:center;margin:0 0 8px}
.dsh-chat-switcher[data-rail="true"] .dsh-chat-switcher-tab{height:36px;width:36px;border-radius:50%;padding:0;flex:none}
.dsh-chat-switcher[data-rail="true"] .dsh-chat-switcher-tab-label{display:none}

.dsh-chat-newchat{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-button-elevated-fill);height:38px;width:calc(100% - 4px);color:var(--dsw-alias-label-primary);cursor:pointer;border-radius:12px;flex:none;justify-content:center;align-items:center;gap:6px;margin:0 2px 8px;padding:8px 16px;font-size:14px;font-weight:500;line-height:22px;display:flex;overflow:hidden;font-family:var(--dsw-font-family)}
.dsh-chat-newchat:hover{background:var(--dsw-alias-button-floating-hover)}
.dsh-chat-newchat-label{white-space:nowrap;max-width:200px;overflow:hidden}
.dsh-chat-newchat[data-rail="true"]{background:0 0;border-color:#0000;align-self:flex-start;gap:0;width:36px;height:36px;margin:0 0 12px;padding:0}
.dsh-chat-newchat[data-rail="true"]:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dsh-chat-newchat[data-rail="true"] .dsh-chat-newchat-label{max-width:0}

/* Code mode (default): hide the Chat workspace + the New chat button. */
[data-dsh-chat-workspace="true"] { display: none !important; }
.dsh-chat-newchat { display: none !important; }
/* Chat mode: show only the Chat workspace; hide other groups + picker + New Session. */
html[data-dsh-chat-mode="chat"] [data-dsh-chat-workspace="true"] { display: block !important; }
html[data-dsh-chat-mode="chat"] [class*="groupSection"]:not([data-dsh-chat-workspace="true"]) { display: none !important; }
html[data-dsh-chat-mode="chat"] [class*="searchSlot"] { display: none !important; }
html[data-dsh-chat-mode="chat"] [class*="headerActions"] { display: none !important; }
html[data-dsh-chat-mode="chat"] button[class*="newSession"] { display: none !important; }
html[data-dsh-chat-mode="chat"] .dsh-chat-newchat { display: flex !important; }
/* Chat mode only: hide the "Workspaces" section header, and drop the collapse
   chevron so chat workspaces read as always-shown (not collapsible). */
html[data-dsh-chat-mode="chat"] [class*="sectionHeader"] { display: none !important; }
html[data-dsh-chat-mode="chat"] [data-dsh-chat-workspace="true"] [class*="chevron"] { display: none !important; }
/* Chat mode only: hide the workspace folder bar entirely so chats read as a
   flat list (no "Chat · <id>" bars). */
html[data-dsh-chat-mode="chat"] [data-dsh-chat-workspace="true"] [class*="projectRow"] { display: none !important; }
/* Chat mode OR chat session: collapse the hero's workspace chip + agent
   preset row (Code concepts) so a fresh chat reads as a plain composer. We
   hide it with visibility + height:0 + overflow:hidden — NOT display:none —
   so the chip keeps a non-zero anchor rect. The workspace picker menu is
   portaled from that chip's rect, and a display:none chip has a 0×0 rect,
   which flings the menu to the top of the screen. */
html[data-dsh-chat-mode="chat"] [class*="heroWorkspaceRow"],
html[data-dsh-chat-session="true"] [class*="heroWorkspaceRow"] {
  visibility: hidden !important;
  height: 0 !important;
  overflow: hidden !important;
}

/* Chat SESSIONS only (current open session lives in a chat workspace): hide
   the workspace/access-mode/preset/status chrome the Code view shows. */
html[data-dsh-chat-session="true"] button[aria-label*="Access mode"] { display: none !important; }
html[data-dsh-chat-session="true"] [class*="cardWorkspaceTrigger"] { display: none !important; }
html[data-dsh-chat-session="true"] button[aria-selected]:not([class*="dsh-chat-switcher-tab"]) { display: none !important; }
html[data-dsh-chat-session="true"] button[class*="seat"] { display: none !important; }
html[data-dsh-chat-session="true"] [class*="sessionLogButton"] { display: none !important; }
html[data-dsh-chat-session="true"] [class*="SVAs4q_label"] { display: none !important; }
/* The composer "+" button (command/attachment launcher) is Code chrome. It's
   the sole aria-haspopup="listbox" button, so CSS-hide it to avoid a flash. */
html[data-dsh-chat-session="true"] button[aria-haspopup="listbox"] { display: none !important; }
/* The session stats readout ("N turns · M steps | LLM …") lives in the
   composer.dock slot. Hide it via CSS (keyed on the stable data-slot anchor)
   so it never flashes in before a JS content-match can remove it. */
html[data-dsh-chat-session="true"] [data-slot="conversation.composer.dock"] { display: none !important; }
/* Chat sessions: with the tabs hidden the header has no bottom padding —
   even it out so the title sits symmetrically. */
html[data-dsh-chat-session="true"] [class*="wSkVaW_header"] { padding-bottom: 12px; }
`;

    async function apiConfig() {
      const response = await fetch('/api/dsh-chat/config');
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
      return body;
    }

    async function apiNewFolder() {
      const response = await fetch('/api/dsh-chat/folder', { method: 'POST' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
      return body;
    }

    function ModeSwitcher({ mode, onMode, rail, t }) {
      return h('div', { className: 'dsh-chat-switcher', 'data-rail': String(rail), role: 'tablist', 'aria-label': 'dsh-chat' },
        h('button', {
          type: 'button', className: 'dsh-chat-switcher-tab', role: 'tab',
          'aria-selected': String(mode === 'chat'), 'data-active': String(mode === 'chat'),
          onClick: () => onMode('chat'),
        },
          h('span', { className: 'dsh-chat-switcher-tab-icon' }, h(IconHome, { size: 16 })),
          h('span', { className: 'dsh-chat-switcher-tab-label' }, t('chat')),
        ),
        h('button', {
          type: 'button', className: 'dsh-chat-switcher-tab', role: 'tab',
          'aria-selected': String(mode === 'code'), 'data-active': String(mode === 'code'),
          onClick: () => onMode('code'),
        },
          h('span', { className: 'dsh-chat-switcher-tab-icon' }, h(IconCode, { size: 16 })),
          h('span', { className: 'dsh-chat-switcher-tab-label' }, t('code')),
        ),
      );
    }

    function NewChatButton({ rail, t, busy, onNewChat }) {
      return h('button', {
        type: 'button', className: 'dsh-chat-newchat', 'data-rail': String(rail),
        onClick: onNewChat, disabled: busy, 'data-dsh-chat-newchat': '',
      },
        h(IconNewChatOutline16, { size: rail ? 18 : 14 }),
        rail ? null : h('span', { className: 'dsh-chat-newchat-label' }, t('newChat')),
      );
    }

    // ---- chat-workspace detection (shared by chrome-hiding + New Session) ----

    // The workspace object hosting the current session, when it's a chat
    // workspace; otherwise undefined. Chat-ness comes from workspace
    // membership (path under the chat root), not the session binding.
    function currentChatWorkspace(ctx) {
      const current = ctx.sessions.list.getSnapshot().current;
      if (current === undefined) return undefined;
      const ws = ctx.workspaces.list.getSnapshot().items.find((w) => Array.isArray(w.sessionIds) && w.sessionIds.includes(current));
      if (ws === undefined || typeof ws.path !== 'string' || chatWorkRoot === '') return undefined;
      return (ws.path === chatWorkRoot || ws.path.startsWith(chatWorkRoot + '/')) ? ws : undefined;
    }

    function isChatSession(ctx) {
      return currentChatWorkspace(ctx) !== undefined;
    }

    function isChatPath(path) {
      return typeof path === 'string' && chatWorkRoot !== '' && (path === chatWorkRoot || path.startsWith(chatWorkRoot + '/'));
    }

    // A filtered replacement for the stock workspace picker
    // (`conversation.hero.workspace`): lists only NON-chat workspaces so Code's
    // "change workspace" menu never offers the per-chat temp-folder workspaces
    // (which otherwise accumulate one entry per chat and, when the list grows
    // long, get shoved off-screen by the Menu's viewport clamp). Registered at a
    // lower slot priority so it shadows the default WorkspacePicker. "Add
    // workspace" opens a small in-picker folder browser (listDirectory) so the
    // create-a-workspace affordance survives the replacement.
    const ADD_WORKSPACE = "::add-workspace";

    function FolderBrowser({ open, onClose, onPick, listDirectory, createWorkspace, t }) {
      const [listing, setListing] = useState(null);
      const [cwd, setCwd] = useState(undefined);
      const [error, setError] = useState(null);
      const [busy, setBusy] = useState(false);

      useEffect(() => {
        if (!open) { setListing(null); setCwd(undefined); setError(null); return; }
        let cancelled = false;
        setBusy(true);
        setError(null);
        listDirectory(cwd)
          .then((l) => { if (!cancelled) { setListing(l); setCwd(l.path); } })
          .catch((e) => { if (!cancelled) setError(e && e.message ? String(e.message) : String(e)); })
          .finally(() => { if (!cancelled) setBusy(false); });
        return () => { cancelled = true; };
      }, [open, cwd, listDirectory]);

      const useThis = async () => {
        if (!listing || busy) return;
        setBusy(true);
        try {
          const ws = await createWorkspace({ path: listing.path });
          onPick(ws.workspaceId);
        } catch (e) {
          setError(e && e.message ? String(e.message) : String(e));
          setBusy(false);
        }
      };

      return h(Modal, {
        open,
        onClose,
        title: t('addWorkspace'),
        closeLabel: t('cancel'),
        footer: h(React.Fragment, null,
          h(Button, { variant: 'outline', onClick: onClose }, t('cancel')),
          h(Button, { variant: 'primary', onClick: useThis, disabled: busy || listing === null }, t('useFolder')),
        ),
      },
        listing === null
          ? h('div', null, error ?? t('loading'))
          : h('div', { style: { display: 'flex', flexDirection: 'column', gap: 8, minWidth: 360 } },
              h('div', { style: { display: 'flex', alignItems: 'center', gap: 4, overflowX: 'auto', padding: '2px 0 8px', whiteSpace: 'nowrap', scrollbarWidth: 'thin' } },
                (listing.crumbs || []).map((c, i) => {
                  const isLast = i === listing.crumbs.length - 1;
                  const pill = h('button', {
                    key: c.path,
                    type: 'button',
                    onClick: () => { if (!isLast) { setError(null); setCwd(c.path); } },
                    style: {
                      flexShrink: 0,
                      cursor: isLast ? 'default' : 'pointer',
                      border: 'none',
                      borderRadius: 999,
                      padding: '4px 11px',
                      fontSize: 13,
                      lineHeight: '18px',
                      background: isLast ? 'var(--dsw-specific-sidebar-nav-item-active)' : 'var(--dsw-alias-interactive-bg-hover)',
                      color: isLast ? 'var(--dsw-alias-label-primary)' : 'var(--dsw-alias-label-secondary)',
                    },
                  }, c.name || '/');
                  if (i === 0) return pill;
                  return h(React.Fragment, { key: c.path },
                    h('span', { style: { color: 'var(--dsw-alias-label-caption)', fontSize: 13, flexShrink: 0 } }, '/'),
                    pill,
                  );
                }),
              ),
              error !== null && h('div', { style: { color: 'var(--dsw-alias-state-error-primary)', fontSize: 12 } }, error),
              h('div', { style: { maxHeight: 300, overflowY: 'auto', display: 'flex', flexDirection: 'column' } },
                (listing.entries || []).map((e) => h('div', {
                  key: e.path,
                  onClick: () => { setError(null); setCwd(e.path); },
                  style: { cursor: 'pointer', padding: '6px 8px', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 8 },
                }, h(IconFolderClose16, { size: 16 }), h('span', null, e.name))),
                (listing.entries || []).length === 0 && h('div', { style: { color: 'var(--dsw-alias-label-tertiary)', fontSize: 13, padding: '8px 0' } }, '—'),
              ),
            )
      );
    }

    function FilteredWorkspacePicker({ open, anchorRef, selectedId, onPick, onClose, useWorkspaces, createWorkspace, listDirectory, t }) {
      const snapshot = useWorkspaces((s) => s);
      const workspaces = snapshot === null || snapshot === undefined ? [] : (snapshot.items ?? []);
      const [browserOpen, setBrowserOpen] = useState(false);
      const items = workspaces
        .filter((w) => !isChatPath(w.path))
        .map((w) => ({
          id: w.workspaceId,
          label: w.title,
          icon: h(IconFolderClose16, { size: 16 }),
        }));
      const addEntries = [{ id: ADD_WORKSPACE, label: t('addWorkspace'), icon: h(IconPlusOutline16, { size: 16 }) }];
      const getAnchorRect = useCallback(() => anchorRef && anchorRef.current ? anchorRef.current.getBoundingClientRect() : null, [anchorRef]);
      return h(React.Fragment, null,
        h(Menu, {
          open: open && !browserOpen,
          anchor: null,
          items,
          footer: addEntries,
          selectedId,
          onSelect: (id) => { if (id === ADD_WORKSPACE) { setBrowserOpen(true); onClose(); return; } onPick(id); },
          onClose,
          side: 'bottom',
          portal: true,
          getAnchorRect,
        }),
        h(FolderBrowser, {
          open: browserOpen,
          onClose: () => setBrowserOpen(false),
          onPick: (id) => { setBrowserOpen(false); onPick(id); },
          listDirectory,
          createWorkspace,
          t,
        }),
      );
    }

    // Most-recent workspace that is NOT a chat workspace (mirrors the runtime's
    // `recentWorkspace` tie-break, but skips chat folders). Used so Code's "New
    // Session" never inherits a chat workspace from the current chat session.
    function recentNonChatWorkspaceId(ctx) {
      const snap = ctx.workspaces.list.getSnapshot();
      const sessions = ctx.sessions.list.getSnapshot();
      let selected, selectedTime = Number.NEGATIVE_INFINITY;
      for (const ws of snap.items) {
        if (typeof ws.path === 'string' && chatWorkRoot !== '' && (ws.path === chatWorkRoot || ws.path.startsWith(chatWorkRoot + '/'))) continue;
        let latest = Number.NEGATIVE_INFINITY;
        for (const sid of ws.sessionIds || []) {
          const s = sessions.byId && sessions.byId[sid];
          if (s !== undefined) latest = Math.max(latest, s.updatedAt);
        }
        if (latest === Number.NEGATIVE_INFINITY) latest = Date.parse(ws.createdAt);
        if (selected === undefined || latest > selectedTime) { selected = ws.workspaceId; selectedTime = latest; }
      }
      return selected;
    }

    // Most-recent chat workspace that still has a BLANK (no-message) session —
    // a candidate to reuse instead of minting yet another chat folder. Reusing
    // a blank chat stops reloads/New-chat from accumulating an empty chat
    // workspace each time (which also bloats Code's workspace picker and, when
    // the list grows long, shoves the picker menu off-screen).
    function mostRecentBlankChatWorkspaceId(ctx) {
      if (chatWorkRoot === '') return undefined;
      const snap = ctx.workspaces.list.getSnapshot();
      const sessions = ctx.sessions.list.getSnapshot();
      let selected, selectedTime = Number.NEGATIVE_INFINITY;
      for (const ws of snap.items) {
        if (typeof ws.path !== 'string' || !(ws.path === chatWorkRoot || ws.path.startsWith(chatWorkRoot + '/'))) continue;
        let hasBlank = false;
        for (const sid of ws.sessionIds || []) {
          const s = sessions.byId && sessions.byId[sid];
          if (s !== undefined && s.blank) { hasBlank = true; break; }
        }
        if (!hasBlank) continue;
        let latest = Number.NEGATIVE_INFINITY;
        for (const sid of ws.sessionIds || []) {
          const s = sessions.byId && sessions.byId[sid];
          if (s !== undefined) latest = Math.max(latest, s.updatedAt);
        }
        if (latest === Number.NEGATIVE_INFINITY) latest = Date.parse(ws.createdAt);
        if (selected === undefined || latest > selectedTime) { selected = ws.workspaceId; selectedTime = latest; }
      }
      return selected;
    }

    // Hide chat workspaces ("Chat · …") from any workspace picker menu so Code's
    // New Session / Choose-workspace selectors never offer them.
    function hideChatPickerEntries() {
      for (const label of document.querySelectorAll('[class*="itemLabel"]')) {
        if (label.textContent.trim().startsWith('Chat · ')) {
          const wrap = label.closest('[class*="itemWrap"]');
          if (wrap) wrap.style.display = 'none';
        }
      }
    }

    // Hide the session stats line ("N turns · M steps | LLM … | …") for chat
    // sessions — its class is build-hashed, so match by content. The full line
    // (turns/LLM/tool/TTFT/tokens/cache) easily exceeds 120 chars, so keep the
    // ceiling generous while still excluding whole-conversation roots.
    function hideChatStatusLine() {
      for (const el of document.querySelectorAll('[class*="root"]')) {
        const t = (el.textContent || '').trim();
        if (t.length > 0 && t.length < 600 && /^\d+\s+turns/i.test(t)) {
          el.style.display = 'none';
        }
      }
    }

    // Chat composer placeholder. The native placeholder text is React-driven and
    // locale-bound, so we swap the attribute imperatively: capture React's value
    // (restored on exit) and re-apply ours. Runs synchronously in the DOM
    // observer (before paint — no flash) and again in detect (poll/subscribe) to
    // recover React's placeholder after a phase change (blank → active).
    const CHAT_PLACEHOLDER = "How can I help you today?";
    function setChatPlaceholder() {
      const ta = document.querySelector('textarea[data-phase]');
      if (ta === null) return;
      const chat = document.documentElement.getAttribute('data-dsh-chat-session') === 'true';
      if (chat) {
        if (ta.placeholder !== CHAT_PLACEHOLDER) {
          ta.dataset.chatOriginal = ta.placeholder;
          ta.placeholder = CHAT_PLACEHOLDER;
        }
        ta.dataset.chatApplied = '1';
      } else if (ta.dataset.chatApplied === '1') {
        ta.placeholder = ta.dataset.chatOriginal || '';
        delete ta.dataset.chatApplied;
        delete ta.dataset.chatOriginal;
      }
    }

    // Recompute the chat-session flag + DOM hiding, then reflect it on <html>
    // for CSS. Runs EARLY (subscribed to the session store during plugin boot)
    // so the flag flips before the session header first paints — no flash.
    function detect(ctx) {
      const chat = isChatSession(ctx);
      document.documentElement.setAttribute('data-dsh-chat-session', chat ? 'true' : 'false');
      if (chat) hideChatStatusLine();
      hideChatPickerEntries();
      setChatPlaceholder();
    }

    function sidebarRoot() {
      const column = document.querySelector('[data-pane="sidebar"], [class*="sidebarCol"]');
      if (column === null) return undefined;
      return column.querySelector('[class*="logoRow"]')?.parentElement ?? column.firstElementChild;
    }

    const SHELL_ATTR = 'data-dsh-chat-shell';

    function startShell(ctx, t) {
      if (document.querySelector('[' + SHELL_ATTR + ']') !== null) return () => {};

      const shell = document.createElement('div');
      shell.setAttribute(SHELL_ATTR, '');
      shell.style.display = 'none';
      document.body.appendChild(shell);

      const anchors = { switcher: undefined, newchat: undefined };
      let reactRoot;
      let mounted = false;
      let revision = 0;

      function App({ t, anchors, revision }) {
        void revision;
        // Always land on the Chat tab on a fresh load (no localStorage
        // persistence — remembering "code" surprised users who expected the
        // default Chat landing). Switching tabs still works for the session.
        const [mode, setModeState] = useState('chat');
        const [rail, setRail] = useState(false);
        const [busy, setBusy] = useState(false);

        const setMode = useCallback((next) => {
          setModeState(next);
        }, []);

        useEffect(() => {
          document.documentElement.setAttribute('data-dsh-chat-mode', mode);
          return () => { document.documentElement.removeAttribute('data-dsh-chat-mode'); };
        }, [mode]);

        useEffect(() => {
          const root = sidebarRoot();
          if (!root) return;
          const check = () => setRail(Array.from(root.classList).some((c) => c.includes('collapsed')));
          check();
          const observer = new MutationObserver(check);
          observer.observe(root, { attributes: true, attributeFilter: ['class'] });
          return () => observer.disconnect();
        }, []);

        const newChat = useCallback(async () => {
          if (busy) return;
          // Reuse the most-recent blank chat if one exists — reloads and New
          // chat clicks then focus the existing blank chat instead of minting
          // an empty workspace each time.
          const reuse = mostRecentBlankChatWorkspaceId(ctx);
          if (reuse !== undefined) {
            ctx.workspaces.startSession(reuse);
            return;
          }
          setBusy(true);
          try {
            // Mint an isolated temp folder, register it as a workspace, then
            // start a session in it — same code path as the "+" button.
            const folder = await apiNewFolder();
            const workspace = await ctx.workspaces.create({ path: folder.path });
            // The create RPC drops the title (workspace gets the folder UUID
            // basename). Workspace titles must be unique, so use a unique
            // "Chat · <shortId>" title — the client filters on the "Chat · "
            // prefix.
            const shortId = folder.path.split('/').pop().slice(0, 8);
            try { await ctx.workspaces.rename(workspace.workspaceId, `Chat · ${shortId}`); } catch { /* best effort */ }
            ctx.workspaces.startSession(workspace.workspaceId);
          } catch (e) {
            console.log('[dsh-chat] new chat failed', e.message);
          } finally {
            setBusy(false);
          }
        }, [busy, ctx.workspaces, ctx.sessions]);

        // On first load, land on the Chat tab with a fresh chat open: wait for
        // the host config (chat root), then open a new chat unless a CHAT
        // session is already current. Runs once.
        const autoOpened = useRef(false);
        useEffect(() => {
          let stopped = false;
          const timer = setInterval(() => {
            if (stopped || autoOpened.current) return;
            if (chatWorkRoot === '') return; // config not ready yet
            autoOpened.current = true;
            if (!isChatSession(ctx)) newChat();
          }, 300);
          return () => { stopped = true; clearInterval(timer); };
        }, [newChat, ctx.sessions, ctx.workspaces]);

        return h(React.Fragment, null,
          createPortal(h(ModeSwitcher, { mode, onMode: setMode, rail, t }), anchors.switcher),
          createPortal(h(NewChatButton, { rail, t, busy, onNewChat: newChat }), anchors.newchat),
        );
      }

      function markChatWorkspace() {
        const groups = document.querySelectorAll('[class*="groupSection"]');
        for (const group of groups) {
          const title = group.querySelector('[class*="title"]');
          const text = title !== null ? title.textContent.trim() : '';
          // Chat workspaces carry a unique "Chat · <shortId>" title; match the
          // prefix so every chat workspace (not just the first) is tagged.
          if (text.startsWith('Chat · ')) {
            group.setAttribute('data-dsh-chat-workspace', 'true');
            // Always expanded: click the folder row to open a collapsed group.
            if (group.querySelector('[class*="arrowOpen"]') === null) {
              const row = group.querySelector('[class*="projectRow"]');
              if (row) row.click();
            }
          }
        }
      }

      const ensureAnchors = () => {
        const root = sidebarRoot();
        if (root === undefined) return false;
        let recreated = false;
        if (anchors.switcher === undefined || !anchors.switcher.isConnected) {
          const logoRow = root.querySelector('[class*="logoRow"]');
          const fresh = document.createElement('div');
          fresh.className = 'dsh-chat-switcher-anchor';
          if (logoRow !== null && logoRow.nextSibling !== null) root.insertBefore(fresh, logoRow.nextSibling);
          else root.insertBefore(fresh, root.firstElementChild);
          anchors.switcher = fresh;
          recreated = true;
        }
        if (anchors.newchat === undefined || !anchors.newchat.isConnected) {
          const fresh = document.createElement('div');
          fresh.className = 'dsh-chat-newchat-anchor';
          anchors.switcher.insertAdjacentElement('afterend', fresh);
          anchors.newchat = fresh;
          recreated = true;
        }
        if (!mounted) {
          const { createRoot } = require("react-dom/client");
          reactRoot = createRoot(shell);
          reactRoot.render(h(App, { t, anchors, revision }));
          mounted = true;
          console.log('[dsh-chat] shell mounted');
        } else if (recreated) {
          revision += 1;
          reactRoot.render(h(App, { t, anchors, revision }));
        }
        return true;
      };

      const waitObserver = new MutationObserver(() => { ensureAnchors(); markChatWorkspace(); });
      waitObserver.observe(document.body, { childList: true, subtree: true });
      markChatWorkspace();
      ensureAnchors();

      return () => {
        waitObserver.disconnect();
        if (reactRoot) { try { reactRoot.unmount(); } catch { /* noop */ } }
        shell.remove();
        [anchors.switcher, anchors.newchat].forEach((el) => { if (el) { try { el.remove(); } catch { /* noop */ } } });
        document.documentElement.removeAttribute('data-dsh-chat-mode');
      };
    }

    const inject = ["locale", "workspaces", "sessions", "slots"];

    function apply(ctx) {
      // Inject the stylesheet synchronously (before the app paints), so the
      // default-hidden chrome never flashes in.
      const tagId = '@dsh-chat/chat.css';
      if (typeof document !== 'undefined' && document.querySelector('style[data-plugin-css=' + JSON.stringify(tagId) + ']') === null) {
        const tag = document.createElement('style');
        tag.dataset.plugin = 'dsh-chat';
        tag.dataset.pluginCss = tagId;
        tag.textContent = css;
        document.head.appendChild(tag);
      }

      // Apply the Chat default synchronously (before React mounts), so the
      // tab-dependent sidebar filtering has no first-paint flash.
      document.documentElement.setAttribute('data-dsh-chat-mode', 'chat');
      // Default to "chat session" (chrome hidden) until the session baseline
      // resolves; the subscription below corrects it before the header paints.
      document.documentElement.setAttribute('data-dsh-chat-session', 'true');

      // Load the chat work root from the host (portable, no hardcoded path).
      apiConfig().then((cfg) => {
        if (typeof cfg.workRoot === 'string' && cfg.workRoot !== '') {
          chatWorkRoot = cfg.workRoot;
          detect(ctx);
        }
      }).catch((e) => console.log('[dsh-chat] config failed', e && e.message));

      // Chat-session detection: subscribe to the session + workspace stores
      // EARLY (during boot) so the flag flips before the session header first
      // paints. A debounced document MutationObserver re-runs it when
      // chrome/pickers appear; a slow poll is the ultimate fallback.
      let unsubSessions = () => {}, unsubWorkspaces = () => {};
      try { unsubSessions = ctx.sessions.list.subscribe(() => detect(ctx)) ?? (() => {}); } catch { /* no subscribe */ }
      try { unsubWorkspaces = ctx.workspaces.list.subscribe(() => detect(ctx)) ?? (() => {}); } catch { /* no subscribe */ }
      detect(ctx);
      let domTimer = null;
      const scheduleDetect = () => {
        if (domTimer !== null) return;
        domTimer = setTimeout(() => { domTimer = null; detect(ctx); }, 30);
      };
      const domObserver = new MutationObserver(() => {
        // Synchronous (microtask) — the picker menu is committed before paint,
        // so hiding the chat entries + swapping the placeholder here happens
        // before it is ever visible (no "long list" / placeholder flash). The
        // heavier attribute/status detect stays debounced.
        hideChatPickerEntries();
        setChatPlaceholder();
        scheduleDetect();
      });
      domObserver.observe(document.body, { childList: true, subtree: true });
      const poll = setInterval(() => detect(ctx), 1000);

      // Code mode's "New Session" must never land in a chat workspace — not via
      // the current chat session, and not via the recent-workspace projection
      // (which points at the latest chat after auto-open). Intercept the native
      // New Session entry points (logo brand + New Session button, both
      // class-hashed) in capture phase and route to the most-recent non-chat
      // workspace instead.
      const onNewSessionClick = (e) => {
        if (document.documentElement.getAttribute('data-dsh-chat-mode') !== 'code') return;
        const el = e.target && typeof e.target.closest === 'function' ? e.target : null;
        const btn = el ? el.closest('button[class*="newSession"], button[class*="brand"]') : null;
        if (btn === null) return;
        const current = ctx.sessions.list.getSnapshot().current;
        const currentIsChat = current !== undefined && isChatSession(ctx);
        // Only steer when the native resolution would land in a chat workspace:
        // the current session is a chat, or there is no current session (so
        // startSession falls back to recentWorkspaceId, which may be a chat).
        if (!currentIsChat && current !== undefined) return;
        e.preventDefault();
        e.stopPropagation();
        const nonChat = recentNonChatWorkspaceId(ctx);
        if (nonChat !== undefined) ctx.workspaces.startSession(nonChat);
        else ctx.sessions.clear(); // no code workspace yet → show Code's empty state
      };
      document.addEventListener('click', onNewSessionClick, true);

      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-chat: dictionaries');
      // Shadow the stock workspace picker with a chat-filtered one (lower slot
      // priority wins). This keeps Code's "change workspace" menu free of the
      // per-chat workspaces at the data level, before the menu ever measures.
      ctx.effect(() => ctx.slots.inject("conversation.hero.workspace", () =>
        ctx.slots.register({
          name: "conversation.hero.workspace",
          priority: -1,
          locale: NS,
          inject: () => ({
            createWorkspace: (input) => ctx.workspaces.create(input),
            listDirectory: (path, signal) => ctx.workspaces.listDirectory(path, signal),
          }),
        }, FilteredWorkspacePicker)
      ), 'dsh-chat: workspace picker');
      ctx.effect(() => {
        const t = ctx.locale.bind(NS);
        const dispose = startShell(ctx, t);
        return () => { dispose(); };
      }, 'dsh-chat: shell');
      ctx.effect(() => () => {
        clearInterval(poll);
        if (domTimer !== null) clearTimeout(domTimer);
        domObserver.disconnect();
        unsubSessions();
        unsubWorkspaces();
        document.removeEventListener('click', onNewSessionClick, true);
        document.documentElement.removeAttribute('data-dsh-chat-session');
      }, 'dsh-chat: dispose');
    }

    exports.apply = apply;
    exports.inject = inject;
    exports.__test = { ModeSwitcher, NewChatButton };
    return module.exports;
  }
});
