import type { EdgeSignal } from "./types";

export interface TradeResult {
  id: string;
  fillPrice: number;
  sizeShares: number;
  status: "FILLED" | "PENDING" | "REJECTED";
  orderId?: string;
}

function uuid(): string {
  return crypto.randomUUID();
}

export function executePaper(
  signal: EdgeSignal,
  sizeUsd: number,
): TradeResult {
  const fillPrice = signal.marketPrice;
  if (fillPrice <= 0) {
    return { id: uuid(), fillPrice: 0, sizeShares: 0, status: "REJECTED" };
  }
  return {
    id: uuid(),
    fillPrice,
    sizeShares: sizeUsd / fillPrice,
    status: "FILLED",
  };
}

export async function executeLive(
  signal: EdgeSignal,
  sizeUsd: number,
): Promise<TradeResult> {
  const tradeId = uuid();

  try {
    const pk = (process.env.POLYMARKET_PRIVATE_KEY ?? "").trim();
    if (!pk) throw new Error("POLYMARKET_PRIVATE_KEY not set");

    // Dynamic require — these packages are optional and only loaded for live trades.
    // Install them with: npm i @polymarket/clob-client ethers@5
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { ClobClient } = require("@polymarket/clob-client") as { ClobClient: new (...args: unknown[]) => Record<string, (...a: unknown[]) => unknown> };
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { ethers } = require("ethers") as { ethers: { Wallet: new (key: string) => unknown } };

    const wallet = new ethers.Wallet(pk.startsWith("0x") ? pk : `0x${pk}`);
    const host = "https://clob.polymarket.com";
    const chainId = 137;

    const client = new (ClobClient as unknown as new (h: string, c: number, w: unknown) => Record<string, (...a: unknown[]) => Promise<unknown>>)(host, chainId, wallet);
    await client.createOrDeriveApiKey();

    // Place a GTC limit order at the Gamma mid-price (signal.marketPrice
    // has already been set to CLOB mid by the engine).  This provides
    // liquidity instead of crossing the typically very wide spread.
    const limitPrice = Math.round(signal.marketPrice * 100) / 100;
    const sizeShares = sizeUsd / limitPrice;

    const order = await client.createAndPostOrder({
      tokenID: signal.bracket.tokenId,
      price: limitPrice,
      size: Math.round(sizeShares * 100) / 100,
      side: signal.side === "BUY" ? "BUY" : "SELL",
    }) as Record<string, unknown> | null;

    const orderId = order
      ? (order.orderID as string) ?? (order.id as string) ?? ""
      : "";

    const matched = order
      ? order.status === "matched" || order.success === true
      : false;

    return {
      id: tradeId,
      fillPrice: matched ? Number(order?.matchedPrice ?? limitPrice) : limitPrice,
      sizeShares,
      status: matched ? "FILLED" : "PENDING",
      orderId,
    };
  } catch (err) {
    console.error("[LIVE] Order execution failed:", err);
    return {
      id: tradeId,
      fillPrice: 0,
      sizeShares: 0,
      status: "REJECTED",
    };
  }
}
