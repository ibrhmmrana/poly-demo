# How Building a Weather Polymarket Bot with OpenClaw Can Turn $100 → $8,000 (Step-by-Step Guide)

> **Author:** Lunar (@LunarResearcher)
> **Source:** https://x-thread.org/t/2025131164348932533

---

No code. No finance degree. No trading experience.

Just a bot that reads weather forecasts better than the market does — and quietly prints money 24/7.

Here's the complete blueprint.

---

## The Bot That Started It All

### automatedAItradingbot: +$72.5k only on weather trading

> **automatedAItradingbot** — Joined Jan 2025 · 45.6K views
> *"Meteorologist. IT engineer. Automated bot testing"*
> All-Time P&L: **$72,548.62**
> Positions Value: $1,334.36 | Biggest Win: $7,145.02 | Predictions: 2,278

- Automated bot trading only on weather markets

### 0x594edB9112f526Fa6A80b8F858A6379C8A2c1C11: +$39.3k in one month

> **0x594edB9112f526Fa6...** — Joined Nov 2025 · 50.5K views
> All-Time P&L: **$39,666.18**
> Positions Value: $27.4K | Biggest Win: $6,122.71 | Predictions: 2,354

- **80% win rate**, pure weather strategy
- Never sleeps, never misses a new weather opportunity

### aboss: +$42.4k only from automated bot

> **aboss** — Joined Nov 2024 · 581 views
> All-Time P&L: **$42,935.94**
> Positions Value: $2.20 | Biggest Win: $4,478.34 | Predictions: 1,865

- Weather trading bot specialist

All three had the same fingerprint: **Perfect timing. Zero emotional decisions. Fully automated.**

---

## Here's the Thing Nobody Tells You About Polymarket Weather Markets

Most people pricing them have no idea what NOAA says.

**NOAA** — the US National Oceanic and Atmospheric Administration — publishes hyper-accurate 24–48 hour forecasts for free. Their models are built on decades of satellite data and supercomputer simulations. Their short-range accuracy is genuinely impressive.

Meanwhile, Polymarket temperature bucket markets — things like *"Will NYC hit above 72°F on Saturday?"* — are often priced by retail users guessing based on vibes, the weather app on their phone, or nothing at all.

The result? You regularly see situations like this:

> *NOAA says 94% confidence NYC will hit 74–76°F Saturday.*
> Polymarket has that bucket priced at **11¢**.

A bot that catches that discrepancy, buys at 11¢, and sells when the market corrects to 45–60¢ just made a **4x return on a near-certain outcome**.

---

## The Stack That Makes It Possible

Three tools. That's it.

**OpenClaw** — a free, open-source AI agent that runs on your computer and executes tasks autonomously. Think of it as your personal trader that never sleeps, never panics, and never revenge trades.

**Simmer Markets** — built by @TheSpartanLabs, it's a platform with pre-built trading "skills" for Polymarket. Weather trading, copy trading, arbitrage scanner — plug-and-play modules your bot can use without you writing a single line of code.

**Telegram** — your command center. You talk to your bot here. It reports back here. Simple.

---

## Step 1: Install OpenClaw

Open your terminal and run one command.

**Mac / Linux:**
```bash
curl -fsSL https://openclaw.ai/install.sh | bash
```

**Windows PowerShell:**
```powershell
iwr -useb https://openclaw.ai/install.ps1 | iex
```

Wait 2–3 minutes. When it finishes, run:
```bash
openclaw onboard
```

---

## Step 2: Onboarding — Answer These Exactly

The terminal will walk you through a setup wizard. Here's what to pick:

| Prompt | Answer |
|---|---|
| Security warning | Yes, I understand the risks |
| Onboarding mode | Quick Start |
| Model provider | OpenAI (Codex OAuth + API key) |
| Auth method | ChatGPT OAuth |
| Model | openai-codex/gpt-5.2 |
| Communication channel | Telegram (Bot API) |

It'll redirect you to a ChatGPT login page. Connect your ChatGPT Plus account ($20/month — this is the AI brain your bot uses).

---

## Step 3: Create Your Telegram Bot

Your Clawdbot needs a Telegram channel to talk to you. Takes 2 minutes.

1. Open Telegram → search **@BotFather**
2. Send `/newbot`
3. Give it a name and a username ending in "bot"
4. Copy the API token you receive and paste it into your terminal

Then finish setup:

| Prompt | Answer |
|---|---|
| Configure skills now | YES |
| Node manager | npm |
| Missing dependencies | Skip for now |
| All API connections | NO |

Start the Gateway when prompted. Then in your new Telegram bot, send `/start` — you'll get a pairing code. Back in terminal, run:

```bash
openclaw pairing approve telegram <your_code_from_bot>
```

Your bot is now live. Say hi to it in Telegram — it'll respond.

---

## Step 4: Set Up Simmer and Fund Your Agent

Go to [simmer.markets](https://simmer.markets) and connect your EVM crypto wallet.

Once inside:
- Click the wallet button (top right corner)
- You'll see your **agent wallet address** — this is separate from your main wallet
- Deposit $USDC.e or $POL on Polygon network to this address

> ⚠️ **Important Token Requirements:**
> - Must use **USDC.e** (bridged USDC), not native USDC
> - Must send on **Polygon** network only
> - Wrong token/network = funds stuck, need to withdraw & re-send

Start small — **$100 is enough** to test the strategy properly. This money goes into the agent wallet, which your bot will use to execute real trades on Polymarket.

---

## Step 5: Connect Your Bot to Simmer

Go to your Simmer agent page → Overview tab → select **Manual** installation.

Copy the command shown and send it to your Clawdbot in Telegram:

```
Read https://simmer.markets/skill.md and follow the instructions to join Simmer
```

Your bot will reply with a **Claim Agent** link. Open it, press Claim Agent, and confirm the transaction in your wallet.

Your Clawdbot is now linked to your Simmer agent with real funds. ✅

---

## Step 6: Install the Weather Trading Skill

In Simmer, go to the **Skills** tab → find **Weather Trader** → copy the install command.

Available skill categories:
- Weather
- Copy
- Signals
- Analytics
- Trading
- Utility

Send the Weather Trader install command to your Clawdbot in Telegram. The bot will read the skill documentation, install it, and confirm when ready.

Your weather trading bot is now live and scanning for NOAA vs Polymarket price discrepancies 24/7.

---

## Summary — Quick Start Checklist

| Step | Task |
|---|---|
| 1 | Install OpenClaw via terminal |
| 2 | Complete onboarding wizard (QuickStart + ChatGPT OAuth) |
| 3 | Create Telegram bot via @BotFather + pair it |
| 4 | Create Simmer account + fund agent wallet with $100 USDC.e on Polygon |
| 5 | Connect Clawdbot to Simmer via Telegram command |
| 6 | Install Weather Trader skill from Simmer Skills tab |

**Total setup time:** ~20–30 minutes
**Starting capital needed:** ~$100
**Technical skill required:** None

---

> *Educational purposes only. Automated trading involves risk. Start small and test before scaling.*

> *Source: @LunarResearcher*
