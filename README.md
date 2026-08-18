# dsh-chat

Claude Desktop-style **Chat | Code** tabs for the [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) web GUI.

The Chat tab is **1:1 with Code** — not a toy mode. Chats are real DSH
sessions with the full agent toolset (bash, file access, subagents, the whole
toolbelt), each isolated in its own temporary workspace. Code stays exactly as
you left it.

## What it does

- Adds a **Chat | Code** tab bar to the sidebar. **Chat is the default landing tab.**
- **Chat** shows a flat list of your chats plus a **New chat** button (visually
  identical to New Session). Every chat is a real session in a fresh
  temp-folder workspace, so nothing leaks between chats and every chat gets the
  complete agent + tools.
- **Code** is untouched — the stock DSH workspace/session experience, full stop.
- Everything the client changes is scoped to the Chat tab via
  `data-dsh-chat-*` attributes, so Code mode keeps the stock UI.

## Features

- Real sessions, real tools — one isolated workspace per chat.
- Chat workspaces are hidden from Code's workspace picker (they live under a
  `Chat · ` title prefix and are filtered out).
- Code's **New Session** never accidentally lands in a chat workspace, even
  when a chat is the currently-open session.
- Tab choice persists across reloads (`localStorage`).

## How it works

Everything in DSH is a plugin; `dsh-chat` is a dual-face one.

- **Host** (`lib/index.js`) — thin. Mints a fresh temp folder per chat under
  `~/.dsh/dsh-chat-work/<uuid>` and serves two routes, both behind the
  loopback + `--trusted-host` browser fence:
  - `GET  /api/dsh-chat/config` → `{ workRoot, title }`
  - `POST /api/dsh-chat/folder` → `{ path, title }`
- **Client** (`lib/client.js`) — renders the Chat | Code tab bar and the
  New chat button, and drives workspace filtering. New chat runs the *official*
  `ctx.workspaces.startSession()` flow — the exact code path the workspace "+"
  button uses — so a chat is created, listed, and opened exactly like a Code
  session.

No personal data is baked in: the chat workspace root is derived from
`homedir()` at runtime on the host and fetched by the client from
`/api/dsh-chat/config` (nothing hardcoded, no machine-specific paths).

## Install

Requires a DeepSeek Harness installation with a `web` profile.

```bash
# 1. add the package to your web profile
dsh plugin --profile web add github:anaqi-blvl/dsh-plugin-chat#main

# 2. register it in the bundle list — edit $DSH_HOME/profiles/web/package.json
#    and add "dsh-chat" under dsh.profile.bundles, e.g.:
#      "dsh": { "profile": { "bundles": ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app", "dsh-chat"] } }

# 3. restart the web profile
```

Local development:

```bash
git clone git@github.com:anaqi-blvl/dsh-plugin-chat.git
dsh plugin --profile web add link:/path/to/dsh-plugin-chat
# ...then the same bundles step above, and restart
```

If you reach the UI from a non-loopback host (e.g. another machine on your
LAN), pass its authority to the browser-trust fence so the `/api/dsh-chat/*`
routes accept it:

```bash
dsh web --trusted-host 192.168.1.20:8080
```

## Usage

- **Chat** (default): type to start a chat; **New chat** opens a fresh,
  isolated chat with the full agent toolset.
- **Code**: the stock workspace/session experience.
- Switch tabs any time — chats and code sessions coexist.

## Layout

```
dsh-plugin-chat/
├── package.json         # dual-face manifest (exports "." + "./client")
├── cordis.patch.yml     # bundle patch that inserts the plugin row
└── lib/
    ├── index.js         # host: /api/dsh-chat routes + temp-folder minting
    └── client.js        # browser: Chat|Code tabs, New chat, filtering
```

## License

MIT
