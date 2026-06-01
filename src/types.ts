export interface UserProfile {
  uid: string;
  email: string;
  recoveryPhrase: string;
  apiKeys: Record<string, { apiKey: string; apiSecret: string }>;
  balances: Record<string, Record<string, number>>; // exchangeId -> { USDT, BTC, ETH... }
  spotBalances?: Record<string, Record<string, number>>; // exchangeId -> { USDT, BTC, ETH... }
  futuresBalances?: Record<string, Record<string, number>>; // exchangeId -> { USDT, BTC, ETH... }
  createdAt: string;
}

export interface TradingBot {
  id: string;
  userId: string;
  name: string;
  type: "signal" | "dca";
  marketType?: "spot" | "futures"; // Spot vs Futures trading mode
  status: "active" | "paused";
  pair: string;
  baseOrderSize: number; // in USDT
  // DCA Specific properties
  safetyOrderSize?: number; // in USDT
  priceDeviation?: number; // percentage price trigger
  maxSafetyOrders?: number; // maximum safety orders
  // Safety indicators
  takeProfitPercent: number; // target percentage profit
  trailingTpPercent?: number; // trailing activation offset (deviation tolerance)
  stopLossPercent?: number; // fallback stop loss percentage
  trailingSlEnabled?: boolean; // dynamic trailing stop loss
  webhookSecret: string; // secret authentication token for TV alerts
  webhookUrl?: string; // unique webhook endpoint url
  leverage?: number; // risk management leverage multiplier (e.g. 10x)
  maxPositionSize?: number; // max budget/position size (USDT)
  paperTrading?: boolean; // paper trading simulation toggle
  capitalProtection?: number; // equity threshold preservation limit (%)
  exchange?: string; // target execution market exchange (e.g. binance, bybit)
  createdAt: string;
}

export interface Position {
  id: string;
  userId: string;
  botId: string;
  botName: string;
  pair: string;
  type: "long" | "short";
  status: "open" | "closed";
  marketType?: "spot" | "futures"; // Spot vs Futures market selector
  entryPrice: number;
  currentPrice: number;
  amount: number; // absolute quantity of contracts held
  totalInvested: number; // cumulative size in USDT
  safetyOrdersCount: number; // counting active scale-ins
  maxPriceSeen: number; // high-water mark for trailing TP
  minPriceSeen?: number; // low-water mark for trailing stop loss (dynamic)
  trailingTpActive: boolean; // active trailing stop state
  tpTriggerPrice: number; // take-profit threshold price
  slTriggerPrice: number; // stop-loss threshold price
  pnl: number; // USDT profit size
  pnlPercent: number; // relative ROI
  paperTrading?: boolean; // toggle for sandbox separation
  exchange?: string; // target market exchange
  createdAt: string;
  closedAt?: string;
  closeReason?: "tp" | "sl" | "trailing_tp" | "manual" | "webhook";
}

export interface SystemLog {
  id: string;
  userId: string;
  botId?: string;
  botName?: string;
  message: string;
  type: "info" | "trade" | "dca_fill" | "tp_fill" | "sl_fill" | "error";
  timestamp: string;
}

export interface MarketPrice {
  pair: string;
  price: number;
  change24h: number;
}
