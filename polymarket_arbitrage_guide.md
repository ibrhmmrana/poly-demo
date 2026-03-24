# I Analyzed a Chinese Guide to Polymarket and It's Brilliant

> **Author:** paranoiac (@webparanoiac)
> **Source:** https://x-thread.org/t/2035680334503891036

---

While browsing Chinese websites, I saw someone offering to sell their guide for $5, and as a content creator, I realized this was my new goal.

The Chinese are very good at math and make a fortune from it, and this case is no exception. I want to share his opinion and summarize the gist of it so you understand how easy it is to make money on Polymarket.

---

## Abstract

Let's say you go to Polymarket (or another prediction market) and see an event where:

- Yes is priced at **$0.62**
- No is priced at **$0.33**

The total is **$0.95**, which is less than a dollar. Logic tells you: buy both tokens for $0.95, wait for the market to close, and get $1.00 — a risk-free profit of $0.05.

You're right, but while you're thinking that, quantitative systems are doing something completely different.

They scan **17,218 conditions** and cycle through **2⁶³ possible combinations** of outcomes. They find all price discrepancies in a fraction of a second, and by the time you place two orders the arbitrage spread vanishes.

> It's not just about how fast your hands are; it's about the mathematical structure.

---

## Chapter 1: Why Simply Adding Things Up Doesn't Work — The Problem of the Marginal Polytope

For example, consider the event *"Will Manchester City win the Premier League this season?"*

- Yes — $0.48
- No — $0.52

The total is one buck, and there's no price difference. But there's a related event: *"Will Manchester City win the Premier League by a margin of 10+ points over second place?"*

- YES — $0.32
- NO — $0.68

Separately, these two markets are perfectly normal, but there is a **correlation** between them.

Winning by a large margin is only possible if they win overall. This means that a "dominant championship" is a type of "championship." Thus, if market prices violate this logic, it's an opportunity to make money.

> *For the sharpest minds: it's the same as betting on "the plane will arrive" and "the plane will arrive early." An early arrival is impossible without an arrival at all, so the price for "early arrival - yes" can never exceed the price for "will arrive - yes."*

### The Explosion of the Space of the Exodus

For a market with **n** conditions, there are **2^n** possible price combinations.

That sounds reasonable — until you look at real-world derivatives.

The World Cup has 64 matches, and each match has two possible outcomes. That makes a total of **2⁶⁴ = 9,446,744,073,709,551,616 combinations**. If we start checking them at a rate of one billion per second, it will take us **282 years**.

> *That's why a brute-force search is impossible.*

The solution is not to "search faster," but **not to search at all**. Integer programming describes what legitimate outcomes look like through constraints.

**Example:** The group stage match between Brazil and Argentina.
Each team has 7 options for points scored (0, 3, 6, 9, 12, 15, 18) — making 14 conditions and 2¹⁴ = 16,384 combinations.

Three constraints cover them all:
- Exactly one outcome for Brazil is true
- Exactly one outcome for Argentina is true
- Brazil ≥ 15 points + Argentina ≥ 15 points ≤ 1 (neither team can win all their matches since they play against each other)

### Key Data

Actual data shows that **41% of markets contain arbitrage opportunities**.

A team of analysts reviewed data from April 2024 to April 2025 and found that out of 17,218 conditions, **41% — specifically 7,051 — contained single-market arbitrage opportunities**.

The median price deviation is **$0.60 instead of $1.00**.

> This isn't "almost efficient" — it's a system.

---

## Chapter 2: The Bregman Projection — How to Calculate the Optimal Trade

The first problem is to find arbitrage. The second problem is to calculate the **optimal** arbitrage trade.

### Why Euclidean Distance Doesn't Work

Our task is to find the closest legitimate price and trade the difference. The problem is that Euclidean distance treats all price changes as equal.

But a movement from $0.05 to $0.15 is completely different in information than a movement from $0.50 to $0.60 — even though both represent a 10-cent change.

Price is a hidden probability, and extreme changes carry incomparably more information.

### Bregman Divergence Is the Correct Metric

Polymarket's market makers use the **LMSR (Logarithmic Market Scoring Rule)**, where prices essentially represent probability distributions.

In this framework, the correct distance metric is not the Euclidean distance but the **Bregman distance**.

For the LMSR, the Bregman distance becomes the **KL divergence (Kullback–Leibler distance)** — a metric of the "information distance" between two probability distributions.

KL divergence automatically assigns greater weight to "changes near extreme prices." A change from $0.05 to $0.15 is "further" in the sense of KL divergence than a change from $0.50 to $0.60.

The Bregman projection tells you:
- **What to buy and sell** (the direction of the projection indicates the direction of the trade)
- **How much to buy and sell** (taking into account the depth of the order book)
- **How much you can earn** (projection distance = maximum profit)

> Simply put: the further the market price is from the "arbitrage-free space," the more you can earn.

The top arbitrage trader earned **$2,009,631.76** over the course of the year. His strategy is to solve this optimization problem faster and more accurately than anyone else.

---

## Chapter 3: The Frank-Wolfe Algorithm — How to Turn Theory into Executable Code

To find the optimal arbitrage, we need to compute the Bregman projection. But there's a catch — **it is impossible to compute the Bregman projection directly**, because the space without arbitrage (the boundary polyhedron M) has an exponential number of vertices.

This is where the **Frank-Wolfe algorithm** comes in.

### How It Works

The genius of the Frank-Wolfe algorithm lies in the fact that it does not attempt to solve the entire problem at once, but approaches the solution step by step:

1. Start with a small set of known feasible solutions
2. Optimize on this small set to find the current optimal solution
3. Use integer programming to find a new feasible solution and add it to the set
4. Check if it is close enough to the optimal solution. If not, return to step 2

At each iteration, the set is expanded by only one vertex. Even after 100 iterations, you only need to track **100 vertices — not 2⁶³**.

> *Imagine you're in a huge maze looking for the exit. Brute force goes through every corridor. Frank-Wolfe chooses a random path, then at every intersection asks: "In which direction is the exit most likely?" — and heads in that direction.*

### Performance (Using Gurobi 5.5)

| Phase | Solution Time |
|---|---|
| Early iterations (few matches) | < 1 second |
| Middle period (30–40 matches) | 10–30 seconds |
| Late period (50+ matches) | < 5 seconds |

It gets faster toward the end because as match results are recorded, the set of possible solutions narrows — fewer variables, stricter constraints.

### The Gradient Blow-up Problem

The standard Frank-Wolfe algorithm has a technical issue: as prices approach 0, the LMSR gradient tends toward negative infinity, making the algorithm unstable.

**Solution — The Frank-Wolfe Barrier method:** optimization is performed not on the full polyhedron M, but on a slightly "compressed" version M'. The compression parameter ε is adaptively reduced with each iteration — first moving away from the boundary (for stability), then gradually approaching the actual boundary (for accuracy).

Studies show that in practice, **50–150 iterations are sufficient for convergence**.

### Theory in Practice

In the first 16 games of the NCAA tournament, the Frank-Wolff Market Maker (FWMM) and a simple market maker with linear constraints (LCMM) produced similar results. But after 45 games, FWMM outperformed LCMM in terms of position pricing by **38%**.

- **FWMM** is like a student who takes a while to warm up but, once in a rhythm, really starts to pull ahead
- **LCMM** is a student who performs consistently but has a limited ceiling

---

## Chapter 4: Why Even Accurate Calculations Can Still Lead to Losses

So you've identified an arbitrage opportunity and calculated the optimal trade. Now you need to execute it. **This is precisely where most strategies fail.**

### The Problem of Non-Atomic Execution

Polymarket uses a **CLOB (Central Limit Order Book)**. Unlike decentralized exchanges, trades in a CLOB are executed sequentially — there is no guarantee that all orders will be executed simultaneously.

**Your plan:**
- Buy YES for $0.30 + Buy NO for $0.30 = Total cost $0.60 → Receive $1.00 → **Profit: $0.40**

**Reality:**
- Place YES order → filled at $0.30 ✓ *(your order moved the market)*
- Place NO order → filled at $0.78 ✗
- Total cost: $1.08. Received: $1.00. **Final result: a loss of $0.08**

> That is why this approach only considers opportunities with a profit of more than **$0.05**. Smaller profit margins are offset by execution risk.

### VWAP: Volume-Weighted Average Price

Don't assume you can execute a trade at the quoted price. You need to calculate the **VWAP**.

**Example:** You want to buy 10,000 tokens. Order book shows:
- 2,000 at $0.30
- 3,000 at $0.32
- 5,000 at $0.35

VWAP = (2000×0.30 + 3000×0.32 + 5000×0.35) / 10000 = **$0.326**

This is significantly higher than the "best bid price" of $0.30.

Profit is also limited by **order book depth** — even if the price has moved, your profit is capped by available liquidity.

---

## Chapter 5: The Complete System — What Is Actually Being Deployed

### Data Pipeline

- **Real-time:** WebSocket connection to the Polymarket API — receiving order book updates, trade broadcasts, and market creation/settlement events
- **Historical:** Querying smart contract events via the Alchemy Polygon node API (OrderFilled, PositionSplit, PositionsMerge)

The research team analyzed **86 million transactions**. A project of this scale requires infrastructure — it cannot be solved with a script alone.

### Dependency Detection Layer

For the 305 U.S. presidential election markets alone, there are **46,360 possible pair combinations** to check.

The team used **LLM DeepSeek-R1-Distill-Qwen-32B** for initial screening:
- Input: descriptions of the conditions for two markets
- Output: JSON with valid combinations of outcomes

Then a **three-level verification:**
1. Is exactly one condition of each market true?
2. Is the number of valid combinations less than n×m (indicating a dependency)?
3. Does the dependent subset satisfy the arbitrage conditions?

**Funnel:** 40,057 independent pairs → 1,576 dependent pairs → 374 satisfying strict conditions → **13 pairs manually confirmed**

LLM accuracy in complex multi-condition markets: **81.45%** — sufficient for initial screening, but manual verification is required before execution.

### Three-Tier Optimization Engine

| Level | Method | Purpose |
|---|---|---|
| **Level 1** | Simple Linear Constraints (LCMM) | Quick check of basic rules — completes in milliseconds, eliminates obvious pricing errors |
| **Level 2** | Integer programming (Frank-Wolfe + Gurobi) | Core engine. Alpha = 0.9, initial ε = 0.1, convergence threshold = 1e-6, time limit = 30 min. Typical iterations: 50–150 |
| **Level 3** | Execution verification | Simulation on current order book — checks liquidity, expected slippage, guaranteed profit after slippage, minimum threshold ($0.05) |

Execution only proceeds if **all Level 3 checks pass**.

### Position Sizing: Modified Kelly Formula

The standard Kelly formula specifies what percentage of capital to invest. In an arbitrage context it must be adjusted to account for execution risk, where:
- **b** = percentage of arbitrage profit
- **p** = probability of full execution (estimated based on order book depth)
- **q** = 1 - p
- **Upper limit:** 50% of the order book depth — exceeding this will significantly move the market

---

## Final Results (April 2024 – April 2025)

| Strategy | Profit |
|---|---|
| Single-condition arbitrage (buy both sides low + sell high) | $10,581,362 |
| Market rebalancing | $29,011,589 |
| Intermarket arbitrage | $95,634 |
| **Total** | **$39,688,585** |

> The top 10 arbitrage traders earned **$8,127,849** (20.5% of the total amount).
> The leading arbitrage trader: **$2,009,632** from **4,049 trades**, averaging **$496 per trade**.

---

*The algorithms are well-known. The profits are real.*

---

> *Source: @webparanoiac — (evm/acc) zscdao forever - sport guy*
