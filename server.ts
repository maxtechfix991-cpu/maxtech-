import express, { Request, Response } from "express";
import path from "path";
import { createServer as createViteServer } from "vite";

// Set up express app
const app = express();
app.use(express.json());

const PORT = process.env.PORT ? parseInt(process.env.PORT) : (process.env.NODE_ENV === "production" ? 80 : 3000);

// Hardcoded initial simulated asset prices & balances for realistic mock behavior
const mockMarketPrices: Record<string, number> = {
  "BTC/USDT": 67500.0,
  "ETH/USDT": 3450.0,
  "SOL/USDT": 145.0,
  "BNB/USDT": 580.0,
};

// Simulated Exchange API Client handlers for balance and trade execution checks
// Supports Binance, Coinbase, OKX, and Bybit
interface OpenTradePayload {
  exchange: string;
  pair: string;
  amount: number;
  direction: "long" | "short";
  apiKey: string;
  apiSecret: string;
  userBalance: number; // Simulated account status
}

// 1. API: Fetch Live Simulated Market Prices
app.get("/api/market-prices", (req: Request, res: Response) => {
  res.json({
    success: true,
    prices: mockMarketPrices,
    timestamp: new Date().toISOString(),
  });
});

// 2. API: Check Exchange API Connection & Fetch Virtual Balances
app.post("/api/exchange/balance", (req: Request, res: Response) => {
  const { exchange, apiKey, apiSecret } = req.body;

  if (!exchange || !apiKey || !apiSecret) {
    res.status(400).json({
      success: false,
      message: "Exchange name, API key, and Secret are required to fetch balance.",
    });
    return;
  }

  // Generate realistic balance details for selected exchanges based on credentials (deterministic simulation)
  const isDemo = apiKey.toLowerCase().includes("demo") || apiKey.toLowerCase().includes("test");
  const baseSeed = apiKey.split("").reduce((acc: number, char: string) => acc + char.charCodeAt(0), 0) % 10000;
  const usdtBal = isDemo ? 10000 : (baseSeed * 2.5) + 500;
  const btcBal = isDemo ? 0.25 : (baseSeed * 0.0001) + 0.02;
  const ethBal = isDemo ? 2.0 : (baseSeed * 0.001) + 0.15;
  const solBal = isDemo ? 15.0 : (baseSeed * 0.015) + 1.2;

  res.json({
    success: true,
    exchange,
    balances: {
      USDT: parseFloat(usdtBal.toFixed(2)),
      BTC: parseFloat(btcBal.toFixed(4)),
      ETH: parseFloat(ethBal.toFixed(3)),
      SOL: parseFloat(solBal.toFixed(1)),
    },
    message: "Successfully synchronized with exchange API.",
  });
});

// 3. API: Validate Balance & Mock Open Trade with trailing TP/SL parameters (simulated server-side endpoint)
app.post("/api/trade/open", (req: Request, res: Response) => {
  const {
    exchange,
    pair,
    amount,
    direction,
    apiKey,
    apiSecret,
    userBalance,
  } = req.body as OpenTradePayload;

  if (!exchange || !pair || !amount || !apiKey || !apiSecret) {
    res.status(400).json({
      success: false,
      message: "Insufficient parameters to initiate exchange order.",
    });
    return;
  }

  const currentPrice = mockMarketPrices[pair] || 100.0;
  const requiredUsdt = amount; 

  // Validate balance check
  if (userBalance < requiredUsdt) {
    res.status(400).json({
      success: false,
      message: `Trade Rejected: Insufficient balance on ${exchange}. Required: ${requiredUsdt} USDT, Available: ${userBalance} USDT.`,
    });
    return;
  }

  // Simulate order execution fill
  const contractSize = requiredUsdt / currentPrice;

  res.json({
    success: true,
    message: `Order filled successfully on ${exchange}!`,
    details: {
      orderId: `EX-${Math.floor(Math.random() * 900000) + 100000}`,
      pair,
      direction,
      entryPrice: currentPrice,
      quantity: parseFloat(contractSize.toFixed(6)),
      cost: requiredUsdt,
      timestamp: new Date().toISOString(),
    },
  });
});

// 4. API: Receive webhooks for Signal Bot Actions from external services (e.g. TradingView alerts)
// Payload format:
// {
//   "secret": "YOUR_BOT_WEBHOOK_SECRET",
//   "action": "buy" | "sell" | "safety",
//   "pair": "BTC/USDT",
//   "botId": "bot_identifier",
//   "price": 67500.0
// }
interface ReceivedSignalLog {
  id: string;
  botId: string;
  action: string;
  pair: string;
  price: number;
  secret: string;
  hookTime: string;
  success: boolean;
  message: string;
  clientIp?: string;
  userAgent?: string;
}

const receivedSignalsLog: ReceivedSignalLog[] = [];

app.post("/api/webhook/signal", (req: Request, res: Response) => {
  const { secret, action, pair, botId, price } = req.body;

  const success = !!(secret && action && pair && botId);
  const message = success ? "Signal processed successfully" : "Missing parameters. Required: secret, action, pair, botId";

  const cleanSecret = secret 
    ? (secret.length > 8 ? `${secret.substring(0, 4)}...${secret.substring(secret.length - 4)}` : "***") 
    : "none";

  const logEntry: ReceivedSignalLog = {
    id: `SIG-${Math.floor(Math.random() * 900000) + 100000}`,
    botId: botId || "missing",
    action: action || "missing",
    pair: pair || "missing",
    price: price ? parseFloat(price) : (mockMarketPrices[pair as string] || 100.0),
    secret: cleanSecret,
    hookTime: new Date().toISOString(),
    success,
    message,
    clientIp: (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown").toString(),
    userAgent: req.headers["user-agent"] || "unknown",
  };

  receivedSignalsLog.unshift(logEntry);
  if (receivedSignalsLog.length > 200) {
    receivedSignalsLog.pop();
  }

  if (!success) {
    res.status(400).json({
      success: false,
      message,
    });
    return;
  }

  // Log signal receipt
  console.log(`[Webhook Recv] Bot: ${botId}, Action: ${action}, Pair: ${pair}, Price: ${logEntry.price}`);

  res.json({
    success: true,
    message: "Signal processed successfully",
    hookTime: logEntry.hookTime,
    signal: {
      id: logEntry.id,
      botId,
      action,
      pair,
      executedPrice: logEntry.price,
      status: "executed",
    },
  });
});

// fetch all logged webhook alerts (used by UI for TradingView Webhook checker option)
app.get("/api/webhook/signals-log", (req: Request, res: Response) => {
  res.json({
    success: true,
    signals: receivedSignalsLog,
  });
});

// clear the logged webhook alerts
app.post("/api/webhook/clear-log", (req: Request, res: Response) => {
  receivedSignalsLog.length = 0;
  res.json({
    success: true,
    message: "Signals log cleared successfully",
  });
});

// 5. API: Fetch Real Live Futures Pairs and Mark Prices from Binance Futures API
app.get("/api/futures/all-pairs", async (req: Request, res: Response) => {
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 4000); // 4 seconds timeout guard

    const response = await fetch("https://fapi.binance.com/fapi/v1/ticker/price", { signal: controller.signal });
    clearTimeout(id);

    if (response.ok) {
      const data = await response.json() as Array<{ symbol: string; price: string }>;
      
      // Filter out only USDT pairs, e.g., BTCUSDT, ETHUSDT, SOLUSDT...
      const usdtPairs = data
        .filter(item => item.symbol.endsWith("USDT") && !item.symbol.includes("_"))
        .map(item => {
          const symStr = item.symbol;
          // Format symbol: convert "BTCUSDT" to "BTC/USDT"
          const base = symStr.replace("USDT", "");
          return {
            symbol: `${base}/USDT`,
            price: parseFloat(item.price)
          };
        });

      if (usdtPairs.length > 0) {
        // Return first 60 popular instruments to prevent UI overflow while offering plenty of choices
        const priority = ["BTC/USDT", "ETH/USDT", "SOL/USDT", "BNB/USDT", "XRP/USDT", "ADA/USDT", "DOGEUSDT", "DOTUSDT", "LINKUSDT", "AVAXUSDT"];
        const sorted = usdtPairs.sort((a, b) => {
          const aIndex = priority.indexOf(a.symbol);
          const bIndex = priority.indexOf(b.symbol);
          if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
          if (aIndex !== -1) return -1;
          if (bIndex !== -1) return 1;
          return a.symbol.localeCompare(b.symbol);
        });

        res.json({
          success: true,
          source: "Binance Futures Live API",
          pairs: sorted,
          timestamp: new Date().toISOString()
        });
        return;
      }
    }
  } catch (err) {
    console.warn("Binance API fetch failed, loading robust simulated instruments fallback. Error:", err);
  }

  // High performance fallback instruments
  const fallbackPrices = [
    { symbol: "BTC/USDT", price: 67340.5 },
    { symbol: "ETH/USDT", price: 3455.20 },
    { symbol: "SOL/USDT", price: 146.15 },
    { symbol: "BNB/USDT", price: 582.40 },
    { symbol: "XRP/USDT", price: 0.5230 },
    { symbol: "ADA/USDT", price: 0.4560 },
    { symbol: "DOGE/USDT", price: 0.1412 },
    { symbol: "DOT/USDT", price: 6.85 },
    { symbol: "LINK/USDT", price: 15.65 },
    { symbol: "AVAX/USDT", price: 32.10 },
    { symbol: "LTC/USDT", price: 81.35 },
    { symbol: "NEAR/USDT", price: 6.12 }
  ];

  res.json({
    success: true,
    source: "Apex Simulated Futures Feed",
    pairs: fallbackPrices,
    timestamp: new Date().toISOString()
  });
});

// Vite server startup config
async function bootstrap() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req: Request, res: Response) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Crypto Signal and DCA Bot Server running on http://0.0.0.0:${PORT}`);
  });
}

bootstrap();
