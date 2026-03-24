# How to Build Your Own Polymarket Clawdbot — $1,000 Per Day Strategy

> **Author:** Kirill (@kirillk_web3)
> **Source:** https://x-thread.org/t/2025933391003066796

---

This is a complete A–Z breakdown of how automated OpenClaw systems compound small probabilistic edges into daily income.

---

## Before We Talk About Setup, Let's Talk About Proof

Over the past few weeks, multiple Polymarket wallets have quietly scaled short-duration markets using automated execution.

- One wallet crossed **$350,000 in profit**
  - [polymarket.com/@0x1d0034134e](https://polymarket.com/@0x1d0034134e?via=kirillk)

> **0x1d0034134e** — Joined Jan 2026 · 38.4K views
> All-Time P&L: **$342,710.84**
> Positions Value: $15.3K | Biggest Win: $13.7K | Predictions: 11,802

- Another wallet quietly crossed **$30,000 in 30 days** trading only weather contracts — just temperature brackets.
  - [polymarket.com/@0x594edB9112f526Fa6A80b8F858A6379C8A2c1C11](https://polymarket.com/@0x594edB9112f526Fa6A80b8F858A6379C8A2c1C11?via=kirillk)

> **0x594edB9112f526Fa6...** — Joined Nov 2025 · 50.7K views
> All-Time P&L: **$39,695.58**
> Positions Value: $29.1K | Biggest Win: $6,122.71 | Predictions: 2,360

While most traders ignored them, this account executed thousands of small probabilistic edges, compounding 300%–49,000% returns into consistent five-figure monthly profit.

- A friend's @krajekis subscriber earned **$2,000 from $10 in 7 days** using [this bot](https://github.com/FrondEnt/PolymarketBTC15mAssistant/)

> **Supphieros** — Joined Jan 2026 · 4.3K views
> All-Time P&L: **$1,002.64**
> Positions Value: $0.12 | Biggest Win: $87.84 | Predictions: 658

---

## Why Most Traders Fail (And Bots Don't)

Before we build anything, you need to understand one thing:

**Clawdbot isn't about prediction. It's about structure.**

Most traders:
- Click manually
- Chase narratives
- Enter late
- Size emotionally

Bots:
- Execute instantly
- Follow predefined rules
- Size mechanically
- Repeat without fatigue

> The edge is not genius forecasting. Now let's build it.

---

## How To Setup An Automated Polymarket Bot with OpenClaw

### Requirements

- [VPS](https://ishosting.com/affiliate/NzE0MiM2)
- [OpenClaw Bot](https://openclaw.ai/) — @openclaw
- Telegram
- ChatGPT Plus subscription (or another AI provider)
- Simmer SDK account

> **Disclaimer:** This is an educational walkthrough, not financial advice. Automated trading is risky and you can lose money. Use small size, test first, and proceed at your own risk.

---

## Hosting (Your Bot Needs to Run 24/7)

If you want this Clawdbot to work properly, it can't run on your laptop. You need a **VPS (virtual private server)**.

The bot must:
- Stay online 24/7
- Execute without interruption
- React instantly

**Recommended VPS:** [ishosting.com](https://ishosting.com/affiliate/NzE0MiM2) — provides Linux environments and installation guides. Easiest to install on **Ubuntu 22.04**.

### VPS Plans (Example)

| Plan | CPU | RAM | Drive | Bandwidth | Price |
|---|---|---|---|---|---|
| Start | Xeon 2.20 GHz | 2 GB | 30GB SSD | 3 TB | from $10.19/mo |
| Medium | Xeon 2x2.20 GHz | 4 GB | 40GB SSD | Unmetered | from $21.24/mo |
| Premium | Xeon 3x2.20 GHz | 8 GB | 50GB SSD | Unmetered | from $31.99/mo |

You don't need anything powerful. The Start plan is more than enough.

---

## Step 1 — Connect to Your VPS

After purchase, you'll receive:
- Server IP
- Username (usually Administrator)
- Password

**On Windows:**
- Open Remote Desktop (RDP)
- Enter the VPS IP
- Login with credentials

**On Mac:**
- Download Microsoft Remote Desktop from the App Store
- Open the app and click Add PC
- Paste the server IP address
- Under User account, add Username: Administrator + Password
- Click Add, then double-click the server

Done — you're now inside your cloud machine. This server will run your Clawdbot non-stop.

---

## Step 2 — Install Required Software

Inside Windows Server 2019:

- **Python 3.10+** — Download from [python.org](https://python.org)
- **Git** (optional but recommended) — Download from [git-scm.com](https://git-scm.com)
- **Node.js** (if using JS version) — Download from [nodejs.org](https://nodejs.org)

Keep it minimal. No unnecessary software.

---

## Step 3 — Install Clawdbot

Open PowerShell (Press Win → Type PowerShell → Open Windows PowerShell). No administrator rights needed.

**Windows:**
```powershell
iwr -useb https://openclaw.ai/install.ps1 | iex
```

**Mac/Linux:**
```bash
curl -fsSL https://openclaw.ai/install.sh | bash
```

Wait 1–10 minutes. You'll see ASCII art with the word **CLAWDBOT** and a security warning message.

### Confirm Installation

You'll be prompted with:

> *"I understand this is powerful and inherently risky. Continue?"*

**Security warning — please read:**
- OpenClaw is a hobby project and still in beta. Expect sharp edges.
- This bot can read files and run actions if tools are enabled.
- A bad prompt can trick it into doing unsafe things.
- If you're not comfortable with basic security and access control, don't run OpenClaw.

**Recommended baseline:**
- Pairing/allowlists + mention gating
- Sandbox + least-privilege tools
- Keep secrets out of the agent's reachable filesystem
- Use the strongest available model for any bot with tools or untrusted inboxes

Run regularly:
```
openclaw security audit --deep
openclaw security audit --fix
```

Select **Yes** and press Enter.

### Choose Setup Mode

When prompted, select: **QuickStart**

This automatically configures the base environment and installs all required dependencies. No manual setup required.

---

## Step 4 — Connect the AI Model

Now we connect the intelligence layer. Clawdbot is just execution — the AI model is what generates and refines the strategy logic.

Available model providers:
- **OpenAI** (Codex OAuth + API key) ← recommended
- Anthropic
- Chutes, vLLM, MiniMax, Moonshot AI (Kimi K2.5), Google, xAI (Grok), Volcano Engine, BytePlus, OpenRouter, Qwen, Z.AI, Qianfan, Copilot, Vercel AI Gateway, OpenCode Zen, Xiaomi, Synthetic, Together AI, Hugging Face, Venice AI, LiteLLM, Cloudflare AI Gateway, Custom Provider

### Log into ChatGPT (Plus Required)

You need:
- ChatGPT Plus subscription ($20/month)
- Active OpenAI access

Log in and make sure your Plus plan is active. This gives you access to advanced models that can generate and adapt trading logic.

---

## Step 5 — Connect Telegram

Next, the installer will ask you to connect Telegram. This is the easiest and most convenient way to communicate with your bot.

Instead of logging into your VPS every time, you'll simply:
- Send commands via chat
- Receive trade alerts
- Get execution confirmations
- Start / stop the bot remotely

You can even use voice messages — just like texting a friend.

### Create a Telegram Bot via BotFather

1. Open Telegram on desktop or mobile
2. Search for `@BotFather`
3. Send `/start`, then `/newbot`
4. BotFather will ask you to:
   - Choose a name (e.g. *My AI Assistant*)
   - Choose a username — must end with "bot" (e.g. *myai_helper_bot*)
5. After creation, BotFather will send you a **Bot Token** that looks like: `1234567890:ABCdefGHIjklMNOpqrstUVWxyz`

> ⚠️ This token gives full access to your bot. Do not share it publicly.

### Paste the Token into the Installer

Go back to your VPS terminal. When prompted, paste the Bot Token and press Enter. Telegram is now connected.

---

## Step 6 — Skill Configuration

During installation, the setup wizard will ask:

**Configure skills now?** → Select **Yes**

**Install missing skill dependencies?** → Select **Skip for now**

For all API key prompts (Google Places, Gemini, OpenAI image gen, etc.) → Select **No**

These API keys are only required for specific integrations. They are NOT needed for basic Clawdbot operation. You can always configure them later.

### Choose Package Manager

Select: **npm** — it's already installed with Node.js and is the simplest option.

### Hooks (Automation Triggers)

Hooks are automatic actions triggered by certain events. Select:
- `command-logger` — log all commands (useful for debugging)
- `session-memory` — store conversation/session context

(Use Space to mark them, then press Enter)

This gives you better debugging, persistent session context, and more stable automation.

Then verify your account on Telegram:
```
openclaw pairing approve telegram <pairing code>
```

---

## Step 7 — Create a Simmer Account

Simmer is the best prediction market interface for AI agents — trade on **Polymarket and Kalshi**, all through one API, with self-custody wallets, safety rails, and smart context.

Ready-to-use skills include:
- Weather trading
- Copy trading
- Signal sniper setups
- Fast loop execution

### 1. Create Your Account

Go to [https://simmer.markets](https://simmer.markets) and connect your Google account.

### 2. Fund Your Agent Wallet

Go to: **Wallet → Agent Wallet**

You'll see your agent's dedicated wallet address.

> ⚠️ **Polygon network only:** Send USDC.e + POL to the address above. DO NOT send on Ethereum, Base, or other chains — funds will be lost.
> ⚠️ **USDC.e only:** Polymarket requires bridged USDC.e, not native USDC.

You need to fund it with:
- **USDC.e** (on Polygon) — for trading capital
- **POL** — for gas fees

To test all features, you'll only need about **$50**.

---

## Step 8 — Connect Your Clawdbot to Simmer

Now we link your trading agent.

1. In Simmer, click on **Agent**
2. Open the **Overview** tab
3. Select **Manual**
4. Copy the generated command
5. Go to Telegram and send: `Read https://simmer.markets/skill.md and follow the instructions to join Simmer`
6. Paste the command into your Clawdbot chat

The bot will reply with a link to your agent. Open the link and click **Claim Agent** to enable real trading.

Your Clawdbot is now connected to Simmer. ✅

---

## Step 9 — Select Your Trading Skill

Now we define what your bot will trade.

### Available Skills

**Polymarket Weather Trader**
Trade weather markets using NOAA forecast data. Automatically monitors temperature predictions.

**Polymarket Copytrading**
Mirror positions from top Polymarket traders. Aggregates whale signals with size-weighted logic.

**Polymarket Signal Sniper** *(and more)*
Additional skills available through the Simmer skill marketplace.

---

## Summary — Full Setup Checklist

| Step | Task | Status |
|---|---|---|
| 1 | Connect to VPS via RDP | ☐ |
| 2 | Install Python, Git, Node.js | ☐ |
| 3 | Install Clawdbot via PowerShell/bash | ☐ |
| 4 | Connect AI model (ChatGPT Plus) | ☐ |
| 5 | Create Telegram bot + connect | ☐ |
| 6 | Configure skills + hooks | ☐ |
| 7 | Create + fund Simmer account | ☐ |
| 8 | Connect Clawdbot to Simmer | ☐ |
| 9 | Select trading skill | ☐ |

---

*Educational purposes only. Automated trading is risky. Use small size and test first.*

> *Source: @kirillk_web3*
