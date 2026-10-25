<div align="center">
<img src="https://i.ibb.co/ZzZG1ngL/file-0000000032ec821199d726e057a1ad58.png" alt="Miku — Multi-Session WhatsApp Bot" width="100%" />
<h1>Miku — Multi-Session WhatsApp Bot</h1>
<p><strong>One bot. Multiple WhatsApp accounts. A modular plugin system.</strong></p>
<p>
<a href="https://nodejs.org/"><img src="https://img.shields.io/badge/Node.js-22.13%2B-339933?style=for-the-badge&amp;logo=nodedotjs&amp;logoColor=white" alt="Node.js 22.13 or newer" /></a>
<a href="https://github.com/WhiskeySockets/Baileys"><img src="https://img.shields.io/badge/Baileys-7.0-25D366?style=for-the-badge&amp;logo=whatsapp&amp;logoColor=white" alt="Baileys" /></a>
<a href="https://github.com/nightx-rebel/socksy"><img src="https://img.shields.io/badge/Powered%20by-Socksy-ff4d94?style=for-the-badge" alt="Powered by Socksy" /></a>
</p>
<p>
<a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue?style=flat-square" alt="MIT License" /></a>
<img src="https://img.shields.io/badge/JavaScript-ESM-f7df1e?style=flat-square&amp;logo=javascript&amp;logoColor=black" alt="JavaScript ES modules" />
<img src="https://img.shields.io/badge/Docker-Supported-2496ED?style=flat-square&amp;logo=docker&amp;logoColor=white" alt="Docker supported" />
<img src="https://img.shields.io/badge/Commands-200%2B-ff69b4?style=flat-square" alt="200 or more commands" />
</p>
<p>
<a href="#features">Features</a> ·
<a href="#quick-start">Quick Start</a> ·
<a href="#pair-your-whatsapp">Pair WhatsApp</a> ·
<a href="#deployment">Deployment</a> ·
<a href="#write-your-own-plugin">Plugins</a> ·
<a href="#security">Security</a>
</p>
</div>


## Table of Contents

- [About](#about)
- [Features](#features)
- [Powered by Socksy](#powered-by-socksy)
- [Quick Start](#quick-start)
- [Pair Your WhatsApp](#pair-your-whatsapp)
- [Deployment](#deployment)
  - [Heroku](#deploy-to-heroku)
  - [Railway](#deploy-to-railway)
  - [Game and Bot Hosting Panels](#deploy-to-a-hosting-panel)
  - [Local and Termux](#run-locally)
  - [Docker](#deploy-with-docker)
- [How to Use](#how-to-use)
- [Environment Variables](#environment-variables)
- [HTTP API](#http-api)
- [Telegram Control Bot](#telegram-control-bot)
- [Command Categories](#command-categories)
- [Write Your Own Plugin](#write-your-own-plugin)
- [Project Structure](#project-structure)
- [Troubleshooting](#troubleshooting)
- [Security](#security)
- [License](#license)

---

## About

**Miku** is a modular, plugin-based WhatsApp bot built with Node.js and Baileys. It can manage multiple WhatsApp accounts from a single deployment, with shared tooling for commands, events, session management, and storage.

### Why Miku?

- **Multi-session support** — manage multiple WhatsApp numbers from one process.
- **Pairing-code login** — link a WhatsApp account without scanning a QR code.
- **Plugin-based commands and events** — keep features separated into individual files.
- **Session management** — restore saved sessions and control them through an HTTP API or Telegram bot.
- **Queues and limits** — configure concurrency, task timeouts, duplicate suppression, and command rate limits.
- **Flexible storage** — use local SQLite or PostgreSQL for authentication data, with optional Turso settings sync.

> [!TIP]
> Use `.menu` to view commands loaded by the running instance, or `.list` to see command names, aliases, and descriptions. The runtime list is the source of truth because individual plugins can fail to load.

## Features

### Core system

| Feature | Description |
|---|---|
| Multi-session manager | Start, stop, and restore multiple WhatsApp sessions. |
| Pairing-code login | Link a number through WhatsApp's **Linked devices** settings. |
| Plugin loader | Load command and event handlers from plugin files. |
| Hot reload | Add or edit supported plugins and reload them without intentionally disconnecting all sessions. |
| Task scheduler | Configure per-session and global concurrency, queue limits, and timeouts. |
| Message protection | Duplicate suppression, stale-message filtering, and per-sender command rate limits. |
| Graceful shutdown | Handle shutdowns and reduce low-priority work when the event loop is delayed. |
| Multiple storage options | Use SQLite locally or PostgreSQL for authentication storage; optionally sync settings through Turso. |
| Management interfaces | Inspect sessions and loaded plugins through the HTTP API or Telegram control bot. |

### Command capabilities

| Category | Examples |
|---|---|
| 👥 Group management | Moderation, member management, group settings, welcome and goodbye messages |
| ⬇️ Downloaders | YouTube, Instagram, TikTok, Facebook, Twitter, Spotify, MEGA, and other supported sources |
| 🔎 Search | Web, images, GIFs, Wikipedia, lyrics, npm, and app searches |
| 🎨 Media tools | Stickers, image/audio/video conversion, text-to-speech, and image effects |
| 🌸 Anime | Anime, manga, character, and related commands |
| 🎮 Games | Mini-games and interactive commands |
| 🛠️ Utilities and AI | QR tools, weather, screenshots, AI integrations, URL tools, and utilities |
| 👑 Owner tools | Broadcast, profile settings, privacy tools, and block-list management |
| ⚙️ Automation | Auto-read, auto-react, auto-status, anti-call, and other event-based plugins |
| 🙏 Devotional content | Gita, Quran, Ramayana, Bible, and related commands |

The exact commands available depend on which plugins load successfully and which external services are configured.

---

## Powered by Socksy

Miku uses **[Socksy](https://github.com/nightx-rebel/socksy)** as its multi-account socket engine through the `wa-multi-socket` dependency:

```json
"wa-multi-socket": "github:nightx-rebel/socksy"
```

Socksy sits on top of Baileys and provides:

- `MultiSocketManager` — manage, start, stop, and restore sockets.
- `createAuthStore` — persist authentication data using SQLite by default or PostgreSQL when configured.
- A shared event stream for connected WhatsApp accounts.

Want to build another bot on the same engine? Explore the **[Socksy repository](https://github.com/nightx-rebel/socksy)**.

### High-level architecture

```mermaid
flowchart TD
  A["index.js: Startup and HTTP API"] --> B["Session Manager"]
  B --> C["Socksy: Multi-socket engine"]
  C --> D["WhatsApp"]
  C --> E[("Authentication Store: SQLite / PostgreSQL")]
  C --> F["client.js: Events and Queues"]
  F --> G["Plugins"]
  F --> H[("Settings: SQLite + optional Turso sync")]
  A -.-> I["Telegram Control Bot"]
```

---

## Quick Start

### Requirements

- **Node.js 22.13 or newer**
- `git`
- `ffmpeg` for supported media commands

### Install and run

```bash
git clone https://github.com/nightx-rebel/miku.git
cd miku
npm install
npm start
```

Once the server starts, open **`http://localhost:3000`**. A healthy instance should return a response similar to:

```json
{
  "ok": true,
  "status": "Baileys Multi-Session Bot",
  "sessions": 0
}
```

> [!TIP]
> If `PORT` is not set, Miku selects the first available port starting at `3000`. Check your startup logs if it chooses a different port.

---

## Pair Your WhatsApp

Use your phone number with its **country calling code**, digits only. Do not include `+`, spaces, or hyphens.

For example, replace the sample number below with your own number:

```bash
curl http://localhost:3000/pair/919812345678
```

The endpoint should return a pairing code similar to `ABCD-EFGH`.

1. Open WhatsApp on your phone.
2. Go to **Settings → Linked devices → Link a device**.
3. Select **Link with phone number instead**.
4. Enter the pairing code returned by Miku.
5. After the account is linked, send `.menu` in a chat to view available commands.

Miku saves the session for restoration after a restart, subject to your configured storage and deployment persistence.

> [!NOTE]
> Only one pairing attempt per number can run at a time. Do not publish your pairing endpoint: anyone who can access an unprotected endpoint may be able to initiate pairing attempts.

---

## Deployment

Choose the deployment method that matches your hosting environment. Persistent storage is important: losing the authentication store can require you to pair your WhatsApp accounts again.

| Deployment | Best suited for | Important note |
|---|---|---|
| [Heroku](#deploy-to-heroku) | Heroku applications | Use PostgreSQL for login storage; local settings may reset unless synced. |
| [Railway](#deploy-to-railway) | Git-based cloud deployments | Configure PostgreSQL and persistent storage where needed. |
| [Hosting panel](#deploy-to-a-hosting-panel) | Pterodactyl-style and bot panels | Keep the `data/` directory persistent. |
| [Local / Termux](#run-locally) | Linux, macOS, Windows/WSL, and Android Termux | Local SQLite is suitable for a single persistent environment. |
| [Docker](#deploy-with-docker) | Container-based hosting | Mount a persistent volume at `/app/data`. |

### Deploy to Heroku

<a href="https://heroku.com/deploy?template=https://github.com/nightx-rebel/miku"><img src="https://www.herokucdn.com/deploy/button.svg" alt="Deploy Miku to Heroku" height="42" /></a>

1. Select the deploy button and sign in to Heroku.
2. Choose an application name and region.
3. Configure the optional environment variables as needed.
4. Deploy the application.
5. Open `https://YOUR-APP.herokuapp.com/pair/YOUR_NUMBER` to request a pairing code.

The repository's Heroku deployment configuration is intended to provide:

- Node.js and FFmpeg buildpacks.
- A PostgreSQL add-on connected through `DATABASE_URL` for WhatsApp authentication storage.
- A `web` dyno defined by the `Procfile`.

> [!WARNING]
> The local filesystem on Heroku is temporary. PostgreSQL can preserve authentication data, but settings stored only in local files may reset after a restart or redeploy. Configure both `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` if your deployment uses Turso settings sync.

### Deploy to Railway

<a href="https://railway.com/new"><img src="https://railway.com/button.svg" alt="Deploy on Railway" height="42" /></a>

1. Open Railway and choose **Deploy from GitHub repo**.
2. Select your fork of `nightx-rebel/miku`.
3. Add a PostgreSQL database to the project.
4. In the Miku service's **Variables** section, set the database URL. For a service named `Postgres`, the reference may look like this:

   ```dotenv
   DATABASE_URL=${{Postgres.DATABASE_URL}}
   ```

5. Add any other environment variables you need.
6. Under **Settings → Networking**, generate a public domain if you need external access.
7. Open `https://YOUR-DOMAIN/pair/YOUR_NUMBER` to request a pairing code.

**Persistence:** if settings or other files must survive redeployments, configure an appropriate persistent volume for the application's data directory.

> [!WARNING]
> In this configuration, setting `RAILWAY_STATIC_URL` or `WEBHOOK_BASE_URL` switches the Telegram bot to webhook mode, but the project does not currently include a webhook receiver. Leave both variables unset to use polling.

### Deploy to a Hosting Panel

These steps are for Pterodactyl-style game or bot hosting panels and similar environments.

1. Create a server with a **Node.js 22 or newer** runtime.
2. Upload and extract the project, or clone it into the server directory:

   ```bash
   git clone https://github.com/nightx-rebel/miku.git .
   ```

3. Configure the startup settings:

   | Setting | Value |
   |---|---|
   | Main file | `index.js` |
   | Startup command | `npm install && node index.js` |
   | Node.js version | `22` or newer |

4. Add the environment variables you need. For example:

   ```dotenv
   PORT=<your-server-port>
   DATABASE_URL=<postgres-url>
   BOT_TOKEN=<telegram-token>
   ```

   `DATABASE_URL` and `BOT_TOKEN` are optional when you do not need those integrations.

5. Start the server and open `http://SERVER-IP:PORT/pair/YOUR_NUMBER`.

> [!TIP]
> If your panel provides persistent disk storage, local SQLite can work without PostgreSQL. Keep the `data/` directory between restarts and deployments. Ask your host whether `ffmpeg` is installed if media commands fail.

### Run Locally

Miku can run on Linux, macOS, Windows (WSL recommended), and **Termux on Android**, provided the required runtime and dependencies are available.

```bash
# Install Node.js 22.13+ and ffmpeg first.
git clone https://github.com/nightx-rebel/miku.git
cd miku
npm install

# Optional: create a local environment file.
echo "PORT=3000" > .env

npm start
```

#### Keep it running with PM2

PM2 is included as a project dependency in the supplied configuration. You can launch it with `npx`:

```bash
npx pm2 start index.js --name miku
npx pm2 logs miku
npx pm2 save
```

> [!TIP]
> Without `DATABASE_URL`, the local storage configuration uses the `data/` directory and SQLite. Back up that directory before upgrading or moving the deployment.

### Deploy with Docker

Build the image and start a container with a persistent data volume:

```bash
docker build -t miku .
docker run -d --name miku --restart unless-stopped \
  -p 5000:5000 \
  -e PORT=5000 \
  -v miku-data:/app/data \
  miku
```

Add `-e DATABASE_URL=...` or `-e BOT_TOKEN=...` only if you need those integrations. The volume mount preserves data under `/app/data` when the container is recreated. Keep your database credentials private and avoid exposing the unauthenticated API to the public internet.

---

## How to Use

The default command prefix is **`.`**.

| Command | Description |
|---|---|
| `.menu` | Show the loaded commands grouped by category. |
| `.menu download` | Show commands for a specific category. |
| `.list` | Show command names, aliases, and descriptions. |
| `.ping` | Check response speed. |
| `.uptime` | Show how long the bot has been running. |
| `.alive` | Check whether the bot is responding. |

### Examples

```text
.ytsearch lofi music
.tiktok https://example.com/video
.sticker       # Reply to an image
.tagall        # Use in a group
.weather Kolkata
```

> [!NOTE]
> Group moderation commands may require the bot to be a group admin. Owner-only commands are restricted to the configured bot owner.

---

## Environment Variables

Variables are optional unless required by a feature or deployment. Create a `.env` file locally, or use your hosting provider's environment-variable settings.

> [!CAUTION]
> Never commit `.env` files, API keys, cookies, bot tokens, or database credentials. Treat them as passwords.

### Core settings

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | First free port from `3000` | HTTP server port. |
| `DATABASE_URL` | Empty | PostgreSQL URL for WhatsApp login storage. When empty, local SQLite is used. |
| `BOT_NAME` | `miku` | Name shown by plugins. |
| `PACKNAME` | `bot` | Sticker pack name. |
| `AUTHOR` | `x-Miku` | Sticker author name. |
| `THEME` | `t` | Theme file in `Themes/`. |
| `LOG_LEVEL` | `info` | Log verbosity: `debug`, `info`, `warn`, or `error`. |

### Turso settings sync

| Variable | Default | Purpose |
|---|---|---|
| `TURSO_DATABASE_URL` | Empty | Turso database URL for settings sync. |
| `TURSO_AUTH_TOKEN` | Empty | Authentication token for the Turso database. Set both Turso variables or neither. |

### Telegram integration

| Variable | Default | Purpose |
|---|---|---|
| `BOT_TOKEN` | Empty | Telegram control bot token. |
| `OFFTELEBOT` | Unset | Any value other than `false` disables the Telegram bot. |
| `TG_GROUP_ID` | Built-in | Allowed Telegram group ID. |
| `TG_GROUP_LINK` | Built-in | Telegram group invite link. |
| `WA_CHANNEL_LINK` | Built-in | WhatsApp channel link. |
| `TGTOKEN` | Empty | Token for the Telegram sticker downloader. |

<details>
<summary><strong>Performance and scheduler settings</strong></summary>

| Variable | Default | Purpose |
|---|---:|---|
| `MAX_CONCURRENT_CONNECTIONS` | `12` | Maximum concurrent connections. |
| `MAX_CONCURRENT_PAIRINGS` | `3` | Maximum concurrent pairing attempts. |
| `WA_SEND_INTERVAL_MS` | `1000` | Base interval between outgoing messages. |
| `WA_SEND_JITTER_MS` | `300` | Randomized interval variation. |
| `PLUGIN_CONCURRENCY` | `8` | Per-plugin task concurrency. |
| `PLUGIN_QUEUE_LIMIT` | `200` | Plugin queue size limit. |
| `GLOBAL_PLUGIN_CONCURRENCY` | `150` | Global plugin concurrency limit. |
| `EVENT_GLOBAL_CONCURRENCY` | `40` | Global event-handler concurrency limit. |
| `CMD_TASK_TIMEOUT_MS` | `60000` | Command task timeout. |
| `TEXT_TASK_TIMEOUT_MS` | `15000` | Text task timeout. |
| `EVENT_TASK_TIMEOUT_MS` | `120000` | Event task timeout. |
| `CONNECTED_TASK_TIMEOUT_MS` | `300000` | Connected-event task timeout. |
| `CMD_MAX_WAIT_MS` | `30000` | Maximum command queue wait. |
| `MSG_MAX_WAIT_MS` | `10000` | Maximum message queue wait. |
| `MSG_MAX_AGE_MS` | `120000` | Ignore messages older than this limit. |
| `MSG_DEDUPE_MAX` | `300` | Duplicate-message cache limit. |
| `CMD_RATE_MAX` | `6` | Commands allowed per rate-limit window. |
| `CMD_RATE_WINDOW_MS` | `10000` | Command rate-limit window. |
| `LAG_SHED_MS` | `400` | Event-loop lag threshold for load shedding. |
| `HEALTH_LOG_MS` | `60000` | Health log interval. |

</details>

<details>
<summary><strong>Message serializer settings</strong></summary>

| Variable | Default | Purpose |
|---|---:|---|
| `SERIALIZER_RAW_TTL_MS` | `65000` | Raw-message cache lifetime. |
| `SERIALIZER_MAX_BODY_LEN` | `2000` | Maximum serialized body length. |
| `SERIALIZER_METADATA_TTL_MS` | `60000` | Metadata cache lifetime. |
| `SERIALIZER_METADATA_CACHE_MAX` | `3000` | Metadata cache size limit. |
| `SERIALIZER_META_CONCURRENCY` | `10` | Metadata processing concurrency. |
| `SERIALIZER_MAX_DOWNLOAD_BYTES` | `52428800` (50 MB) | Maximum media download size in bytes; `0` means no limit. |
| `SERIALIZER_IMG_CONCURRENCY` | `2` | Image processing concurrency. |

</details>

<details>
<summary><strong>Optional plugin settings</strong></summary>

These are only needed by plugins that use the corresponding integration.

| Variable | Purpose |
|---|---|
| `REMOVE_BG_API` | API key for the `.rmbg` background-removal command. |
| `COOKIES_FILE` | Instagram helper cookie file; default: `plugins/bin/cookies.txt`. |
| `UA`, `MOBILE_UA` | Custom User-Agent values. |
| `X_IG_APP_ID` | Instagram helper app ID. |
| `USE_PUPPETEER` | Set to `true` to enable the browser fallback. |
| `MAX_SESSIONS`, `MAX_ATTEMPTS` | Instagram helper limits. |
| `PAGINATION_DELAY_MS`, `FALLBACK_PAGES` | Instagram helper paging settings. |
| `MAX_PUPPETEER_SCROLLS`, `PER_SESSION_PAGES` | Instagram helper scrolling settings. |
| `CACHE_DIR`, `CACHE_TTL_MS` | Instagram helper cache path and lifetime. |
| `CACHE_MIN_SIZE`, `CACHE_MAX_ITEMS` | Instagram helper cache size limits. |
| `CACHE_PREFETCH_BATCH`, `RECENT_MAX` | Instagram helper prefetch settings. |

</details>

<details>
<summary><strong>Hosting variables</strong></summary>

| Variable | Notes |
|---|---|
| `NODE_ENV` | Set to `production` on servers; the Docker configuration already does this. |
| `RAILWAY_STATIC_URL` | If set, Telegram uses webhook mode. Leave unset unless a webhook receiver is implemented. |
| `WEBHOOK_BASE_URL` | Same webhook-mode behavior as above. |

</details>

### Example `.env`

Copy the following as a starting point and uncomment only the settings you use:

```dotenv
PORT=3000
BOT_NAME=miku
THEME=t
LOG_LEVEL=info

# DATABASE_URL=postgres://user:password@host:5432/database
# TURSO_DATABASE_URL=libsql://your-database.turso.io
# TURSO_AUTH_TOKEN=your-turso-token
# BOT_TOKEN=your-telegram-bot-token
```

---

## HTTP API

Miku exposes these HTTP routes in the supplied configuration:

| Method | Route | Purpose |
|---|---|---|
| `GET` | `/` | Health information, session count, and plugin information. |
| `GET` | `/sessions` | List sessions. |
| `GET` | `/pair/:num` | Request a pairing code for a phone number. |
| `GET` | `/start/:phone` | Start a saved session. |
| `GET` | `/session/:id` | Inspect one session's status. |
| `GET` | `/plugins` | List loaded plugins and commands. |
| `POST` | `/stop/:id` | Disconnect a session while retaining its login. |
| `POST` | `/logout/:id` | Disconnect a session and delete its saved login. |

### Example requests

```bash
curl http://localhost:3000/sessions
curl -X POST http://localhost:3000/stop/SESSION_ID
curl -X POST http://localhost:3000/logout/SESSION_ID
```

### Stop vs. logout

- **Stop** disconnects a session but keeps its saved login. Use `/start/:phone` to start it again.
- **Logout** disconnects the session and removes its saved login. The account must be paired again before it can reconnect.

> [!CAUTION]
> **The HTTP API has no authentication by default.** Do not expose it directly to the public internet. Restrict access through a private network, firewall, VPN, or an authenticated reverse proxy. Pay particular attention to pairing and logout routes.

---

## Telegram Control Bot

Set `BOT_TOKEN` to enable the Telegram control bot. Keep `OFFTELEBOT` unset or set it to `false` to avoid disabling the integration.

| Command | Purpose |
|---|---|
| `/start` | Show the welcome message. |
| `/help` | Display help. |
| `/commands` | List available commands. |
| `/pair` | Pair a WhatsApp number. |
| `/status` | Check session status. |
| `/restart NUMBER` | Restart a session. |
| `/logout NUMBER` | Remove a saved session. |
| `/d COMMAND` | Run a bot command through Telegram. |

Administrative actions are restricted to the configured Telegram group and its admins. Keep the Telegram bot token private.

---

## Command Categories

The lists below show documented command names and aliases. Availability depends on successful plugin loading and configuration; use `.menu` or `GET /plugins` for the live list.

<details>
<summary><strong>👥 Group management</strong></summary>

`add` `kick` `kickall` `promote` `demote` `admin` `tagall` `hidetag` `rtag` `totag` `open` `close` `lock` `unlock` `invite` `revoke` `groupinfo` `desc` `subject` `groupdp` `setgpp` `poll` `announce` `disappear` `welcome` `goodbye` `antilink` `antisticker` `approve` `reject` `requests` `leave`

</details>

<details>
<summary><strong>⬇️ Download and search</strong></summary>

`ytsearch` `yts` `play` `video` `sendaudio` `sendvideo` `insta` `instastalk` `tiktok` `tiktokstalk` `fb` `twitter` `spotify` `spotifyplay` `spotifysearch` `mega` `terabox` `pint` `pinsearch` `pindown` `gifsearch` `google` `googleimage` `img` `wiki` `lyrics` `whatsong` `apk` `apkmirror` `happymod` `npm` `git` `gitclone` `tgsticker` `tgstalk` `unsplash` `wallpapers` `wattpad` `bbc` `webzip` `weathersearch`

</details>

<details>
<summary><strong>🎨 Converters and stickers</strong></summary>

`sticker` `s` `take` `attp` `ttp` `toimage` `tomp3` `sticker2img` `video2img` `tts` `trt` `remini` `url` `shortener` `tinyurl` `rebrandly` `cleanuri` `adfoc` `ephoto` `blackpink` `watercolor` `1917` `imageinfo`

</details>

<details>
<summary><strong>🌸 Anime</strong></summary>

`anime` `manga` `character` `achar` `asearch` `astatus` `aquote` `arecommend` `waifu` `neko` `maid` `megumin` `shinobu` `couplepp` `lolicon`

</details>

<details>
<summary><strong>🎮 Games</strong></summary>

`gamemenu` `playgame` `tictactoe` `snake` `flappy` `minesweeper` `blockblast` `slots` `fishing` `piano` `guitar` `noxguitar` `drum` `calcui`

</details>

<details>
<summary><strong>🛠️ Tools and AI</strong></summary>

`ai` `groq` `calc` `weather` `createqr` `qr` `readqr` `ssweb` `sstab` `sspc` `ssphone` `shorturl` `define` `emojimix` `checkid` `checknumber` `vcf` `rename` `rmbg` `get` `raw` `wasted` `triggered` `jail` `passed` `broadcastmedia` `smartbroadcast`

</details>

<details>
<summary><strong>🙏 Devotional content</strong></summary>

`gitaverse` `gitachapter` `gitaquotes` `krishnaquotes` `ramayanaquotes` `quranverse` `quranchapter` `bibleverse`

</details>

<details>
<summary><strong>👑 Owner tools</strong></summary>

`mode` `public` `private` `broadcast` `forward` `fwd` `block` `unblock` `blocklist` `unblockall` `setname` `setbio` `setpp` `removepp` `fullpp` `getpp` `getbio` `getname` `whois` `jid` `join` `listgc` `leaveall` `save` `saved` `vv` `vv2` `delete` `delme` `reload` `myprivacy` `mystatus` `mention` `strg`

</details>

<details>
<summary><strong>⚙️ Automation</strong></summary>

`autoread` `autoreact` `autostatus` `autostatusreact` `autotyping` `autorecord` `anticall`, plus event plugins for `autojoin`, `presence`, `welcome`, and channel/newsletter following.

</details>

---

## Write Your Own Plugin

Add a `.js` file inside `plugins/`, then restart Miku or use `.reload` if supported by your current deployment.

### Command plugin

```js
import { Module } from "../../lib/plugins.js";

Module({
  command: "hello",
  aliases: ["hi"],
  package: "general",
  description: "Reply with a greeting",
})(async (message, args) => {
  await message.reply(`Hello ${args || "there"}!`);
});
```

### Event plugin

```js
Module({
  on: "connected",
  name: "connection-log",
})(async (ctx) => {
  ctx.logger.info(
    { sessionId: ctx.sessionId },
    "Connected",
  );
});
```

### Plugin notes

- Handler signature: `(message, args, ctx, signal)`.
- `ctx` provides `sessionId`, `sock`, `db`, `config`, `logger`, and `manager`.
- `signal` is aborted when a task times out; long-running handlers should stop work when this happens.
- Files under `plugins/bin/` and files ending in `.bak` are not loaded as plugins.
- After many reloads in production, restart the bot once if needed.

---

## Project Structure

```text
miku/
├── index.js          # Startup, HTTP API, and shutdown
├── config.js         # Defaults and environment configuration
├── lib/
│   ├── manager.js    # Session manager (Socksy)
│   ├── client.js     # Events, queues, and limits
│   ├── plugins.js    # Plugin loader
│   ├── serialize.js  # Message wrapper
│   └── database/     # Settings storage
├── plugins/          # Commands and event handlers
├── tele/             # Telegram control bot
├── Themes/           # Reply-message themes
├── Dockerfile
├── Procfile
├── app.json          # Heroku deployment configuration
└── heroku.yml
```

---

## Troubleshooting

<details>
<summary><strong>Pairing code does not work</strong></summary>

- Use the full country calling code followed by digits only; do not include `+` or spaces.
- Confirm that the server has internet access.
- Wait before retrying if WhatsApp has limited repeated linking attempts.
- Check the server logs for pairing errors.

</details>

<details>
<summary><strong>Sessions disappear after restart</strong></summary>

- On cloud hosts, configure `DATABASE_URL` for PostgreSQL authentication storage if required by your deployment.
- On local, panel, or Docker deployments, preserve the `data/` directory or mount the correct persistent volume.
- Confirm that the application is connecting to the same database after every restart.

</details>

<details>
<summary><strong>Telegram bot does not reply</strong></summary>

- Check that `BOT_TOKEN` is correct.
- Ensure `OFFTELEBOT` is unset or set to `false`.
- Leave `RAILWAY_STATIC_URL` and `WEBHOOK_BASE_URL` unset unless you have implemented a webhook receiver.
- Ensure another process is not already polling with the same Telegram token.
- Review the application logs for Telegram API errors.

</details>

<details>
<summary><strong>SQLite or module startup errors</strong></summary>

- Verify the runtime with `node -v`; use Node.js 22.13 or newer.
- Run `npm install` in the project directory.
- Check the logs for the specific package or native module that failed.

</details>

<details>
<summary><strong>Stickers or media conversion fail</strong></summary>

Install FFmpeg and confirm it is available on your `PATH`:

```bash
# Debian/Ubuntu
sudo apt install ffmpeg

# Termux
pkg install ffmpeg
```

</details>

<details>
<summary><strong>A command is missing</strong></summary>

- Run `.menu` or check `GET /plugins` to see which commands loaded.
- Review startup logs for plugin import errors.
- Check whether the plugin requires an API key, cookie file, or other configuration.

</details>

<details>
<summary><strong>Settings reset after a Heroku restart</strong></summary>

If the current settings adapter uses Turso sync, set both `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`. Confirm the deployed version actually supports the configured adapter.

</details>

---

## Security

- **The HTTP API is unauthenticated by default.** Restrict it with a firewall, private network, VPN, or authenticated proxy before exposing a deployment publicly.
- **Protect credentials.** Pairing codes, session IDs, database URLs, Telegram tokens, and cookies are sensitive. Never publish them in README files, screenshots, logs, or commits.
- **Rotate leaked secrets.** Removing a secret from the latest commit does not invalidate copies in repository history or elsewhere.
- **Protect local data.** SQLite files are not encrypted by default; secure the server, backups, and filesystem permissions.
- **Review third-party integrations.** Plugins may call external APIs whose availability, requirements, or behavior can change.
- **Use the bot responsibly.** Baileys is an unofficial WhatsApp Web client. Platform changes may break compatibility, and misuse can put accounts at risk. Do not use Miku for spam or unsolicited bulk messaging.

---

## License

Miku is released under the **MIT License**. See [`LICENSE`](LICENSE) for the full text.

<div align="center">
<hr />
<p><strong>Made with ❤️ by <a href="https://github.com/nightx-rebel">nightx-rebel</a></strong></p>
<p><a href="https://github.com/nightx-rebel/miku">Miku Repository</a> · <a href="https://github.com/nightx-rebel/socksy">Socksy Engine</a></p>
<p>⭐ If Miku is useful to you, consider giving the repository a star!</p>
<img src="https://capsule-render.vercel.app/api?type=waving&amp;color=gradient&amp;customColorList=12,20,24&amp;height=110&amp;section=footer" alt="" width="100%" />
</div>
