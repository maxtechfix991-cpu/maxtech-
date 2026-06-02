import React, { useState, useEffect, useMemo, useRef } from "react";
import { UserProfile, TradingBot, Position, SystemLog } from "../types";
import { dbService } from "../utils/db";
import { INITIAL_PRICES, INITIAL_CHANGES, getUpdatedPrices, tickPositions } from "../utils/tradingEngine";
import LiveChart from "./LiveChart";
import {
  Activity,
  PlusCircle,
  Play,
  Pause,
  Trash2,
  RefreshCw,
  LogOut,
  Wallet,
  Settings,
  HelpCircle,
  Code,
  Terminal,
  Compass,
  Link,
  Shield, Check, ArrowUpRight, ArrowDownRight, User,
  Edit, Copy, Search, Sliders, Globe, AlertTriangle, ShieldAlert, XCircle, History, Briefcase, TrendingUp, Radio, ArrowLeftRight, Download
} from "lucide-react";

interface MainTerminalProps {
  user: UserProfile;
  onLogout: () => void;
}

export default function MainTerminal({ user, onLogout }: MainTerminalProps) {
  // Application Data States
  const [currentUser, setCurrentUser] = useState<UserProfile>(user);
  const [bots, setBots] = useState<TradingBot[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [balances, setBalances] = useState<Record<string, Record<string, number>>>(() => {
    const fallbackBalances = {
      binance: { USDT: 15300.0, BTC: 0.12, ETH: 1.5, SOL: 0 },
      bybit: { USDT: 8400.0, BTC: 0.05, ETH: 0, SOL: 22.0 },
      okx: { USDT: 4200.0, BTC: 0, ETH: 3.2, SOL: 15.0 },
      coinbase: { USDT: 12000.0, BTC: 0.18, ETH: 4.0, SOL: 5.0 },
      weexio: { USDT: 9500.0, BTC: 0.08, ETH: 2.1, SOL: 12.0 },
      "gate.io": { USDT: 11000.0, BTC: 0.15, ETH: 3.5, SOL: 8.0 }
    };
    return { ...fallbackBalances, ...(user.balances || {}) };
  });

  // Trade History States
  const [closedPositions, setClosedPositions] = useState<Position[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historySortKey, setHistorySortKey] = useState<"closedAt" | "pnl" | "pnlPercent" | "pair" | "amount" | "totalInvested">("closedAt");
  const [historySortOrder, setHistorySortOrder] = useState<"asc" | "desc">("desc");
  const [historyPage, setHistoryPage] = useState<number>(1);
  const [historyLimit, setHistoryLimit] = useState<number>(10);
  const [historySearchQuery, setHistorySearchQuery] = useState("");

  // Trade History filters states (Durable, multi-exchange)
  const [historyMarketType, setHistoryMarketType] = useState<"all" | "spot" | "futures">("all");
  const [historyPairFilter, setHistoryPairFilter] = useState<string>("all");
  const [historyDateRange, setHistoryDateRange] = useState<"all" | "1d" | "7d" | "30d">("all");
  const [historyAutoRefresh, setHistoryAutoRefresh] = useState<boolean>(false);

  // Global customizable preferences & defaults (Auto-Saves to cloud)
  const [globalSettings, setGlobalSettings] = useState(() => {
    const fallbackSettings = {
      defaultLeverage: 10,
      defaultPaperTrading: true,
      maxPositionSizeLimit: 25000,
      soundAlertsEnabled: true,
      autoRefillEnabled: true,
      priceTickRate: 3500,
      dbSyncRate: 10000,
      hideApiKeys: false
    };
    return { ...fallbackSettings, ...(user.settings || {}) };
  });
  const [showAutoSaveTick, setShowAutoSaveTick] = useState(false);

  // Live market price feeds
  const [marketPrices, setMarketPrices] = useState<Record<string, number>>(INITIAL_PRICES);
  const [priceHistories, setPriceHistories] = useState<Record<string, number[]>>({
    "BTC/USDT": [67500, 67520, 67480, 67520],
    "ETH/USDT": [3460, 3465, 3455, 3465],
    "SOL/USDT": [146.0, 146.5, 145.8, 146.5],
    "BNB/USDT": [581.0, 582.0, 580.8, 582.0],
  });

  // Real Public Exchange API state
  const [futuresPairs, setFuturesPairs] = useState<{ symbol: string; price: number }[]>([]);
  const [isApiLoading, setIsApiLoading] = useState(false);
  const [apiPairsSource, setApiPairsSource] = useState<string>("Admin Desk Feeds");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedLeverage, setSelectedLeverage] = useState<number>(20);

  // Bot Editing Modal States
  const [editingBot, setEditingBot] = useState<TradingBot | null>(null);
  const [editBotName, setEditBotName] = useState("");
  const [editBotPair, setEditBotPair] = useState("");
  const [editBotBaseOrder, setEditBotBaseOrder] = useState<number>(50);
  const [editBotSafetyOrder, setEditBotSafetyOrder] = useState<number>(100);
  const [editBotDeviation, setEditBotDeviation] = useState<number>(2.0);
  const [editBotMaxSafety, setEditBotMaxSafety] = useState<number>(3);
  const [editBotTakeProfit, setEditBotTakeProfit] = useState<number>(2.0);
  const [editBotTrailingProfit, setEditBotTrailingProfit] = useState<number>(0.2);
  const [editBotStopLoss, setEditBotStopLoss] = useState<number>(3.0);
  const [editBotTrailingSL, setEditBotTrailingSL] = useState(false);
  const [editBotTrailingTpEnabled, setEditBotTrailingTpEnabled] = useState(true);
  const [editPairSearchQuery, setEditPairSearchQuery] = useState("");
  const [editBotLeverage, setEditBotLeverage] = useState<number>(1);
  const [editBotMarginPercent, setEditBotMarginPercent] = useState<number>(10);

  // Position-Level Stop Loss, Take Profit, and Trailing Profit Custom states
  const [editingPositionTargetsId, setEditingPositionTargetsId] = useState<string | null>(null);
  const [positionTargetSlPrice, setPositionTargetSlPrice] = useState<number>(0);
  const [positionTargetTpPrice, setPositionTargetTpPrice] = useState<number>(0);
  const [positionTargetTrailTpOffset, setPositionTargetTrailTpOffset] = useState<number>(0);
  const [positionTargetTrailEnabled, setPositionTargetTrailEnabled] = useState<boolean>(false);

  // Copy indicators state & Webhook Payload Action toggles
  const [copiedStates, setCopiedStates] = useState<Record<string, boolean>>({});
  const [botPayloadActions, setBotPayloadActions] = useState<Record<string, "buy" | "sell" | "safety">>({});

  const lastSignalsCountRef = useRef<number>(0);

  // Audio chime synthesizer for TradingView integration alerts
  const playAlertBeepSound = () => {
    if (!globalSettings?.soundAlertsEnabled) return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gainNode = ctx.createGain();
      
      osc1.connect(gainNode);
      osc2.connect(gainNode);
      gainNode.connect(ctx.destination);
      
      osc1.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc1.type = "sine";
      
      osc2.frequency.setValueAtTime(880, ctx.currentTime); // A5
      osc2.type = "sine";
      
      gainNode.gain.setValueAtTime(0.12, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
      
      osc1.start(ctx.currentTime);
      osc2.start(ctx.currentTime);
      
      osc1.stop(ctx.currentTime + 0.35);
      osc2.stop(ctx.currentTime + 0.35);
    } catch (err) {
      console.warn("Audio Context playback ignored:", err);
    }
  };

  // UI Navigation states
  const [activeTab, setActiveTab] = useState<"dashboard" | "create_bot" | "bot_list" | "exchanges" | "trade_history" | "deals_terminal" | "tradingview_webhooks">("dashboard");
  const [dealsSupTab, setDealsSupTab] = useState<"active" | "closed" | "logs">("active");
  const [dealsSearchQuery, setDealsSearchQuery] = useState("");
  const [selectedPair, setSelectedPair] = useState("BTC/USDT");

  // Exchange Connection Form
  const [exchangeSelect, setExchangeSelect] = useState("binance");
  const [exchangeApiKey, setExchangeApiKey] = useState("");
  const [exchangeApiSecret, setExchangeApiSecret] = useState("");
  const [exchangeSyncLoading, setExchangeSyncLoading] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);

  // Bot Creator Form States
  const [botName, setBotName] = useState("");
  const [botType, setBotType] = useState<"signal" | "dca">("signal");
  const [botPair, setBotPair] = useState("BTC/USDT");
  const [botBaseOrder, setBotBaseOrder] = useState<number>(50);
  const [botSafetyOrder, setBotSafetyOrder] = useState<number>(100);
  const [botDeviation, setBotDeviation] = useState<number>(2.0);
  const [botMaxSafety, setBotMaxSafety] = useState<number>(3);
  
  // Exit configurations
  const [botTakeProfit, setBotTakeProfit] = useState<number>(2.0);
  const [botTrailingProfit, setBotTrailingProfit] = useState<number>(0.2);
  const [botStopLoss, setBotStopLoss] = useState<number>(3.0);
  const [botTrailingSL, setBotTrailingSL] = useState(false);
  const [botTrailingTpEnabled, setBotTrailingTpEnabled] = useState(true);
  const [pairSearchQuery, setPairSearchQuery] = useState("");

  // Risk management and exchange configurations
  const [botExchange, setBotExchange] = useState("binance");
  const [botLeverage, setBotLeverage] = useState<number>(1); // 1x to 50x
  const [botMarginPercent, setBotMarginPercent] = useState<number>(10); // Committed margin percentage (1% to 100%)
  const [botMaxPositionSize, setBotMaxPositionSize] = useState<number>(1000); // Nominal cap in USDT
  const [botPaperTrading, setBotPaperTrading] = useState<boolean>(true); // Paper trading simulation toggle
  const [botCapitalProtection, setBotCapitalProtection] = useState<number>(0); // Absolute safety limit (USDT)
  const [simulateMismatch, setSimulateMismatch] = useState<boolean>(false); // Balance mismatch checker simulation
  const [walletLogs, setWalletLogs] = useState<string[]>([]); // Synced ledger execution audit notes
  const [withdrawalBlockMsg, setWithdrawalBlockMsg] = useState<string | null>(null); // Withdrawal restriction lock message

  // Master control state for Sandbox vs Real Trading Mode (Do not use sandbox/testnet by default)
  const [globalMode, setGlobalMode] = useState<"real" | "sandbox">("real");
  const [selectedAccountType, setSelectedAccountType] = useState<"spot" | "futures">("spot");

  // Spot vs Futures separate wallets state management
  const [spotBalances, setSpotBalances] = useState<Record<string, Record<string, number>>>(() => {
    const fallbackSpot = {
      binance: { USDT: 25000.0, BTC: 0.5, ETH: 3.0, SOL: 45.0 },
      bybit: { USDT: 12400.0, BTC: 0.08, ETH: 1.0, SOL: 10.0 },
      okx: { USDT: 6200.0, BTC: 0, ETH: 1.5, SOL: 5.0 },
      coinbase: { USDT: 15000.0, BTC: 0.25, ETH: 5.0, SOL: 8.0 },
      weexio: { USDT: 11500.0, BTC: 0.1, ETH: 2.5, SOL: 14.0 },
      "gate.io": { USDT: 13000.0, BTC: 0.2, ETH: 4.0, SOL: 10.0 },
      kucoin: { USDT: 9600.0, BTC: 0.05, ETH: 1.8, SOL: 6.0 }
    };
    return { ...fallbackSpot, ...(user.spotBalances || {}) };
  });

  const [futuresBalances, setFuturesBalances] = useState<Record<string, Record<string, number>>>(() => {
    const fallbackFutures = {
      binance: { USDT: 15300.0, BTC: 0.12, ETH: 1.5, SOL: 0 },
      bybit: { USDT: 8400.0, BTC: 0.05, ETH: 0, SOL: 22.0 },
      okx: { USDT: 4200.0, BTC: 0, ETH: 3.2, SOL: 15.0 },
      coinbase: { USDT: 12000.0, BTC: 0.18, ETH: 4.0, SOL: 5.0 },
      weexio: { USDT: 9500.0, BTC: 0.08, ETH: 2.1, SOL: 12.0 },
      "gate.io": { USDT: 11000.0, BTC: 0.15, ETH: 3.5, SOL: 8.0 },
      kucoin: { USDT: 7600.0, BTC: 0.03, ETH: 1.2, SOL: 4.0 }
    };
    return { ...fallbackFutures, ...(user.futuresBalances || {}) };
  });

  // Fund Transfer UI Form states
  const [transferAsset, setTransferAsset] = useState<string>("USDT");
  const [transferAmount, setTransferAmount] = useState<string>("");
  const [transferDirection, setTransferDirection] = useState<"spot_to_futures" | "futures_to_spot">("spot_to_futures");
  const [transferLoading, setTransferLoading] = useState<boolean>(false);
  const [transferStatusMsg, setTransferStatusMsg] = useState<string | null>(null);

  // Memoized select-mode active balances
  const activeBalances = useMemo(() => {
    const rawBalances = selectedAccountType === "spot" ? spotBalances : futuresBalances;
    return rawBalances;
  }, [selectedAccountType, spotBalances, futuresBalances]);

  // Memoized displayed active bots with full administrator access
  const displayedBots = useMemo(() => {
    return bots;
  }, [bots]);

  // Memoized displayed active positions under full control
  const displayedPositions = useMemo(() => {
    return positions;
  }, [positions]);

  const handleBlockWithdrawal = async (exchangeId: string, asset: string, defaultAmount: string) => {
    try {
      const resp = await fetch("/api/exchange/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uid: currentUser?.uid,
          exchange: exchangeId,
          asset,
          amount: parseFloat(defaultAmount) || 500,
          address: "0xEnforcedSecureWhitelistedSandboxReadonlyAddress"
        })
      });
      const data = await resp.json();
      if (!data.success) {
        setWithdrawalBlockMsg(data.message || "Withdrawals are strictly disabled by Read-Only Sandbox policy.");
        triggerNotification(`⚠️ Security Blocked: Withdrawals are disabled server-side.`, "error");
      }
    } catch (e) {
      setWithdrawalBlockMsg("❌ SECURITY DISALLOWANCE: Withdrawal requests are blocked server-side under read-only API configuration standards.");
    }
  };

  // Webhook Signal Tester State
  const [testerBotId, setTesterBotId] = useState("");
  const [testerAction, setTesterAction] = useState<"buy" | "sell" | "safety">("buy");
  const [testerLoading, setTesterLoading] = useState(false);
  const [testerResponse, setTesterResponse] = useState<any | null>(null);
  const [incomingSignals, setIncomingSignals] = useState<any[]>([]);
  const [isClearingSignals, setIsClearingSignals] = useState(false);

  // General Notification Alert
  const [notif, setNotif] = useState<{ message: string; type: "success" | "info" | "error" } | null>(null);

  const triggerNotification = (message: string, type: "success" | "info" | "error" = "info") => {
    setNotif({ message, type });
    setTimeout(() => setNotif(null), 5000);
  };

  // Customizable Webhook URL parameters for VPS deployment copying
  const [webhookProtocol, setWebhookProtocol] = useState(() => {
    return localStorage.getItem("apex_webhook_protocol") || "http";
  });
  const [webhookHost, setWebhookHost] = useState(() => {
    return localStorage.getItem("apex_webhook_host") || (window.location.hostname.includes("run.app") ? "your-vps-ip" : window.location.hostname);
  });
  const [webhookPort, setWebhookPort] = useState(() => {
    return localStorage.getItem("apex_webhook_port") || "80";
  });

  // Effect to sync customization with localStorage
  useEffect(() => {
    localStorage.setItem("apex_webhook_protocol", webhookProtocol);
    localStorage.setItem("apex_webhook_host", webhookHost);
    localStorage.setItem("apex_webhook_port", webhookPort);
  }, [webhookProtocol, webhookHost, webhookPort]);

  const computedWebhookUrl = useMemo(() => {
    const protocolStr = webhookProtocol ? `${webhookProtocol}://` : "http://";
    const portStr = webhookPort && webhookPort !== "80" && webhookPort !== "443" ? `:${webhookPort}` : "";
    return `${protocolStr}${webhookHost}${portStr}/webhook/:botId`;
  }, [webhookProtocol, webhookHost, webhookPort]);

  // Unified global Webhook secret for all created bots
  const globalWebhookSecret = useMemo(() => {
    return `wh_usr_${currentUser.uid.replace(/[^\w]/g, "").substring(0, 8)}_${currentUser.recoveryPhrase}`;
  }, [currentUser]);

  // Clipboard copies handler (With hyper-reliable fallback for iframes and insecure contexts)
  const handleCopyText = (key: string, value: string) => {
    const fallbackCopy = (text: string) => {
      try {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        textArea.style.position = "fixed";
        textArea.style.top = "0";
        textArea.style.left = "0";
        textArea.style.width = "2em";
        textArea.style.height = "2em";
        textArea.style.padding = "0";
        textArea.style.border = "none";
        textArea.style.outline = "none";
        textArea.style.boxShadow = "none";
        textArea.style.background = "transparent";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        const successful = document.execCommand("copy");
        document.body.removeChild(textArea);
        return successful;
      } catch (err) {
        console.error("Fallback DOM copy failed:", err);
        return false;
      }
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(value)
        .then(() => {
          setCopiedStates(prev => ({ ...prev, [key]: true }));
          setTimeout(() => setCopiedStates(prev => ({ ...prev, [key]: false })), 1500);
        })
        .catch(() => {
          const ok = fallbackCopy(value);
          if (ok) {
            setCopiedStates(prev => ({ ...prev, [key]: true }));
            setTimeout(() => setCopiedStates(prev => ({ ...prev, [key]: false })), 1500);
          } else {
            triggerNotification("Browser security restricted direct clipboard copying.", "error");
          }
        });
    } else {
      const ok = fallbackCopy(value);
      if (ok) {
        setCopiedStates(prev => ({ ...prev, [key]: true }));
        setTimeout(() => setCopiedStates(prev => ({ ...prev, [key]: false })), 1500);
      } else {
        triggerNotification("Browser security restricted direct clipboard copying.", "error");
      }
    }
  };

  // Fetch real futures pairs from the API
  const fetchLiveFuturesPairs = async () => {
    setIsApiLoading(true);
    try {
      const res = await fetch("/api/futures/all-pairs");
      const data = await res.json();
      if (data.success && data.pairs) {
        setFuturesPairs(data.pairs);
        setApiPairsSource(data.source);
        
        // Merge fetched assets dynamically into marketPrices state
        setMarketPrices(prev => {
          const updatedPrices = { ...prev };
          data.pairs.forEach((p: { symbol: string; price: number }) => {
            updatedPrices[p.symbol] = p.price;
          });
          return updatedPrices;
        });

        // Initialize priceHistory arrays for newly fetched pairs
        setPriceHistories(prev => {
          const nextHistories = { ...prev };
          data.pairs.forEach((p: { symbol: string; price: number }) => {
            if (!nextHistories[p.symbol]) {
              // Generate slightly varied back histories centered around current price
              const base = p.price;
              nextHistories[p.symbol] = [
                base * 0.998,
                base * 1.001,
                base * 0.999,
                base * 1.002,
                base
              ];
            }
          });
          return nextHistories;
        });

        triggerNotification(`Live Pairs loaded from ${data.source}!`, "success");
      }
    } catch (e) {
      console.error("Failed to load real-time instruments API. Fallback triggered.", e);
    } finally {
      setIsApiLoading(false);
    }
  };

  // Trigger pairs query on load
  useEffect(() => {
    fetchLiveFuturesPairs();
  }, []);

  const historyAutoRefreshRef = useRef(historyAutoRefresh);
  useEffect(() => {
    historyAutoRefreshRef.current = historyAutoRefresh;
  }, [historyAutoRefresh]);

  // ----------------------------------------------------
  // REAL-TIME FIRESTORE BACKGROUND SYNCHRONIZATION ENGINE
  // ----------------------------------------------------
  const syncStateWithDatabase = async (isInitial = false) => {
    if (!currentUser?.uid) return;
    try {
      const [loadedBots, loadedPos, loadedLogs, updatedProfile] = await Promise.all([
        dbService.getBots(currentUser.uid),
        dbService.getPositions(currentUser.uid),
        dbService.getLogs(currentUser.uid),
        dbService.getUserProfile(currentUser.uid)
      ]);
      
      setBots(loadedBots);
      setPositions(loadedPos.filter(p => p.status === "open"));
      if (isInitial || historyAutoRefreshRef.current) {
        setClosedPositions(loadedPos.filter(p => p.status === "closed"));
      }
      setLogs(loadedLogs);

      if (updatedProfile && updatedProfile.balances) {
        setBalances(updatedProfile.balances);
        setCurrentUser(updatedProfile);
      }

      if (isInitial && loadedBots.length > 0) {
        setTesterBotId(prev => prev || loadedBots[0].id);
      }
    } catch (e) {
      console.error("Failed periodic database sync in background:", e);
    }
  };

  useEffect(() => {
    if (!currentUser || !currentUser.uid) return;
    
    // Core initial hydration
    syncStateWithDatabase(true);

    // Dynamic background poll interval (every 4000ms) to capture external webhook runs automatically
    const syncInterval = setInterval(() => syncStateWithDatabase(false), globalSettings.dbSyncRate || 10000);
    return () => clearInterval(syncInterval);
  }, [currentUser?.uid, globalSettings.dbSyncRate]);

  // Fetch closed positions from the database
  const loadTradeHistory = async () => {
    setLoadingHistory(true);
    try {
      const loadedPos = await dbService.getPositions(currentUser.uid);
      const closed = loadedPos.filter(p => p.status === "closed");
      setClosedPositions(closed);
    } catch (e) {
      console.error("Error loading trade history:", e);
      triggerNotification("Failed to load trade history from database.", "error");
    } finally {
      setLoadingHistory(false);
    }
  };

  // Clear persistent terminated trade records manually
  const handleClearTradeHistory = async () => {
    if (!currentUser?.uid) return;
    const confirmClear = window.confirm("Are you sure you want to permanently clear all closed positions and trade history?");
    if (!confirmClear) return;

    try {
      setLoadingHistory(true);
      await dbService.clearTradeHistory(currentUser.uid);
      setClosedPositions([]);
      triggerNotification("Archival trade history cleared successfully.", "success");
      await dbService.addLog(
        currentUser.uid,
        "🧹 Archival [TRADE HISTORY CLEARED]: User cleared all terminated position records manually.",
        "info"
      );
    } catch (err: any) {
      console.error(err);
      triggerNotification("Failed to clear trade history.", "error");
    } finally {
      setLoadingHistory(false);
    }
  };

  // Export current filtered closed positions/deals ledger
  const handleExportTradeHistory = (format: "csv" | "json") => {
    if (filteredClosedPositions.length === 0) {
      triggerNotification("No closed deals found matching the current filters to export.", "info");
      return;
    }

    try {
      let dataStr = "";
      let mimeType = "";
      let filename = "";

      if (format === "json") {
        dataStr = JSON.stringify(filteredClosedPositions, null, 2);
        mimeType = "application/json";
        filename = `apex_trade_ledger_${new Date().toISOString().slice(0, 10)}.json`;
      } else {
        // Full CSV ledger implementation
        const csvHeaders = [
          "ID",
          "Bot Name",
          "Symbol Pair",
          "Order Direction",
          "Market Mode",
          "Target Exchange",
          "Entry Price",
          "Final Quantity",
          "Total Allocation (USDT)",
          "Multiplier Leverage",
          "DCA Increments Completed",
          "Reason Terminated",
          "Realized Profit/Loss (USDT)",
          "Net Return on Investment (%)",
          "Durable Paper Sandbox",
          "Position Logged At",
          "Position Closed At"
        ];

        const rows = filteredClosedPositions.map(p => [
          p.id,
          p.botName,
          p.pair,
          p.type.toUpperCase(),
          p.marketType || "spot",
          p.exchange || "binance",
          p.entryPrice,
          p.amount,
          p.totalInvested,
          p.leverage || 1,
          p.safetyOrdersCount,
          p.closeReason || "unknown",
          p.pnl.toFixed(4),
          p.pnlPercent.toFixed(2),
          p.paperTrading ? "SANDBOX" : "LIVE",
          p.createdAt,
          p.closedAt || ""
        ]);

        const csvContent = [
          csvHeaders.join(","),
          ...rows.map(r => r.map(columnVal => {
            const strVal = String(columnVal);
            if (strVal.includes(",") || strVal.includes("\n") || strVal.includes('"')) {
              return `"${strVal.replace(/"/g, '""')}"`;
            }
            return strVal;
          }).join(","))
        ].join("\n");

        dataStr = csvContent;
        mimeType = "text/csv;charset=utf-8;";
        filename = `apex_trade_ledger_${new Date().toISOString().slice(0, 10)}.csv`;
      }

      const blob = new Blob([dataStr], { type: mimeType });
      const dlUrl = URL.createObjectURL(blob);
      const tempLink = document.createElement("a");
      tempLink.setAttribute("href", dlUrl);
      tempLink.setAttribute("download", filename);
      tempLink.style.visibility = "hidden";
      document.body.appendChild(tempLink);
      tempLink.click();
      document.body.removeChild(tempLink);

      triggerNotification(`Successfully compiled and downloaded ${filteredClosedPositions.length} deals in ${format.toUpperCase()} format.`, "success");
    } catch (e: any) {
      console.error("Export error:", e);
      triggerNotification("Export operation failed: " + e.message, "error");
    }
  };

  // Remove API key connection per exchange
  const handleRemoveExchangeKeys = async (exchangeKey: string) => {
    if (!currentUser?.uid) return;
    const confirmRemove = window.confirm(`Are you sure you want to disconnect and delete your API keys for ${exchangeKey.toUpperCase()}?`);
    if (!confirmRemove) return;

    try {
      setExchangeSyncLoading(true);
      const updatedKeys = { ...(currentUser.apiKeys || {}) };
      delete updatedKeys[exchangeKey];

      // Build updated profile
      const updatedProfile = {
        ...currentUser,
        apiKeys: updatedKeys
      };

      // Sync and save to database
      await fetch("/api/user/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: currentUser.uid,
          apiKeys: updatedKeys
        })
      });

      setCurrentUser(updatedProfile);
      localStorage.setItem("apex_trader_session", JSON.stringify(updatedProfile));
      triggerNotification(`Successfully disconnected ${exchangeKey.toUpperCase()} API connection keys.`, "success");
      
      await dbService.addLog(
        currentUser.uid,
        `🗝️ Exchange [KEY DELETED]: Removed credentials for ${exchangeKey.toUpperCase()} dynamically.`,
        "info"
      );
    } catch (err: any) {
      console.error(err);
      triggerNotification("Failed to disconnect exchange keys.", "error");
    } finally {
      setExchangeSyncLoading(false);
    }
  };

  // Auto-Save Customizable Global Settings UI parameters immediately to cloud instance
  const handleAutoSaveSettings = async (nextSettings: any) => {
    if (!currentUser?.uid) return;
    setGlobalSettings(nextSettings);
    setShowAutoSaveTick(true);

    try {
      const updatedProfile = {
        ...currentUser,
        settings: nextSettings
      };

      await fetch("/api/user/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: currentUser.uid,
          settings: nextSettings
        })
      });

      setCurrentUser(updatedProfile);
      localStorage.setItem("apex_trader_session", JSON.stringify(updatedProfile));
      
      setTimeout(() => setShowAutoSaveTick(false), 2000);
    } catch (err: any) {
      console.error("Auto-save settings failed:", err);
      triggerNotification("Preferences auto-save failed.", "error");
      setShowAutoSaveTick(false);
    }
  };

  useEffect(() => {
    if (activeTab === "trade_history") {
      loadTradeHistory();
    }
  }, [activeTab, currentUser]);

  const loadWebhookHistory = async () => {
    try {
      const res = await fetch("/api/webhook/signals-log");
      const data = await res.json();
      if (data.success && data.signals) {
        setIncomingSignals(data.signals);
        
        // Track count to play sound chime on increase
        if (lastSignalsCountRef.current > 0 && data.signals.length > lastSignalsCountRef.current) {
          playAlertBeepSound();
          triggerNotification("New TradingView signal alert received!", "info");
        }
        lastSignalsCountRef.current = data.signals.length;
      }
    } catch (e) {
      console.warn("Unable to fetch webhook history from express:", e);
    }
  };

  useEffect(() => {
    if (!currentUser || !currentUser.uid) return;
    loadWebhookHistory();
    const intervalId = setInterval(loadWebhookHistory, globalSettings.priceTickRate || 3500);
    return () => clearInterval(intervalId);
  }, [currentUser?.uid, globalSettings.priceTickRate]);

  // ----------------------------------------------------
  // RENDER-STABLE VALUE TRACKERS FOR REAL-TIME EVALUATION
  // ----------------------------------------------------
  const positionsRef = useRef(positions);
  const botsRef = useRef(bots);
  const balancesRef = useRef(balances);
  const currentUserRef = useRef(currentUser);

  useEffect(() => {
    positionsRef.current = positions;
  }, [positions]);

  useEffect(() => {
    botsRef.current = bots;
  }, [bots]);

  useEffect(() => {
    balancesRef.current = balances;
  }, [balances]);

  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

  // ----------------------------------------------------
  // REAL-TIME PRICE FEED AND TRADE EVALUATOR
  // ----------------------------------------------------
  useEffect(() => {
    let active = true;
    const handleTick = async () => {
      try {
        const res = await fetch("/api/market-prices");
        if (!active) return;
        const data = await res.json();
        if (data && data.success && data.spotPrices) {
          const nextPrices = { ...data.spotPrices };
          const futuresPrices = data.futuresPrices || {};

          setMarketPrices(prev => {
            const combined = { ...prev, ...nextPrices };
            // Update historical tracking blocks for live chart feeds
            setPriceHistories(prevHist => {
              const nextHist = { ...prevHist };
              for (const pair in combined) {
                const arr = prevHist[pair] ? [...prevHist[pair]] : [];
                arr.push(combined[pair]);
                if (arr.length > 40) arr.shift();
                nextHist[pair] = arr;
              }
              return nextHist;
            });
            return combined;
          });

          if (!currentUserRef.current || !currentUserRef.current.uid) return;

          // Perform math checks against Take-Profit, Trailing levels and DCA safety orders
          await tickPositions(
            currentUserRef.current.uid,
            positionsRef.current,
            botsRef.current,
            nextPrices,
            balancesRef.current,
            async (updatedPos) => {
              if (active) setPositions(updatedPos);
            },
            async (updatedBal) => {
              if (active) setBalances(updatedBal);
            },
            futuresPrices
          );
        }
      } catch (err) {
        console.error("Failed to fetch live real-time Binance prices inside loop:", err);
      }
    };

    handleTick();
    const interval = setInterval(handleTick, globalSettings.priceTickRate || 3500); // Dynamic tick rate
    return () => {
       active = false;
       clearInterval(interval);
    };
  }, [globalSettings.priceTickRate]);

  // Handle active position list for selected pair
  const activePositionForPair = useMemo(() => {
    return positions.find(p => p.pair === selectedPair && p.status === "open");
  }, [positions, selectedPair]);

  // Memoized search, sorting, and filtering of closed positions in Administrator Mode
  const filteredClosedPositions = useMemo(() => {
    let result = [...closedPositions];

    if (historySearchQuery.trim()) {
      const q = historySearchQuery.toLowerCase().trim();
      result = result.filter(
        p =>
          p.pair.toLowerCase().includes(q) ||
          p.botName.toLowerCase().includes(q) ||
          (p.closeReason && p.closeReason.toLowerCase().includes(q)) ||
          p.type.toLowerCase().includes(q)
      );
    }

    // Filter by MarketType (Spot/Futures)
    if (historyMarketType !== "all") {
      result = result.filter(p => {
        const isFutures = (p.leverage && p.leverage > 1) || p.marketType === "futures";
        return historyMarketType === "futures" ? isFutures : !isFutures;
      });
    }

    // Filter by Pairs
    if (historyPairFilter !== "all") {
      result = result.filter(p => p.pair === historyPairFilter);
    }

    // Filter by Date Range
    if (historyDateRange !== "all") {
      const now = new Date();
      result = result.filter(p => {
        if (!p.closedAt) return false;
        const closedDate = new Date(p.closedAt);
        const diffMs = now.getTime() - closedDate.getTime();
        const diffDays = diffMs / (1000 * 60 * 60 * 24);
        if (historyDateRange === "1d") return diffDays <= 1;
        if (historyDateRange === "7d") return diffDays <= 7;
        if (historyDateRange === "30d") return diffDays <= 30;
        return true;
      });
    }

    // Sort result
    result.sort((a, b) => {
      let valA: any = a[historySortKey];
      let valB: any = b[historySortKey];

      // Handle undefined/missing fields
      if (valA === undefined || valA === null) valA = "";
      if (valB === undefined || valB === null) valB = "";

      // Specific comparison logic
      if (typeof valA === "string" && typeof valB === "string") {
        return historySortOrder === "asc"
          ? valA.localeCompare(valB)
          : valB.localeCompare(valA);
      } else {
        // Numeric sort
        return historySortOrder === "asc"
          ? (valA as number) - (valB as number)
          : (valB as number) - (valA as number);
      }
    });

    return result;
  }, [closedPositions, historySearchQuery, historySortKey, historySortOrder, globalMode, historyMarketType, historyPairFilter, historyDateRange]);

  // Pagination calculation
  const totalItems = filteredClosedPositions.length;
  const totalPages = Math.ceil(totalItems / historyLimit) || 1;
  
  // Guard current page out of bounds
  const currentPage = Math.min(historyPage, totalPages);

  const paginatedClosedPositions = useMemo(() => {
    const startIndex = (currentPage - 1) * historyLimit;
    return filteredClosedPositions.slice(startIndex, startIndex + historyLimit);
  }, [filteredClosedPositions, currentPage, historyLimit]);

  // Cumulative metrics for Closed Trades
  const tradeMetrics = useMemo(() => {
    const total = closedPositions.length;
    const winsList = closedPositions.filter(p => p.pnl > 0);
    const lossesList = closedPositions.filter(p => p.pnl < 0);
    const wins = winsList.length;
    const losses = lossesList.length;
    const winRate = total > 0 ? (wins / total) * 100 : 0;
    const netPnl = closedPositions.reduce((acc, p) => acc + p.pnl, 0);
    const avgRoi = total > 0 ? closedPositions.reduce((acc, p) => acc + p.pnlPercent, 0) / total : 0;

    const totalGrossProfit = winsList.reduce((acc, p) => acc + p.pnl, 0);
    const totalGrossLoss = Math.abs(lossesList.reduce((acc, p) => acc + p.pnl, 0));

    const avgWinSize = wins > 0 ? totalGrossProfit / wins : 0;
    const avgLossSize = losses > 0 ? totalGrossLoss / losses : 0;

    let profitFactor: number | string = 0;
    if (totalGrossProfit === 0 && totalGrossLoss === 0) {
      profitFactor = "0.00";
    } else if (totalGrossLoss === 0) {
      profitFactor = "∞";
    } else {
      profitFactor = (totalGrossProfit / totalGrossLoss).toFixed(2);
    }

    return { 
      total, 
      wins, 
      losses, 
      winRate, 
      netPnl, 
      avgRoi, 
      avgWinSize, 
      avgLossSize, 
      profitFactor,
      totalGrossProfit,
      totalGrossLoss
    };
  }, [closedPositions]);

  // ----------------------------------------------------
  // API EXCHANGES CONNECT LOGIC
  // ----------------------------------------------------
  const handleExchangeSync = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!exchangeApiKey || !exchangeApiSecret) {
      triggerNotification("Please enter both API Key and API Secret.", "error");
      return;
    }

    setExchangeSyncLoading(true);
    setSyncStatus(null);
    setWalletLogs([]);
    try {
      const resp = await fetch("/api/exchange/balance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          exchange: exchangeSelect,
          apiKey: exchangeApiKey,
          apiSecret: exchangeApiSecret,
          simulateMismatch: simulateMismatch,
          globalMode: globalMode,
        }),
      });
      const data = await resp.json();

      if (data.success) {
        // Hydrate Spot and Futures balance updates in state & persistent Firestore profile
        const newSpotBalances = { ...spotBalances, [exchangeSelect]: data.spotBalances || data.balances };
        const newFuturesBalances = { ...futuresBalances, [exchangeSelect]: data.futuresBalances || data.balances };
        const newApiKeys = {
          ...(currentUser.apiKeys || {}),
          [exchangeSelect]: { apiKey: exchangeApiKey, apiSecret: exchangeApiSecret },
        };

        await dbService.updateUserProfile(currentUser.uid, {
          spotBalances: newSpotBalances,
          futuresBalances: newFuturesBalances,
          balances: newSpotBalances, // backwards compatibility
          apiKeys: newApiKeys,
        });

        setSpotBalances(newSpotBalances);
        setFuturesBalances(newFuturesBalances);
        setBalances(newSpotBalances);
        setCurrentUser(prev => ({
          ...prev,
          spotBalances: newSpotBalances,
          futuresBalances: newFuturesBalances,
          balances: newSpotBalances,
          apiKeys: newApiKeys
        }));

        if (data.auditLogs) {
          setWalletLogs(data.auditLogs);
        }

        if (data.apiWarning) {
          triggerNotification(`⚠️ Key Synced but with warning: ${data.apiWarning}`, "error");
        } else {
          triggerNotification(`Exchange API Keys synced for ${exchangeSelect.toUpperCase()}! Balances loaded successfully.`, "success");
        }

        const spotUsdt = data.spotBalances?.USDT ?? 0;
        const futUsdt = data.futuresBalances?.USDT ?? 0;
        setSyncStatus(`Sync Verified! Spot: ${spotUsdt} USDT, Futures: ${futUsdt} USDT (${globalMode === "sandbox" ? "Demo Sandbox" : "Production Account"})`);
        
        await dbService.addLog(
          currentUser.uid,
          `🗝️ Connected ${exchangeSelect.toUpperCase()} (${globalMode === "sandbox" ? "Demo" : "Real"}). Spot Balance: ${spotUsdt} USDT | Futures Balance: ${futUsdt} USDT. Permissions Certified!`,
          data.apiWarning ? "error" : "info"
        );
        
        // Clear inputs
        setExchangeApiKey("");
        setExchangeApiSecret("");
      } else {
        triggerNotification(data.message || "Failed to sync exchange API keys.", "error");
      }
    } catch (err) {
      triggerNotification("Synchronizing failed. Ensure Express server is compiled.", "error");
    } finally {
      setExchangeSyncLoading(false);
    }
  };

  // ----------------------------------------------------
  // FUND TRANSFER FUNCTIONALITY (SPOT <-> FUTURES)
  // ----------------------------------------------------
  const handleFundTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountNum = parseFloat(transferAmount);
    if (!transferAmount || isNaN(amountNum) || amountNum <= 0) {
      triggerNotification("Please enter a valid transfer amount greater than 0.", "error");
      return;
    }

    setTransferLoading(true);
    setTransferStatusMsg(null);

    const keys = currentUser.apiKeys?.[exchangeSelect] || {};
    const apiKey = keys.apiKey || "";
    const apiSecret = keys.apiSecret || "";

    try {
      const resp = await fetch("/api/exchange/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey,
          apiSecret,
          asset: transferAsset,
          amount: amountNum,
          direction: transferDirection,
          globalMode: globalMode,
          exchange: exchangeSelect
        })
      });
      const data = await resp.json();

      if (data.success) {
        // Adjust client states dynamically to show immediate outcome
        const currentExchangeSpot = spotBalances[exchangeSelect] || { USDT: 0, BTC: 0, ETH: 0, SOL: 0 };
        const currentExchangeFutures = futuresBalances[exchangeSelect] || { USDT: 0, BTC: 0, ETH: 0, SOL: 0 };

        const updatedSpot = { ...currentExchangeSpot };
        const updatedFutures = { ...currentExchangeFutures };

        const oldSpotVal = updatedSpot[transferAsset] || 0;
        const oldFuturesVal = updatedFutures[transferAsset] || 0;

        if (transferDirection === "spot_to_futures") {
          updatedSpot[transferAsset] = Math.max(0, oldSpotVal - amountNum);
          updatedFutures[transferAsset] = oldFuturesVal + amountNum;
        } else {
          updatedFutures[transferAsset] = Math.max(0, oldFuturesVal - amountNum);
          updatedSpot[transferAsset] = oldSpotVal + amountNum;
        }

        const newSpotBalances = { ...spotBalances, [exchangeSelect]: updatedSpot };
        const newFuturesBalances = { ...futuresBalances, [exchangeSelect]: updatedFutures };

        await dbService.updateUserProfile(currentUser.uid, {
          spotBalances: newSpotBalances,
          futuresBalances: newFuturesBalances,
          balances: newSpotBalances,
        });

        setSpotBalances(newSpotBalances);
        setFuturesBalances(newFuturesBalances);
        setBalances(newSpotBalances);
        setCurrentUser(prev => ({
          ...prev,
          spotBalances: newSpotBalances,
          futuresBalances: newFuturesBalances,
          balances: newSpotBalances
        }));

        const directionLabel = transferDirection === "spot_to_futures" ? "Spot ➡️ Futures" : "Futures ➡️ Spot";
        triggerNotification(`Funds transfer completed! Direction: ${directionLabel}`, "success");
        setTransferStatusMsg(`✅ Transfer Succeeded! Transferred ${amountNum} ${transferAsset} (${directionLabel}). Transaction ID: ${data.transactionId || "Approved"}`);
        setTransferAmount("");

        await dbService.addLog(
          currentUser.uid,
          `💸 Fund Transfer: Moved ${amountNum} ${transferAsset} via ${directionLabel} (${globalMode === "sandbox" ? "Demo" : "Real"}).`,
          "info"
        );
      } else {
        setTransferStatusMsg(`❌ Transfer Failed: ${data.message || "Unknown API response error."}`);
        triggerNotification(`Funds transfer failed: ${data.message || "Unknown error"}`, "error");
      }
    } catch (err: any) {
      setTransferStatusMsg(`❌ Error: Connection interrupted during transfer execution.`);
      triggerNotification("Transfer network failed. Ensure server is active.", "error");
    } finally {
      setTransferLoading(false);
    }
  };

  // ----------------------------------------------------
  // BOT CREATION FLOW
  // ----------------------------------------------------
  const handleCreateBot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!botName.trim()) {
      triggerNotification("Please give your trading bot a unique name.", "error");
      return;
    }

    if (botTakeProfit < 0.01) {
      triggerNotification("Take-Profit (TP) must be at least 0.01%.", "error");
      return;
    }
    if (botStopLoss > 0 && botStopLoss < 0.01) {
      triggerNotification("Stop-Loss (SL) must be at least 0.01% (or 0 to disable).", "error");
      return;
    }
    if (botTrailingTpEnabled && botTrailingProfit < 0.001) {
      triggerNotification("Trailing Profit must be at least 0.001%.", "error");
      return;
    }

    const exchangeId = botExchange;
    const isPaper = botPaperTrading;
    const availableUsdt = activeBalances[exchangeId]?.USDT || 0;

    // Zero balance guard for live API accounts (bypassable for paper trading simulator)
    if (!isPaper && availableUsdt === 0) {
      triggerNotification(`Authentication Alert: Your live ${exchangeId.toUpperCase()} balance has 0 USDT. Please synchronize your API keys in the Exchanges tab first.`, "error");
      return;
    }

    try {
      // Generate a highly secure unique webhook token tied to the user's account ID and randomness
      const secureRandomHex = Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 10);
      const userSafeId = currentUser.uid.replace(/[^\w]/g, "").substring(0, 6);
      const uniqueBotSecret = `wh_sec_${userSafeId}_${secureRandomHex}`;

      const botId = "bot_" + Math.random().toString(36).substring(2, 10);
      const protocolStr = webhookProtocol ? `${webhookProtocol}://` : "http://";
      const portStr = webhookPort && webhookPort !== "80" && webhookPort !== "443" ? `:${webhookPort}` : "";
      const botWebhookUrl = `${protocolStr}${webhookHost}${portStr}/webhook/${botId}`;

      const newBot: TradingBot = {
        id: botId,
        userId: currentUser.uid,
        name: botName.trim(),
        type: botType,
        status: "active",
        pair: botPair,
        baseOrderSize: botBaseOrder,
        safetyOrderSize: botType === "dca" ? botSafetyOrder : undefined,
        priceDeviation: botType === "dca" ? botDeviation : undefined,
        maxSafetyOrders: botType === "dca" ? botMaxSafety : undefined,
        takeProfitPercent: botTakeProfit,
        trailingTpPercent: botTrailingTpEnabled ? botTrailingProfit : 0,
        stopLossPercent: botStopLoss,
        trailingSlEnabled: botTrailingSL,
        webhookSecret: uniqueBotSecret, // Unique per bot, generated securely, tied to user account
        webhookUrl: botWebhookUrl,
        leverage: botLeverage,
        marginPercent: botMarginPercent,
        maxPositionSize: botMaxPositionSize,
        paperTrading: botPaperTrading,
        capitalProtection: botCapitalProtection,
        exchange: botExchange,
        createdAt: new Date().toISOString(),
      };

      const saved = await dbService.saveBot(newBot);
      setBots(prev => [saved, ...prev]);
      
      // Auto select newly created bot in Webhook Simulator
      setTesterBotId(saved.id);

      triggerNotification(`Trading Bot "${botName}" launched successfully!`, "success");
      await dbService.addLog(
        currentUser.uid,
        `🤖 Automated [BOT CREATED]: Strategy: "${botName}" (${botType.toUpperCase()}) initialized for ${botPair}. Trail TP Offset: ${botTrailingProfit}%, SL: -${botStopLoss}%`,
        "info",
        saved.id,
        saved.name
      );

      // Clear Form state
      setBotName("");
      setActiveTab("dashboard");
    } catch (err: any) {
      triggerNotification(`Create Bot failed: ${err.message}`, "error");
    }
  };

  // Toggle Bot running state
  const handleToggleBot = async (bot: TradingBot) => {
    const nextStatus: "active" | "paused" = bot.status === "active" ? "paused" : "active";
    try {
      const updated = { ...bot, status: nextStatus };
      await dbService.saveBot(updated);
      setBots(prev => prev.map(b => b.id === bot.id ? updated : b));

      triggerNotification(`Bot "${bot.name}" is now ${nextStatus}.`, "info");
      await dbService.addLog(
        currentUser.uid,
        `🤖 Bot "${bot.name}" running status changed to [${nextStatus.toUpperCase()}]`,
        "info",
        bot.id,
        bot.name
      );
    } catch (err) {
      triggerNotification("Failed to update bot status.", "error");
    }
  };

  // Delete Bot
  const handleDeleteBot = async (botId: string, botName: string) => {
    if (!confirm(`Are you sure you want to delete Bot "${botName}"?`)) return;
    try {
      await dbService.deleteBot(botId);
      setBots(prev => prev.filter(b => b.id !== botId));
      triggerNotification(`Bot deleted successfully.`, "info");
    } catch (err) {
      triggerNotification("Delete failed.", "error");
    }
  };

  // Manual Position Force Close / Liquidate
  const handleManualClosePosition = async (pos: Position) => {
    if (!confirm(`Are you absolutely sure you want to FORCE LIQUIDATE/EXIT position for ${pos.pair}? This will settle all outstanding balance returns right now.`)) return;
    try {
      const exitPrice = marketPrices[pos.pair] || pos.currentPrice;
      const finalPnl = pos.type === "long" 
        ? (exitPrice - pos.entryPrice) * pos.amount
        : (pos.entryPrice - exitPrice) * pos.amount;

      const finalPnlPercent = pos.type === "long"
        ? ((exitPrice - pos.entryPrice) / pos.entryPrice) * 100
        : ((pos.entryPrice - exitPrice) / pos.entryPrice) * 100;

      const updatedPos = {
        ...pos,
        status: "closed" as const,
        closePrice: exitPrice,
        closeReason: "manual" as any,
        pnl: finalPnl,
        pnlPercent: finalPnlPercent,
        closedAt: new Date().toISOString()
      };

      const exchangeId = "binance"; // Standard fallback/preferred default exchange
      const returnUsdt = pos.totalInvested + finalPnl;
      const nextBal = { ...balances };
      if (!nextBal[exchangeId]) nextBal[exchangeId] = { USDT: 0 };
      nextBal[exchangeId].USDT = parseFloat((nextBal[exchangeId].USDT + returnUsdt).toFixed(2));
      setBalances(nextBal);
      await dbService.updateUserProfile(currentUser.uid, { balances: nextBal });

      await dbService.savePosition(updatedPos);
      setPositions(prev => prev.filter(p => p.id !== pos.id));
      setClosedPositions(prev => [updatedPos, ...prev]);

      await dbService.addLog(
        currentUser.uid,
        `🛑 [FORCE EXIT]: Manually terminated position for ${pos.pair} @ $${exitPrice.toLocaleString()}. Returns: $${returnUsdt.toFixed(2)} USDT`,
        "trade",
        pos.botId,
        pos.botName
      );
      triggerNotification(`Force liquidated position on ${pos.pair} @ $${exitPrice.toLocaleString()}`, "success");
    } catch (err: any) {
      triggerNotification(`Force exit failed: ${err.message}`, "error");
    }
  };

  // Lock user Stop Loss (SL) and Take Profit (TP) and customizable Trailing profit targets on active trades
  const handleSavePositionTargets = async (
    pos: Position,
    newTpPrice: number,
    newSlPrice: number,
    trailingEnabled: boolean,
    newTrailingTpPercent: number
  ) => {
    try {
      if (!currentUser?.uid) {
        triggerNotification("Session missing. Please re-authenticate.", "error");
        return;
      }

      if (isNaN(newTpPrice) || newTpPrice <= 0) {
        triggerNotification("Invalid Take Profit target price.", "error");
        return;
      }

      if (newSlPrice < 0 || isNaN(newSlPrice)) {
        triggerNotification("Invalid Stop Loss target price.", "error");
        return;
      }

      const updatedPos: Position = {
        ...pos,
        tpTriggerPrice: parseFloat(newTpPrice.toFixed(4)),
        slTriggerPrice: parseFloat(newSlPrice.toFixed(4)),
        trailingTpPercent: trailingEnabled ? parseFloat(newTrailingTpPercent.toFixed(3)) : undefined
      };

      // If trailing is disabled, reset trailing state machine
      if (!trailingEnabled) {
        updatedPos.trailingTpActive = false;
      }

      await dbService.savePosition(updatedPos);

      // Instantly synchronize the local React state Positions array to prevent HMR/polling delay
      setPositions(prev => prev.map(p => p.id === pos.id ? updatedPos : p));

      // Construct scannable detailed ROI metrics
      const entryPrice = pos.entryPrice;
      const tpDiff = Math.abs(newTpPrice - entryPrice);
      const tpPercent = parseFloat(((tpDiff / entryPrice) * 100).toFixed(2));
      const slPercent = newSlPrice > 0 ? parseFloat((Math.abs(entryPrice - newSlPrice) / entryPrice * 100).toFixed(2)) : 0;

      await dbService.addLog(
        currentUser.uid,
        `🎯 [TARGETS LOCKED]: Updated Stop Loss & Take Profit limits for active position ${pos.pair}. [TP Target Price: $${newTpPrice} (+${tpPercent}%), SL Target Price: ${newSlPrice > 0 ? `$${newSlPrice} (-${slPercent}%)` : "Disabled"}, Trailing Offset: ${trailingEnabled ? `${newTrailingTpPercent}%` : "Disabled"}]`,
        "info",
        pos.botId,
        pos.botName
      );

      triggerNotification(`Targets successfully locked for ${pos.pair}!`, "success");
      setEditingPositionTargetsId(null);
    } catch (err: any) {
      triggerNotification(`Failed to save targets: ${err.message}`, "error");
    }
  };

  // Trigger Edit Modal Loading
  const handleEditClick = (bot: TradingBot) => {
    setEditingBot(bot);
    setEditBotName(bot.name);
    setEditBotPair(bot.pair);
    setEditBotBaseOrder(bot.baseOrderSize);
    setEditBotSafetyOrder(bot.safetyOrderSize || 100);
    setEditBotDeviation(bot.priceDeviation || 2.0);
    setEditBotMaxSafety(bot.maxSafetyOrders || 3);
    setEditBotTakeProfit(bot.takeProfitPercent);
    setEditBotTrailingProfit(bot.trailingTpPercent || 0.2);
    setEditBotTrailingTpEnabled(bot.trailingTpPercent !== undefined && bot.trailingTpPercent > 0);
    setEditBotStopLoss(bot.stopLossPercent || 3.0);
    setEditBotTrailingSL(bot.trailingSlEnabled ?? false);
    setEditBotLeverage(bot.leverage || 1);
    setEditBotMarginPercent(bot.marginPercent || 10);
    setEditPairSearchQuery("");
  };

  // Submit Bot Edits to Database
  const handleUpdateBot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBot) return;

    if (!editBotName.trim()) {
      triggerNotification("Please enter a valid bot name label.", "error");
      return;
    }

    if (editBotTakeProfit < 0.01) {
      triggerNotification("Take-Profit (TP) must be at least 0.01%.", "error");
      return;
    }
    if (editBotStopLoss > 0 && editBotStopLoss < 0.01) {
      triggerNotification("Stop-Loss (SL) must be at least 0.01% (or 0 to disable).", "error");
      return;
    }
    if (editBotTrailingTpEnabled && editBotTrailingProfit < 0.001) {
      triggerNotification("Trailing Profit must be at least 0.001%.", "error");
      return;
    }

    try {
      const updatedBot: TradingBot = {
        ...editingBot,
        name: editBotName.trim(),
        pair: editBotPair,
        baseOrderSize: editBotBaseOrder,
        safetyOrderSize: editingBot.type === "dca" ? editBotSafetyOrder : undefined,
        priceDeviation: editingBot.type === "dca" ? editBotDeviation : undefined,
        maxSafetyOrders: editingBot.type === "dca" ? editBotMaxSafety : undefined,
        takeProfitPercent: editBotTakeProfit,
        trailingTpPercent: editBotTrailingTpEnabled ? editBotTrailingProfit : 0,
        stopLossPercent: editBotStopLoss,
        trailingSlEnabled: editBotTrailingSL,
        leverage: editBotLeverage,
        marginPercent: editBotMarginPercent,
      };

      await dbService.saveBot(updatedBot);
      setBots(prev => prev.map(b => b.id === editingBot.id ? updatedBot : b));
      
      triggerNotification(`Bot "${editBotName}" updated successfully!`, "success");
      await dbService.addLog(
        currentUser.uid,
        `🤖 Automated [BOT EDITED]: Strategy "${editBotName}" updated in settings. Trial TP Offset: ${editBotTrailingProfit}%, SL: -${editBotStopLoss}%`,
        "info",
        editingBot.id,
        editingBot.name
      );

      setEditingBot(null);
    } catch (err: any) {
      triggerNotification(`Failed to edit strategy: ${err.message}`, "error");
    }
  };

  // ----------------------------------------------------
  // EMBEDDED WEBHOOK INJECTION SIMULATOR (TV ALERTS)
  // ----------------------------------------------------
  const handleTriggerWebhook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testerBotId) {
      triggerNotification("Configure and register a bot first before triggering signals.", "error");
      return;
    }

    const bot = bots.find(b => b.id === testerBotId);
    if (!bot) return;

    setTesterLoading(true);
    setTesterResponse(null);

    try {
      const targetUrl = `/webhook/${currentUser.uid}/${bot.id}`;

      const hookPayload = {
        action: testerAction, // 'buy' or 'sell'
        pair: bot.pair,
        price: marketPrices[bot.pair] || 100.0,
      };

      const res = await fetch(targetUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(hookPayload),
      });

      const data = await res.json();
      setTesterResponse(data);

      if (data.success) {
        triggerNotification(`Signal webhook accepted! Bot state synchronizing...`, "success");
        
        // Full background state synchronization
        try {
          const [loadedBots, loadedPos, loadedLogs, updatedProfile] = await Promise.all([
            dbService.getBots(currentUser.uid),
            dbService.getPositions(currentUser.uid),
            dbService.getLogs(currentUser.uid),
            dbService.getUserProfile(currentUser.uid)
          ]);

          setBots(loadedBots);
          setPositions(loadedPos.filter(p => p.status === "open"));
          setClosedPositions(loadedPos.filter(p => p.status === "closed"));
          setLogs(loadedLogs);

          if (updatedProfile && updatedProfile.balances) {
            setBalances(updatedProfile.balances);
            setCurrentUser(updatedProfile);
          }
        } catch (syncErr) {
          console.error("Error synchronizing local client state after server execution:", syncErr);
        }
      } else {
        triggerNotification(`Webhook Rejected: ${data.message}`, "error");
      }
    } catch (err) {
      triggerNotification("Signal webhook failure. Express server client broken.", "error");
    } finally {
      setTesterLoading(false);
    }
  };

  // Close logs list helper
  const handleClearLogs = async () => {
    if (!confirm("Are you sure you want to flush all system notifications?")) return;
    try {
      await dbService.clearLogs(currentUser.uid);
      setLogs([]);
      triggerNotification("Historical logs terminal fully cleared.", "info");
    } catch {
      triggerNotification("Failed to flush logs.", "error");
    }
  };

  // Pump & Dump Market Controls (for easy trailing validation)
  const handleMarketPump = () => {
    // Elevate chosen pair price by +0.50%
    setMarketPrices(prev => {
      const p = prev[selectedPair];
      const nextPrices = { ...prev, [selectedPair]: parseFloat((p * 1.005).toFixed(selectedPair.startsWith("SOL") ? 2 : 1)) };
      
      setPriceHistories(prevHist => {
        const arr = [...(prevHist[selectedPair] || [])];
        arr.push(nextPrices[selectedPair]);
        if (arr.length > 45) arr.shift();
        return { ...prevHist, [selectedPair]: arr };
      });

      return nextPrices;
    });
    triggerNotification(`Injected high buy volatility on ${selectedPair}!`, "success");
  };

  const handleMarketDump = () => {
    // Drop chosen pair price by -0.50%
    setMarketPrices(prev => {
      const p = prev[selectedPair];
      const nextPrices = { ...prev, [selectedPair]: parseFloat((p * 0.995).toFixed(selectedPair.startsWith("SOL") ? 2 : 1)) };

      setPriceHistories(prevHist => {
        const arr = [...(prevHist[selectedPair] || [])];
        arr.push(nextPrices[selectedPair]);
        if (arr.length > 45) arr.shift();
        return { ...prevHist, [selectedPair]: arr };
      });

      return nextPrices;
    });
    triggerNotification(`Injected high sell liquidation on ${selectedPair}!`, "error");
  };

  return (
    <div className="min-h-screen bg-[#0B0E11] text-[#EAECEF] flex">
      
      {/* 1. Left Sidebar Actions Rail */}
      <div className="w-64 bg-[#181A20] border-r border-slate-800 flex flex-col justify-between shrink-0">
        <div>
          {/* Logo Brand Segment */}
          <div className="p-6 border-b border-slate-800/80 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center text-black font-bold">
              <svg className="w-5 h-5 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 10V3L4 14h7v7l9-11h-7z" strokeDasharray="none" />
              </svg>
            </div>
            <div>
              <span className="font-sans font-black tracking-wide text-lg text-white">ApexTerminal</span>
              <p className="text-[10px] text-slate-500 font-mono tracking-tight uppercase">Trading Automation</p>
            </div>
          </div>

          {/* User Meta Indicator */}
          <div className="p-4 mx-3 my-4 rounded-lg bg-slate-900/40 border border-slate-800/80 flex flex-col gap-3">
            <div className="flex items-center gap-2.5">
              <User className="w-8 h-8 text-emerald-400 bg-slate-800 rounded-full p-1.5 shrink-0" />
              <div className="overflow-hidden">
                <span className="text-xs font-semibold text-white truncate block">{currentUser.email}</span>
                <span className="text-[10px] text-slate-500 font-mono uppercase block">{dbService.isUsingFirebase() ? "Cloud database" : "Sandbox local"}</span>
              </div>
            </div>
            
            {/* Unrestricted Administrator Account Mode Indicator */}
            <div className="pt-2.5 border-t border-slate-800/60">
              <div className="flex items-center justify-between text-[11px] font-mono mb-1.5">
                <span className="text-slate-400">ACCESS ROLE:</span>
                <span className="text-emerald-400 font-black tracking-wider font-mono animate-pulse">
                  ADMINISTRATOR
                </span>
              </div>
              <div className="bg-[#0b0e11] p-2 rounded border border-emerald-500/20 text-center font-mono text-[9px] text-[#0ecb81] font-bold uppercase tracking-wider">
                Full Control Active
              </div>
            </div>
          </div>

          {/* Navigation Items */}
          <nav className="px-3 space-y-1">
            <button
              onClick={() => setActiveTab("dashboard")}
              className={`w-full text-left py-2 px-3 rounded-lg text-sm font-semibold flex items-center gap-3 transition cursor-pointer ${activeTab === "dashboard" ? "bg-slate-800 text-emerald-400" : "text-slate-400 hover:bg-slate-800/55 hover:text-white"}`}
            >
              <Activity className="w-4.5 h-4.5" />
              Main Dashboard
            </button>
            <button
              onClick={() => setActiveTab("create_bot")}
              className={`w-full text-left py-2 px-3 rounded-lg text-sm font-semibold flex items-center gap-3 transition cursor-pointer ${activeTab === "create_bot" ? "bg-slate-800 text-emerald-400" : "text-slate-400 hover:bg-slate-800/55 hover:text-white"}`}
            >
              <PlusCircle className="w-4.5 h-4.5" />
              New Trading Bot
            </button>
            <button
              onClick={() => setActiveTab("bot_list")}
              className={`w-full text-left py-2 px-3 rounded-lg text-sm font-semibold flex items-center gap-3 transition cursor-pointer ${activeTab === "bot_list" ? "bg-slate-800 text-emerald-400" : "text-slate-400 hover:bg-slate-800/55 hover:text-white"}`}
            >
              <Settings className="w-4.5 h-4.5" />
              Bot Config Manager
            </button>
            <button
              id="goto_exchanges_tab"
              onClick={() => setActiveTab("exchanges")}
              className={`w-full text-left py-2 px-3 rounded-lg text-sm font-semibold flex items-center gap-3 transition cursor-pointer ${activeTab === "exchanges" ? "bg-slate-800 text-emerald-400" : "text-slate-400 hover:bg-slate-800/55 hover:text-white"}`}
            >
              <Wallet className="w-4.5 h-4.5" />
              Multilateral Exchanges
            </button>
            <button
              id="goto_trade_history_tab"
              onClick={() => setActiveTab("trade_history")}
              className={`w-full text-left py-2 px-3 rounded-lg text-sm font-semibold flex items-center gap-3 transition cursor-pointer ${activeTab === "trade_history" ? "bg-slate-800 text-emerald-400" : "text-slate-400 hover:bg-slate-800/55 hover:text-white"}`}
            >
              <History className="w-4.5 h-4.5" />
              Trade History
            </button>
            
            <button
              id="goto_deals_terminal_tab"
              onClick={() => setActiveTab("deals_terminal")}
              className={`w-full text-left py-2 px-3 rounded-lg text-sm font-semibold flex items-center gap-3 transition cursor-pointer ${activeTab === "deals_terminal" ? "bg-slate-800 text-emerald-400" : "text-slate-400 hover:bg-slate-800/55 hover:text-white"}`}
            >
              <Briefcase className="w-4.5 h-4.5 text-emerald-400" />
              Deals Terminal
            </button>

            <button
              id="goto_tv_webhooks_tab"
              onClick={() => setActiveTab("tradingview_webhooks")}
              className={`w-full text-left py-2 px-3 rounded-lg text-sm font-semibold flex items-center gap-3 transition cursor-pointer ${activeTab === "tradingview_webhooks" ? "bg-slate-800 text-emerald-400" : "text-slate-400 hover:bg-slate-800/55 hover:text-white"}`}
            >
              <Radio className="w-4.5 h-4.5 text-blue-405 animate-pulse" />
              TradingView Webhooks
            </button>
          </nav>
        </div>

        {/* Bottom Actions Block */}
        <div className="p-4 border-t border-slate-800/60 font-mono text-[9px] text-emerald-400">
          <div className="mb-4">
            RECOVERY KEY: <span className="text-white block font-black text-xs">{currentUser.recoveryPhrase}</span>
            <span className="text-slate-500 lowercase">use this PIN to reset password</span>
          </div>
          <button
            onClick={onLogout}
            className="w-full py-2 rounded bg-[#1E2329] border border-slate-800 flex items-center justify-center gap-2 text-red-450 text-red-400 hover:bg-slate-800 transition cursor-pointer text-xs font-sans font-bold shadow"
          >
            <LogOut className="w-3.5 h-3.5" /> Unload Session
          </button>
        </div>
      </div>

      {/* 2. Main Workcanvas Container */}
      <div className="flex-1 overflow-y-auto px-8 py-6 max-h-screen">
        
        {/* Alerts Center Drawer */}
        {notif && (
          <div className={`fixed top-4 right-4 z-50 p-4 rounded-lg shadow-2xl border text-xs max-w-sm flex gap-3 items-start animate-slideLeft ${
            notif.type === "success" ? "bg-emerald-950/90 text-emerald-200 border-emerald-500/50" :
            notif.type === "error" ? "bg-red-950/90 text-red-200 border-red-500/50" : "bg-[#1E2329] text-emerald-400 border-slate-700"
          }`}>
            <span className="block mt-0.5 font-bold uppercase">{notif.type}</span>
            <div className="leading-normal">{notif.message}</div>
          </div>
        )}

        {/* -------------------------------------------------------------------------- */}
        {/* NAV ROUTING TABS: A. DASHBOARD VIEW WITH REALTIME GRAPH */}
        {/* -------------------------------------------------------------------------- */}
        {activeTab === "dashboard" && (
          <div className="space-y-6">
            
            {/* Header statistics block */}
            <div className="flex flex-wrap justify-between items-start gap-4 bg-[#181A20] p-6 rounded-xl border border-slate-800/80 shadow-2xl">
              <div>
                <div className="flex items-center gap-2.5">
                  <Activity className="text-emerald-400 w-6 h-6 animate-pulse" />
                  <h1 className="text-2xl font-black font-sans text-white tracking-tight">
                    Signal Operations Terminal
                  </h1>
                  <span className="bg-emerald-500/10 text-emerald-400 font-mono font-bold text-[9px] px-2 py-0.5 rounded border border-emerald-500/20 uppercase tracking-widest flex items-center gap-1">
                    <Globe className="w-3 h-3 animate-spin" /> Live Tickers Sync
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Connecting automated TradingView webhook signals with live Binance Futures contract pricing.
                </p>
              </div>

              {/* API Connection Quick Status bar */}
              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={fetchLiveFuturesPairs}
                  disabled={isApiLoading}
                  className="px-3.5 py-1.5 bg-[#0B0E11] hover:bg-slate-900 border border-emerald-500/30 font-mono text-[11px] text-emerald-400 hover:text-emerald-300 font-bold rounded-lg cursor-pointer flex items-center gap-2 transition disabled:opacity-50"
                  title="Query Binance API server to retrieve live futures contracts and actual pricing details."
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isApiLoading ? "animate-spin" : ""}`} />
                  {isApiLoading ? "Querying Binance API..." : "Fetch Binance Futures Tickers"}
                </button>
                <div className="flex items-center gap-3 bg-[#0B0E11] border border-slate-800 px-4 py-2 rounded-lg text-xs font-mono select-none font-bold">
                  <Wallet className="w-4 h-4 text-emerald-400 shrink-0" />
                  <div className="leading-tight">
                    <span className="text-emerald-400 block text-[9px] font-mono uppercase tracking-wider font-extrabold flex items-center gap-1 animate-pulse">
                      👑 Admin Margin Balance (Unrestricted)
                    </span>
                    <span className="text-white font-heavy text-sm">${activeBalances["binance"]?.USDT?.toLocaleString() || "0.00"} USDT</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Pairs Filter and Search Row */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-[#1E2329] p-4 rounded-xl border border-slate-800">
              <div className="relative w-full max-w-sm">
                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Filter Contracts (e.g. BTC, ETH, SOL, DOGE)..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-[#0B0E11] border border-slate-800 pl-9.5 pr-4 py-2 text-xs rounded-lg text-white font-mono placeholder-slate-500 focus:outline-none focus:border-emerald-500/80"
                />
              </div>
              <div className="text-[10px] text-slate-500 font-mono font-bold uppercase tracking-wider">
                Source: <span className="text-emerald-400">{apiPairsSource}</span> ({Object.keys(marketPrices).length} Instruments available)
              </div>
            </div>

            {/* Main Interactive Pair Selector Grid (Filtered) */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3.5 max-h-56 overflow-y-auto pr-1 scrollbar-thin">
              {Object.keys(marketPrices)
                .filter(p => p.toLowerCase().includes(searchQuery.toLowerCase()))
                .map(pair => {
                  const price = marketPrices[pair];
                  const activeTrade = positions.find(p => p.pair === pair && p.status === "open");
                  const isSelected = selectedPair === pair;
                  return (
                    <button
                      key={pair}
                      onClick={() => setSelectedPair(pair)}
                      className={`p-3.5 rounded-xl border text-left transition relative cursor-pointer ${
                        isSelected 
                          ? "bg-[#1E2329] border-emerald-500/80 shadow-lg shadow-emerald-500/5 ring-1 ring-emerald-500/20" 
                          : "bg-[#181A20]/80 hover:bg-[#1E2329] border-slate-800"
                      }`}
                    >
                      <div className="text-[9px] text-emerald-400 font-mono tracking-wider font-extrabold">FUTURES</div>
                      <span className="text-xs font-black text-white tracking-wide block mt-0.5">{pair}</span>
                      <span className="text-sm font-mono font-bold text-slate-200 block mt-1">
                        ${price.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 4 })}
                      </span>
                      {activeTrade ? (
                        <div className="mt-2 flex items-center gap-1">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping"></span>
                          <span className="text-[8px] font-mono font-bold text-emerald-400">POS OPEN ({activeTrade.pnlPercent >= 0 ? "+" : ""}{activeTrade.pnlPercent.toFixed(1)}%)</span>
                        </div>
                      ) : (
                        <div className="mt-2 text-[8px] font-mono text-slate-500">Idle</div>
                      )}
                    </button>
                  );
                })}
              {Object.keys(marketPrices).filter(p => p.toLowerCase().includes(searchQuery.toLowerCase())).length === 0 && (
                <div className="col-span-full py-6 text-center text-xs text-slate-500 font-mono uppercase bg-[#181A20] rounded-lg border border-slate-800">
                  No matching pairs active in tracking pool. Clear filter.
                </div>
              )}
            </div>

            {/* Central Simulator Dashboard Row (Chart + Webhook + OrderBook) */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Chart widget */}
              <div className="lg:col-span-2">
                <LiveChart
                  pair={selectedPair}
                  currentPrice={marketPrices[selectedPair]}
                  activePosition={activePositionForPair}
                  priceHistory={priceHistories[selectedPair] || []}
                  onPump={handleMarketPump}
                  onDump={handleMarketDump}
                />
              </div>

              {/* Webhook Alert Simulator for Testing */}
              <div className="bg-[#1E2329] border border-slate-800 rounded-xl p-6 flex flex-col justify-between h-full shadow-xl">
                <div>
                  <h3 className="text-xs font-sans font-black text-white uppercase tracking-wider mb-2 flex items-center gap-2">
                    <Link className="w-4 h-4 text-emerald-400" />
                    Signal Injector Webhook
                  </h3>
                  <p className="text-xs text-slate-400 leading-normal mb-4 font-sans">
                    Simulate sending automated TradingView alerts directly to your trading bots to trigger state change logic.
                  </p>

                  <form onSubmit={handleTriggerWebhook} className="space-y-3.5">
                    <div>
                      <label className="text-[10px] font-mono text-slate-400 block mb-1">CHOOSE TARGET ACTIVE BOT</label>
                      <select
                        value={testerBotId}
                        onChange={(e) => setTesterBotId(e.target.value)}
                        className="w-full bg-[#0B0E11] border border-slate-800 rounded-lg p-2 text-xs text-white uppercase font-mono focus:border-emerald-500 focus:outline-none"
                      >
                        {displayedBots.length === 0 ? (
                          <option value="">No Active Bots Registered</option>
                        ) : (
                          // Only bots configured for the chosen selectedPair
                          displayedBots.map(b => (
                            <option key={b.id} value={b.id}>
                              {b.name} ({b.pair} • {b.type.toUpperCase()})
                            </option>
                          ))
                        )}
                      </select>
                    </div>

                    <div>
                      <label className="text-[10px] font-mono text-slate-400 block mb-1">CHOOSE INCOMING SIGNAL ACTION </label>
                      <div className="grid grid-cols-3 gap-1.5 p-1 bg-[#0B0E11] border border-slate-800 rounded-lg">
                        <button
                          type="button"
                          onClick={() => setTesterAction("buy")}
                          className={`py-1.5 text-center text-[10px] rounded font-bold uppercase cursor-pointer ${testerAction === "buy" ? "bg-emerald-600 text-white" : "text-slate-400 hover:text-white"}`}
                        >
                          BUY Signal
                        </button>
                        <button
                          type="button"
                          onClick={() => setTesterAction("sell")}
                          className={`py-1.5 text-center text-[10px] rounded font-bold uppercase cursor-pointer ${testerAction === "sell" ? "bg-red-600 text-white" : "text-slate-400 hover:text-white"}`}
                        >
                          SELL Signal
                        </button>
                        <button
                          type="button"
                          onClick={() => setTesterAction("safety")}
                          className={`py-1.5 text-center text-[10px] rounded font-bold uppercase cursor-pointer ${testerAction === "safety" ? "bg-emerald-600 text-white" : "text-slate-400 hover:text-white"}`}
                          title="Forces manual safety order increment in DCA bot"
                        >
                          DCA Inject
                        </button>
                      </div>
                    </div>

                    <button
                      id="webhook_trigger_btn"
                      type="submit"
                      disabled={testerLoading || bots.length === 0}
                      className="w-full py-2 bg-[#0B0E11] hover:bg-slate-900 text-emerald-400 hover:text-emerald-300 border border-emerald-500/30 text-xs font-semibold rounded-lg transition cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:pointer-events-none"
                    >
                      {testerLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Terminal className="w-3.5 h-3.5" />}
                      Dispatch Webhook Signal
                    </button>
                  </form>
                </div>

                {testerResponse && (
                  <div className="bg-[#0B0E11] border border-slate-800 p-2.5 rounded-lg mt-4 text-[9px] font-mono text-slate-400 overflow-x-auto select-all">
                    <span className="text-emerald-400 block mb-1">API Webhook response payload:</span>
                    <div>STATUS: {testerResponse.success ? "200 SUCCESS" : "500 ERROR"}</div>
                    <pre className="mt-1 leading-relaxed">{JSON.stringify(testerResponse, null, 2)}</pre>
                  </div>
                )}
              </div>
            </div>

            {/* Advanced Level Multi-Sided Ticker Environment (Order Book + Leverage Calculator Row) */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Interactive Order Book */}
              <div className="bg-[#1E2329] border border-slate-800/80 rounded-xl p-5 shadow-xl font-mono text-[11px]">
                <h3 className="text-xs font-sans font-black text-white uppercase tracking-wider mb-3 flex items-center justify-between border-b border-slate-800/80 pb-2">
                  <span>Simulated Live Order Book</span>
                  <span className="text-[10px] text-emerald-400 uppercase font-mono tracking-wide">{selectedPair}</span>
                </h3>

                <div className="grid grid-cols-3 text-slate-450 text-[10px] uppercase font-bold text-slate-500 mb-1">
                  <span>Price (USDT)</span>
                  <span className="text-right">Size (Contracts)</span>
                  <span className="text-right">Sum (USDT)</span>
                </div>

                {/* Sell Asks (Red) */}
                <div className="space-y-0.5 mb-2.5">
                  {[1.0012, 1.0008, 1.0004].map((multiplier, idx) => {
                    const price = marketPrices[selectedPair] * multiplier;
                    const size = parseFloat((Math.random() * 2.5 + 0.1).toFixed(idx === 0 ? 3 : 2));
                    const sum = price * size;
                    return (
                      <div key={idx} className="grid grid-cols-3 text-red-400 hover:bg-red-500/5 px-1 py-0.5 rounded transition">
                        <span>${price.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 2 })}</span>
                        <span className="text-right text-slate-350">{size}</span>
                        <span className="text-right text-slate-400">${Math.floor(sum).toLocaleString()}</span>
                      </div>
                    );
                  })}
                </div>

                {/* Real-time Ticker price banner */}
                <div className="bg-[#0B0E11] p-2 rounded-lg border border-slate-800/85 mb-2.5 flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping"></span>
                    <span className="font-bold text-sm text-slate-100">
                      ${(marketPrices[selectedPair] || 0).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  <span className="text-[9px] uppercase font-bold text-emerald-400 tracking-wide font-sans">MARK PRICE</span>
                </div>

                {/* Buy Bids (Green) */}
                <div className="space-y-0.5">
                  {[0.9996, 0.9992, 0.9988].map((multiplier, idx) => {
                    const price = marketPrices[selectedPair] * multiplier;
                    const size = parseFloat((Math.random() * 2.5 + 0.1).toFixed(idx === 1 ? 3 : 2));
                    const sum = price * size;
                    return (
                      <div key={idx} className="grid grid-cols-3 text-emerald-400 hover:bg-emerald-500/5 px-1 py-0.5 rounded transition">
                        <span>${price.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 2 })}</span>
                        <span className="text-right text-slate-350">{size}</span>
                        <span className="text-right text-slate-400">${Math.floor(sum).toLocaleString()}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Leverage Control & Allocation Simulator */}
              <div className="bg-[#1E2329] border border-slate-800/80 rounded-xl p-5 shadow-xl lg:col-span-2">
                <h3 className="text-xs font-sans font-black text-white uppercase tracking-wider mb-2 flex items-center gap-2">
                  <Sliders className="w-4.5 h-4.5 text-emerald-400" />
                  Risk Profile & Leverage Control Panel
                </h3>
                <p className="text-xs text-slate-400 leading-normal mb-4">
                  Adjust standard collateral multipliers to evaluate capital utilization, simulated liquidations, and Margin Risk.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5 font-sans">
                  
                  {/* Left Column: Slider and leverage indicators */}
                  <div className="space-y-4">
                    <div className="bg-[#0B0E11] border border-slate-800 p-3.5 rounded-lg flex items-center justify-between">
                      <div>
                        <span className="text-[10px] font-mono text-slate-500 block uppercase font-bold tracking-wider">Active Leverage Factor</span>
                        <span className="text-xl font-bold font-mono text-white tracking-widest">{selectedLeverage}X</span>
                      </div>
                      <span className={`px-2 py-0.5 font-mono text-[9px] font-bold rounded ${
                        selectedLeverage > 100 ? "bg-red-500/20 text-red-400 border border-red-500/30 animate-pulse" :
                        selectedLeverage > 50 ? "bg-amber-500/10 text-amber-400 border border-amber-550/20" :
                        "bg-emerald-500/10 text-emerald-400 border border-emerald-500/10"
                      }`}>
                        {selectedLeverage > 100 ? "EXTREME VOLATILITY" : selectedLeverage > 50 ? "HIGH LEVERAGE" : "SAFE RATIO"}
                      </span>
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between text-[11px] text-slate-400">
                        <span>Contracts Collateral Lock</span>
                        <span className="font-mono text-white font-bold">{selectedLeverage}x Ratio</span>
                      </div>
                      <input
                        type="range"
                        min="1"
                        max="200"
                        step="1"
                        value={selectedLeverage}
                        onChange={(e) => setSelectedLeverage(parseInt(e.target.value))}
                        className="w-full accent-emerald-500 cursor-pointer h-1.5 bg-[#0B0E11] rounded-lg border-none"
                      />
                      <div className="flex justify-between text-[9px] font-mono text-slate-500">
                        <span>1x</span>
                        <span>50x</span>
                        <span>100x</span>
                        <span>150x</span>
                        <span>200x Max</span>
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Calculations */}
                  <div className="space-y-3 font-mono text-xs text-slate-350 bg-[#0B0E11]/85 p-3 rounded-lg border border-slate-800/80">
                    <div className="text-[10px] text-slate-500 uppercase font-sans font-bold tracking-wider border-b border-slate-800 pb-1.5 mb-2">Simulated Live Margin Risks</div>
                    
                    <div className="flex justify-between">
                      <span>Maintenance Margin:</span>
                      <span className="text-white font-bold">{(100 / selectedLeverage).toFixed(2)}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Unrealized Position Size:</span>
                      <span className="text-emerald-400 font-bold">$1,000.00 USDT</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Simulated Liquidation Drop:</span>
                      <span className="text-red-400 font-heavy font-bold">
                        -${(98 / selectedLeverage).toFixed(2)}% (${(marketPrices[selectedPair] * (1 - 0.98 / selectedLeverage)).toFixed(1)})
                      </span>
                    </div>
                    <div className="flex justify-between border-t border-slate-850 pt-2 grid grid-cols-2 mt-2 gap-1.5 items-center font-sans">
                      <span className="text-[10px] text-slate-400">Long/Short Ratio:</span>
                      <div className="w-full bg-red-500/20 rounded-full h-1.5 overflow-hidden flex">
                        <div className="bg-emerald-500 h-full w-[65%]" title="65% Buy Long Ratio"></div>
                        <div className="bg-red-500 h-full w-[35%]" title="35% Sell Short Ratio"></div>
                      </div>
                    </div>
                  </div>

                </div>
              </div>

            </div>

            {/* Open Positions monitoring table */}
            <div className="bg-[#1E2329] border border-slate-800/80 rounded-xl p-6 shadow-xl">
              <h3 className="text-sm font-sans font-black text-white uppercase tracking-wider mb-4 flex items-center justify-between">
                <span>Active Financial Standings (Opened Positions)</span>
                <span className="text-xs font-mono lowercase text-slate-500">ticks every 3.5s</span>
              </h3>

              {displayedPositions.length === 0 ? (
                <div className="py-8 text-center text-slate-500 font-sans border-2 border-dashed border-slate-800/80 rounded-lg">
                  <Activity className="w-8 h-8 mx-auto mb-2 text-slate-600 animate-pulse" />
                  No active open trades under Administrator Mode. Configure a bot and trigger a signal webhook to execute.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left font-sans text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-800 uppercase text-slate-400 font-mono tracking-wider text-[10px]">
                        <th className="py-2.5">Trading Strategy / Bot</th>
                        <th>Currency</th>
                        <th>Weighted Entry</th>
                        <th>Live Price</th>
                        <th>Target TP Price</th>
                        <th>Target SL Price</th>
                        <th>Position & Margin Required</th>
                        <th>Profit / Loss</th>
                        <th>Safety Orders</th>
                        <th className="text-right">Manage Exit</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800 text-slate-100 font-mono">
                      {displayedPositions.map(p => {
                        const botRef = bots.find(b => b.id === p.botId);
                        const isEditingThis = editingPositionTargetsId === p.id;
                        const isLong = p.type === "long";
                        const entryPrice = p.entryPrice;

                        // Live calculated custom targets for visualization:
                        const calculatedTpPercent = positionTargetTpPrice > 0 && entryPrice > 0
                          ? (isLong
                              ? ((positionTargetTpPrice - entryPrice) / entryPrice) * 100
                              : ((entryPrice - positionTargetTpPrice) / entryPrice) * 100)
                          : 0;

                        const calculatedSlPercent = positionTargetSlPrice > 0 && entryPrice > 0
                          ? (isLong
                              ? ((entryPrice - positionTargetSlPrice) / entryPrice) * 100
                              : ((positionTargetSlPrice - entryPrice) / entryPrice) * 100)
                          : 0;

                        return (
                          <React.Fragment key={p.id}>
                            <tr className={`hover:bg-slate-900/30 transition ${isEditingThis ? "bg-[#181A20]/80" : ""}`}>
                              <td className="py-3 font-semibold font-sans text-white">
                                <div className="flex items-center gap-1.5">
                                  <span>{p.botName}</span>
                                  <span className={`text-[8px] font-mono font-extrabold uppercase px-1 py-0.2 rounded border ${
                                    isLong 
                                      ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/25" 
                                      : "bg-red-500/15 text-red-400 border-red-500/25"
                                  }`}>
                                    {p.type}
                                  </span>
                                </div>
                              </td>
                              <td className="font-bold">{p.pair}</td>
                              <td>${p.entryPrice.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 4 })}</td>
                              <td className="text-white font-extrabold">${p.currentPrice.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 4 })}</td>
                              <td>
                                <div className="flex flex-col gap-0.5">
                                  <span className="text-emerald-450 text-emerald-400 font-bold">
                                    ${p.tpTriggerPrice.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 4 })}
                                  </span>
                                  {p.trailingTpPercent !== undefined && p.trailingTpPercent > 0 && (
                                    <span className="text-[8px] uppercase tracking-wider font-extrabold text-amber-500 bg-amber-500/10 px-1 py-0.2 rounded w-max">
                                      {p.trailingTpActive ? "🔥 Trail Active" : `Trail: ${p.trailingTpPercent}%`}
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td>
                                {p.slTriggerPrice > 0 ? (
                                  <span className="text-red-450 text-red-400 font-bold">
                                    ${p.slTriggerPrice.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 4 })}
                                  </span>
                                ) : (
                                  <span className="text-slate-500 italic">No SL set</span>
                                )}
                              </td>
                              <td>
                                <div className="flex flex-col gap-0.5 leading-tight">
                                  <span className="text-white font-extrabold text-xs">
                                    ${(p.totalInvested || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </span>
                                  <span className="text-[10px] text-slate-400">
                                    Margin: ${(p.marginLocked || ((p.totalInvested || 0) / (p.leverage || 1))).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    <span className="bg-[#1e2329] border border-slate-850 text-white font-mono px-1 py-0.2 rounded ml-1 text-[8px] font-bold">
                                      {p.leverage || 1}x
                                    </span>
                                  </span>
                                </div>
                              </td>
                              <td>
                                <div className={p.pnlPercent >= 0 ? "text-emerald-400" : "text-red-400"}>
                                  <span className="font-black text-xs">{p.pnlPercent >= 0 ? "+" : ""}{p.pnlPercent.toFixed(2)}%</span>
                                  <span className="text-[10px] text-slate-400 ml-1.5 font-sans font-medium">({p.pnl >= 0 ? "+" : ""}${Math.abs(p.pnl).toFixed(2)})</span>
                                </div>
                              </td>
                              <td>
                                {botRef?.type === "dca" ? (
                                  <span className="bg-[#0B0E11] border border-slate-800 px-2 py-0.5 rounded text-white font-mono">
                                    {p.safetyOrdersCount} / {botRef.maxSafetyOrders} fills
                                  </span>
                                ) : (
                                  <span className="text-slate-500">N/A (Signal Only)</span>
                                )}
                              </td>
                              <td className="text-right py-3">
                                <div className="inline-flex gap-1.5">
                                  <button
                                    onClick={() => {
                                      if (isEditingThis) {
                                        setEditingPositionTargetsId(null);
                                      } else {
                                        setEditingPositionTargetsId(p.id);
                                        setPositionTargetSlPrice(p.slTriggerPrice || parseFloat((p.entryPrice * (isLong ? 0.95 : 1.05)).toFixed(4)));
                                        setPositionTargetTpPrice(p.tpTriggerPrice || parseFloat((p.entryPrice * (isLong ? 1.05 : 0.95)).toFixed(4)));
                                        setPositionTargetTrailTpOffset(p.trailingTpPercent !== undefined ? p.trailingTpPercent : (botRef?.trailingTpPercent || 0.20));
                                        setPositionTargetTrailEnabled(p.trailingTpPercent !== undefined ? p.trailingTpPercent > 0 : !!(botRef?.trailingTpPercent && botRef.trailingTpPercent > 0));
                                      }
                                    }}
                                    className={`px-2.5 py-1 text-[10px] border rounded font-semibold cursor-pointer transition duration-150 inline-flex items-center gap-1 ${
                                      isEditingThis
                                        ? "bg-amber-500/20 border-amber-500/50 text-amber-300"
                                        : "bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200"
                                    }`}
                                    title="Manually adjust and lock Stop-Loss, Take-Profit, and Trailing parameters"
                                  >
                                    <Sliders className="w-3 h-3" /> Targets
                                  </button>
                                  <button
                                    onClick={() => handleManualClosePosition(p)}
                                    className="px-2.5 py-1 text-[10px] bg-red-950/70 hover:bg-red-900 border border-red-500/50 text-red-100 hover:text-white rounded cursor-pointer font-bold transition duration-150 inline-flex items-center gap-1.5"
                                    title="Liquidate / Settle position immediately"
                                  >
                                    <XCircle className="w-3.5 h-3.5" /> Force Settle
                                  </button>
                                </div>
                              </td>
                            </tr>

                            {/* Sub-Panel Inline custom Target SL/TP form drawer */}
                            {isEditingThis && (
                              <tr className="bg-[#14151a]/95 border-b border-l border-r border-[#0ecb81]/20">
                                <td colSpan={10} className="p-4 bg-gradient-to-r from-[#14151a] to-[#1a1c24]">
                                  <div className="space-y-4">
                                    {/* Header info */}
                                    <div className="flex justify-between items-center pb-2 border-b border-slate-800/80">
                                      <div className="flex items-center gap-2">
                                        <Sliders className="w-4 h-4 text-emerald-400" />
                                        <span className="font-sans font-black text-slate-200 uppercase tracking-widest text-[11px]">
                                          Configure Dynamic Trade Risk Control ({p.pair})
                                        </span>
                                      </div>
                                      <span className="text-[10px] text-slate-450 text-slate-400 font-sans">
                                        Weighted Entry Price: <span className="text-emerald-400 font-mono font-bold">${p.entryPrice.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 4 })}</span>
                                      </span>
                                    </div>

                                    {/* Parameter control layout */}
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                                      
                                      {/* Take Profit (TP) Panel */}
                                      <div className="p-3 bg-[#1e2329]/60 rounded-lg border border-slate-800 space-y-2">
                                        <div className="flex justify-between items-center">
                                          <label className="text-[10px] font-sans font-bold uppercase tracking-wider text-emerald-400">
                                            🎯 Target Profit Price (TP)
                                          </label>
                                          <span className="text-[11px] font-mono font-bold text-emerald-400">
                                            {calculatedTpPercent > 0 ? `+${calculatedTpPercent.toFixed(2)}% ROI` : ""}
                                          </span>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                          <span className="text-xs text-slate-500 font-mono font-semibold select-none">$</span>
                                          <input
                                            type="number"
                                            step="any"
                                            className="w-full bg-[#0b0e11] border border-slate-800 hover:border-slate-700 focus:border-emerald-500 rounded font-mono py-1 px-2 text-xs text-white focus:outline-none transition"
                                            value={positionTargetTpPrice || ""}
                                            onChange={(e) => setPositionTargetTpPrice(parseFloat(e.target.value) || 0)}
                                            placeholder="Enter absolute TP price target"
                                          />
                                        </div>
                                        {/* Presets */}
                                        <div className="flex flex-wrap gap-1 pt-1.5">
                                          {[1.0, 2.0, 3.5, 5.0, 10.0].map(pct => (
                                            <button
                                              key={`p-tp-${pct}`}
                                              type="button"
                                              onClick={() => {
                                                const targetVal = isLong 
                                                  ? entryPrice * (1 + pct / 100)
                                                  : entryPrice * (1 - pct / 100);
                                                setPositionTargetTpPrice(parseFloat(targetVal.toFixed(4)));
                                              }}
                                              className="bg-slate-800/80 hover:bg-[#02c076]/20 hover:border-[#02c076]/40 text-[9px] font-mono px-1.5 py-0.5 rounded border border-slate-700/60 text-slate-300 hover:text-white transition cursor-pointer"
                                            >
                                              +{pct}%
                                            </button>
                                          ))}
                                        </div>
                                      </div>

                                      {/* Stop Loss (SL) Panel */}
                                      <div className="p-3 bg-[#1e2329]/60 rounded-lg border border-slate-800 space-y-2">
                                        <div className="flex justify-between items-center">
                                          <label className="text-[10px] font-sans font-bold uppercase tracking-wider text-red-400">
                                            🛑 Stop Loss Protection (SL)
                                          </label>
                                          <span className="text-[11px] font-mono font-bold text-red-400 font-sans">
                                            {calculatedSlPercent > 0 ? `-${calculatedSlPercent.toFixed(2)}% Loss` : "Disabled"}
                                          </span>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                          <span className="text-xs text-slate-500 font-mono font-semibold select-none">$</span>
                                          <input
                                            type="number"
                                            step="any"
                                            className="w-full bg-[#0b0e11] border border-slate-800 hover:border-slate-700 focus:border-red-500 rounded font-mono py-1 px-2 text-xs text-white focus:outline-none transition"
                                            value={positionTargetSlPrice || ""}
                                            onChange={(e) => setPositionTargetSlPrice(parseFloat(e.target.value) || 0)}
                                            placeholder="SL Disabled - No protect"
                                          />
                                        </div>
                                        {/* Presets */}
                                        <div className="flex flex-wrap gap-1 pt-1.5">
                                          {[1.0, 2.0, 3.0, 5.0, 8.0].map(pct => (
                                            <button
                                              key={`p-sl-${pct}`}
                                              type="button"
                                              onClick={() => {
                                                const targetVal = isLong 
                                                  ? entryPrice * (1 - pct / 100)
                                                  : entryPrice * (1 + pct / 100);
                                                setPositionTargetSlPrice(parseFloat(targetVal.toFixed(4)));
                                              }}
                                              className="bg-slate-800/80 hover:bg-red-500/20 hover:border-red-500/40 text-[9px] font-mono px-1.5 py-0.5 rounded border border-slate-700/60 text-slate-300 hover:text-white transition cursor-pointer"
                                            >
                                              -{pct}%
                                            </button>
                                          ))}
                                          <button
                                            type="button"
                                            onClick={() => setPositionTargetSlPrice(0)}
                                            className="bg-red-950/40 hover:bg-red-900/60 text-[9px] font-sans px-2 py-0.5 rounded border border-red-900/40 text-red-400 hover:text-white transition cursor-pointer font-bold ml-auto"
                                          >
                                            No SL Trigger
                                          </button>
                                        </div>
                                      </div>

                                      {/* Trailing Profit Configuration Panel */}
                                      <div className="p-3 bg-[#1e2329]/60 rounded-lg border border-slate-800 space-y-2">
                                        <div className="flex justify-between items-center">
                                          <label className="text-[10px] font-sans font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1 cursor-pointer">
                                            <input
                                              type="checkbox"
                                              checked={positionTargetTrailEnabled}
                                              onChange={(e) => setPositionTargetTrailEnabled(e.target.checked)}
                                              className="rounded text-amber-500 focus:ring-amber-500/20 bg-[#0b0e11] cursor-pointer w-3.5 h-3.5 border-slate-700"
                                            />
                                            Trailing Profit Mode
                                          </label>
                                          <span className="text-[11px] font-mono font-bold text-amber-400">
                                            {positionTargetTrailEnabled ? `${positionTargetTrailTpOffset.toFixed(2)}% dev` : "Disabled"}
                                          </span>
                                        </div>

                                        <div className="space-y-1.5 pt-0.5">
                                          <input
                                            type="range"
                                            min="0.05"
                                            max="3"
                                            step="0.05"
                                            value={positionTargetTrailTpOffset}
                                            disabled={!positionTargetTrailEnabled}
                                            onChange={(e) => setPositionTargetTrailTpOffset(parseFloat(e.target.value))}
                                            className={`w-full h-1.5 bg-[#0b0e11] rounded accent-amber-500 cursor-pointer transition ${
                                              !positionTargetTrailEnabled ? "opacity-30 cursor-not-allowed" : ""
                                            }`}
                                          />
                                          <div className="flex justify-between text-[8px] text-slate-500 font-mono">
                                            <span>Tight (0.05%)</span>
                                            <span>Normal (1.0%)</span>
                                            <span>Wide (3.0%)</span>
                                          </div>
                                        </div>
                                        <p className="text-[9px] text-slate-500 font-sans leading-tight pt-1">
                                          Trails your highest profit mark dynamically and exits when price retraces back by your custom offset factor.
                                        </p>
                                      </div>

                                    </div>

                                    {/* Action Buttons */}
                                    <div className="flex justify-end gap-2.5 pt-2 border-t border-slate-800/50">
                                      <button
                                        type="button"
                                        onClick={() => setEditingPositionTargetsId(null)}
                                        className="px-3 py-1.5 bg-[#181a20] hover:bg-slate-800 text-xs text-slate-450 text-slate-400 hover:text-white rounded border border-slate-850 hover:border-slate-700 font-bold transition cursor-pointer"
                                      >
                                        Cancel Adjust
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleSavePositionTargets(
                                            p,
                                            positionTargetTpPrice,
                                            positionTargetSlPrice,
                                            positionTargetTrailEnabled,
                                            positionTargetTrailTpOffset
                                          )
                                        }
                                        className="px-4 py-1.5 bg-[#02c076] hover:bg-[#03d885] text-xs text-white font-extrabold rounded shadow-md shadow-[#02c076]/10 transition hover:shadow-[#02c076]/20 cursor-pointer flex items-center gap-1"
                                      >
                                        <Check className="w-3.5 h-3.5 stroke-[3px]" /> Settle & Lock Targets
                                      </button>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Terminal events logging block */}
            <div className="bg-[#1E2329] border border-slate-800/80 rounded-xl p-6 shadow-xl">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-sm font-sans font-black text-white uppercase tracking-wider flex items-center gap-2">
                  <Terminal className="w-4.5 h-4.5 text-emerald-400" />
                  Trade Systems Console Logging
                </h3>
                {logs.length > 0 && (
                  <button
                    onClick={handleClearLogs}
                    className="text-[10px] font-mono text-slate-500 hover:text-red-400 transition cursor-pointer"
                  >
                    Clear Feed
                  </button>
                )}
              </div>

              {logs.length === 0 ? (
                <div className="py-6 text-center text-slate-500 font-mono text-[11px]">
                  No console events loaded yet...
                </div>
              ) : (
                <div className="max-h-60 overflow-y-auto bg-[#0B0E11]/90 rounded-lg border border-slate-800 p-4 font-mono text-[11px] leading-relaxed space-y-2 select-text scrollbar-thin">
                  {logs.map(l => {
                    let typeColor = "text-slate-400";
                    if (l.type === "trade") typeColor = "text-emerald-400 font-bold";
                    if (l.type === "tp_fill") typeColor = "text-emerald-400 font-black";
                    if (l.type === "dca_fill") typeColor = "text-amber-400 font-bold";
                    if (l.type === "sl_fill") typeColor = "text-red-400 font-black";
                    if (l.type === "error") typeColor = "text-red-500 font-black";

                    const timeStamp = new Date(l.timestamp).toLocaleTimeString();

                    return (
                      <div key={l.id} className="flex gap-2.5 items-start">
                        <span className="text-slate-600 select-none shrink-0">{timeStamp}</span>
                        <div className="grow">
                          <span className={typeColor}>{l.message}</span>
                          {l.botName && <span className="text-[10px] text-slate-600 font-sans ml-2">({l.botName})</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </div>
        )}

        {/* -------------------------------------------------------------------------- */}
        {/* NAV ROUTING TABS: B. CREATE TRADING BOT WIZARD */}
        {/* -------------------------------------------------------------------------- */}
        {activeTab === "create_bot" && (
          <div className="space-y-6 max-w-2xl">
            <div>
              <h1 className="text-2xl font-black font-sans text-white tracking-tight flex items-center gap-2">
                <PlusCircle className="text-emerald-500" /> Launch Crypto Automation Bot
              </h1>
              <p className="text-xs text-slate-400 mt-1">Configure trailing Take Profits, Trailing stop losses, or safety DCA grids.</p>
            </div>

            <form onSubmit={handleCreateBot} className="bg-[#1E2329] border border-slate-800/80 rounded-xl p-6 shadow-xl space-y-6">
              
              {/* Bot Security and Sandbox Mode Picker */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-4 border-b border-slate-800/60">
                <div className="space-y-1">
                  <label className="text-xs uppercase font-mono tracking-wider font-semibold text-slate-400 block">Deploy Target Exchange</label>
                  <select
                    value={botExchange}
                    onChange={(e) => setBotExchange(e.target.value)}
                    className="w-full bg-[#0B0E11] border border-slate-800/80 rounded-lg py-2 px-3 text-sm text-white focus:outline-none focus:border-emerald-500 cursor-pointer font-mono"
                  >
                    <option value="binance">Binance Client (REST / WSS)</option>
                    <option value="bybit">Bybit Financial (REST / WSS)</option>
                    <option value="okx">OKX Enterprise (REST / WSS)</option>
                    <option value="gate.io">Gate.io Global (REST / WSS)</option>
                    <option value="kucoin">KuCoin Trading (REST / WSS)</option>
                  </select>
                  <p className="text-[10px] text-slate-500 font-mono">The exchange API channel where executions route.</p>
                </div>

                <div className="space-y-1">
                  <label className="text-xs uppercase font-mono tracking-wider font-semibold text-slate-400 block">Execution Mode</label>
                  <div className="flex items-center justify-between bg-emerald-500/10 border border-emerald-500/25 rounded-lg py-2 px-3 mt-1 h-[40px]">
                    <span className="text-xs font-mono text-emerald-400 font-extrabold tracking-wider flex items-center gap-1.5 animate-pulse">
                      ⚡ ADMINISTRATOR MULTI-CROSS
                    </span>
                    <span className="bg-emerald-500 text-black font-extrabold text-[8px] px-2 py-0.5 rounded tracking-wide font-mono uppercase">
                      UNRESTRICTED
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-500 font-mono">Bots deploy under Administrator credentials with zero latency overhead.</p>
                </div>
              </div>

              {/* Bot Meta config row */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs uppercase font-mono tracking-wider font-semibold text-slate-400">Trading Bot Label</label>
                  <input
                    id="bot_name_input"
                    type="text"
                    value={botName}
                    onChange={(e) => setBotName(e.target.value)}
                    placeholder="e.g. BTC Mooncatcher"
                    className="w-full bg-[#0B0E11] border border-slate-800/80 rounded-lg py-2 px-3 text-sm text-white focus:outline-none focus:border-emerald-500"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <label className="text-xs uppercase font-mono tracking-wider font-semibold text-slate-400">Target Currency Pair</label>
                    {pairSearchQuery && (
                      <button
                        type="button"
                        onClick={() => setPairSearchQuery("")}
                        className="text-[10px] text-emerald-450 hover:text-emerald-400 font-sans focus:outline-none"
                      >
                        Reset search
                      </button>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <input
                      type="text"
                      placeholder="🔍 Search pairs (e.g. BTC, SOL)..."
                      value={pairSearchQuery}
                      onChange={(e) => {
                        const trimmed = e.target.value;
                        setPairSearchQuery(trimmed);
                        const matched = Object.keys(marketPrices).filter(p => p.toLowerCase().includes(trimmed.toLowerCase()));
                        if (matched.length > 0 && !matched.includes(botPair)) {
                          setBotPair(matched[0]);
                        }
                      }}
                      className="w-full bg-[#0B0E11] border border-slate-800/80 rounded-lg py-1.5 px-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-mono transition"
                    />
                    <select
                      value={botPair}
                      onChange={(e) => setBotPair(e.target.value)}
                      className="w-full bg-[#0B0E11] border border-slate-800/80 rounded-lg py-2 px-3 text-sm text-white focus:outline-none focus:border-emerald-500 uppercase font-mono cursor-pointer"
                    >
                      {Object.keys(marketPrices)
                        .filter(p => p.toLowerCase().includes(pairSearchQuery.toLowerCase()))
                        .map(p => <option key={p} value={p}>{p}</option>)
                      }
                      {Object.keys(marketPrices).filter(p => p.toLowerCase().includes(pairSearchQuery.toLowerCase())).length === 0 && (
                        <option value="" disabled>No pairs match search</option>
                      )}
                    </select>
                  </div>
                </div>
              </div>

              {/* Bot Core Mode Picker Selection */}
              <div className="space-y-1">
                <label className="text-xs uppercase font-mono tracking-wider font-semibold text-slate-400 block mb-1">Bot Strategy Template</label>
                <div className="grid grid-cols-2 gap-4">
                  <button
                    type="button"
                    onClick={() => setBotType("signal")}
                    className={`p-4 rounded-xl border text-left transition select-none cursor-pointer ${botType === "signal" ? "bg-[#0B0E11] border-emerald-500/85" : "bg-[#0B0E11] border-slate-800"}`}
                  >
                    <span className="text-sm font-bold text-white block">Signal Bot</span>
                    <span className="text-[10px] text-slate-400 font-mono block mt-1 leading-normal">
                      Executes trade entries strictly on external webhook alerts. Standard buy, hold, and sell levels.
                    </span>
                  </button>
                  <button
                    type="button"
                    id="select_dca_bot_type"
                    onClick={() => setBotType("dca")}
                    className={`p-4 rounded-xl border text-left transition select-none cursor-pointer ${botType === "dca" ? "bg-[#0B0E11] border-emerald-500/85" : "bg-[#0B0E11] border-slate-800"}`}
                  >
                    <span className="text-sm font-bold text-white block">DCA Scaling Bot (Martingale Grid)</span>
                    <span className="text-[10px] text-slate-400 font-mono block mt-1 leading-normal">
                      Automatically averages down the entry price during retracements by buying configured safety levels.
                    </span>
                  </button>
                </div>
              </div>

              {/* Volume Sizing Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-slate-800/60">
                <div className="space-y-1">
                  <label className="text-xs uppercase font-mono tracking-wider font-semibold text-slate-400">Base Order Size (USDT)</label>
                  <input
                    id="base_order_size_input"
                    type="number"
                    value={botBaseOrder}
                    onChange={(e) => setBotBaseOrder(Math.max(10, parseFloat(e.target.value) || 0))}
                    className="w-full bg-[#0B0E11] border border-slate-800/80 rounded-lg py-2 px-3 text-sm text-white focus:outline-none focus:border-emerald-500"
                    min={10}
                    required
                  />
                  <p className="text-[10px] text-slate-500 font-mono">Size of the initial entry order.</p>
                </div>

                {botType === "dca" && (
                  <div className="space-y-1 animate-fadeIn">
                    <label className="text-xs uppercase font-mono tracking-wider font-semibold text-slate-400">Safety Order Size (USDT)</label>
                    <input
                      id="safety_order_size_input"
                      type="number"
                      value={botSafetyOrder}
                      onChange={(e) => setBotSafetyOrder(Math.max(10, parseFloat(e.target.value) || 0))}
                      className="w-full bg-[#0B0E11] border border-slate-800/80 rounded-lg py-2 px-3 text-sm text-white focus:outline-none focus:border-emerald-500"
                      min={10}
                      required
                    />
                    <p className="text-[10px] text-slate-500 font-mono">Volume placed for DCA average scale-ins.</p>
                  </div>
                )}
              </div>

              {/* DCA specific details config row */}
              {botType === "dca" && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-fadeIn">
                  <div className="space-y-1">
                    <label className="text-xs uppercase font-mono tracking-wider font-semibold text-slate-400">Price Deviation Indicator</label>
                    <div className="flex items-center gap-1">
                      <input
                        id="price_dev_input"
                        type="number"
                        step="0.1"
                        value={botDeviation}
                        onChange={(e) => setBotDeviation(Math.max(0.1, parseFloat(e.target.value) || 0))}
                        className="w-full bg-[#0B0E11] border border-slate-800/80 rounded-lg py-2 px-3 text-sm text-white focus:outline-none focus:border-emerald-500"
                        min={0.1}
                        required
                      />
                      <span className="text-xs font-mono text-slate-500">%</span>
                    </div>
                    <p className="text-[10px] text-slate-500 font-mono font-mono">Price retracement drop before DCA safety order executes.</p>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs uppercase font-mono tracking-wider font-semibold text-slate-400">Maximum Safety Orders</label>
                    <input
                      id="max_safety_input"
                      type="number"
                      value={botMaxSafety}
                      onChange={(e) => setBotMaxSafety(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-full bg-[#0B0E11] border border-slate-800/80 rounded-lg py-2 px-3 text-sm text-white focus:outline-none focus:border-emerald-500"
                      min={1}
                      max={12}
                      required
                    />
                    <p className="text-[10px] text-slate-500 font-mono">Max times the grid will execute scaled integrations.</p>
                  </div>
                </div>
              )}

              {/* Leverage & Capital Protection Algorithmic Risk Grid */}
              <div className="pt-4 border-t border-slate-800/60 space-y-3">
                <h3 className="text-xs uppercase font-mono font-bold tracking-widest text-[#0ecb81] text-emerald-400">Algorithmic Risk Management</h3>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="space-y-1.5 bg-[#0b0e11]/50 p-3 rounded-lg border border-slate-800/80">
                    <label className="text-xs uppercase font-mono tracking-wider font-semibold text-slate-300 block">Leverage: <span className="text-white font-extrabold font-mono text-sm">{botLeverage}x</span></label>
                    <input
                      type="range"
                      min="1"
                      max="200"
                      step="1"
                      value={botLeverage}
                      onChange={(e) => setBotLeverage(Math.min(200, Math.max(1, parseInt(e.target.value) || 1)))}
                      className="w-full accent-emerald-500 cursor-pointer h-1.5 bg-[#181A20] rounded-lg border-none"
                    />
                    <div className="flex justify-between text-[8px] font-mono text-slate-500 leading-none">
                      <span>1x</span>
                      <span>50x</span>
                      <span>100x</span>
                      <span>150x</span>
                      <span>200x</span>
                    </div>
                    <div className="flex items-center gap-1.5 pt-1">
                      <input
                        type="number"
                        min="1"
                        max="200"
                        value={botLeverage}
                        onChange={(e) => setBotLeverage(Math.min(200, Math.max(1, parseInt(e.target.value) || 1)))}
                        className="bg-[#0B0E11] text-[11px] font-mono font-bold text-white border border-slate-800 rounded py-1 px-1.5 w-14 focus:outline-none focus:border-emerald-500"
                      />
                      <span className={`px-2 py-0.5 text-[8px] font-mono font-extrabold uppercase rounded ${
                        botLeverage === 1 ? "bg-slate-800 text-slate-400" :
                        botLeverage <= 10 ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/10" :
                        botLeverage <= 50 ? "bg-yellow-500/15 text-yellow-500 border border-yellow-500/10" :
                        botLeverage <= 100 ? "bg-orange-500/15 text-orange-400 border border-orange-500/15" :
                        "bg-red-500/20 text-red-400 border border-red-500/20 animate-pulse"
                      }`}>
                        {botLeverage === 1 ? "Spot" :
                         botLeverage <= 10 ? "Low Risk" :
                         botLeverage <= 50 ? "Active Risk" :
                         botLeverage <= 100 ? "Elevated" :
                         "EXTREME (200x)"}
                      </span>
                    </div>
                    <p className="text-[9px] text-slate-500 font-mono leading-tight pt-1">Balances locked Margin automatically at entry point.</p>
                  </div>

                  <div className="space-y-1.5 bg-[#0b0e11]/50 p-3 rounded-lg border border-slate-800/80">
                    <label className="text-xs uppercase font-mono tracking-wider font-semibold text-slate-300 block">Margin % Used: <span className="text-white font-extrabold font-mono text-sm">{botMarginPercent}%</span></label>
                    <input
                      type="range"
                      min="1"
                      max="100"
                      step="1"
                      value={botMarginPercent}
                      onChange={(e) => setBotMarginPercent(Math.min(100, Math.max(1, parseInt(e.target.value) || 1)))}
                      className="w-full accent-emerald-500 cursor-pointer h-1.5 bg-[#181A20] rounded-lg border-none"
                    />
                    <div className="flex justify-between text-[8px] font-mono text-slate-500 leading-none">
                      <span>1%</span>
                      <span>25%</span>
                      <span>50%</span>
                      <span>75%</span>
                      <span>100%</span>
                    </div>
                    <div className="flex items-center gap-1.5 pt-1">
                      <input
                        type="number"
                        min="1"
                        max="100"
                        value={botMarginPercent}
                        onChange={(e) => setBotMarginPercent(Math.min(100, Math.max(1, parseInt(e.target.value) || 1)))}
                        className="bg-[#0B0E11] text-[11px] font-mono font-bold text-white border border-slate-800 rounded py-1 px-1.5 w-14 focus:outline-none focus:border-emerald-500"
                      />
                      <span className="text-[9px] font-mono text-slate-400 font-bold uppercase">
                        Portfolio Margin
                      </span>
                    </div>
                    <p className="text-[9px] text-slate-500 font-mono leading-tight pt-1">Defines what percentage of available cash serves as active collateral.</p>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs uppercase font-mono tracking-wider font-semibold text-slate-400">Max Cumulative Budget (USDT)</label>
                    <input
                      type="number"
                      value={botMaxPositionSize}
                      onChange={(e) => setBotMaxPositionSize(Math.max(10, parseFloat(e.target.value) || 0))}
                      className="w-full bg-[#0B0E11] border border-slate-800/80 rounded-lg py-2 px-3 text-sm text-white focus:outline-none focus:border-emerald-500 font-mono"
                      min={10}
                      required
                    />
                    <p className="text-[10px] text-slate-500 font-mono">Limits maximum combined long entries (Base + DCA limits).</p>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs uppercase font-mono tracking-wider font-semibold text-slate-400">Capital Protection Threshold (USDT)</label>
                    <input
                      type="number"
                      value={botCapitalProtection}
                      onChange={(e) => setBotCapitalProtection(Math.max(0, parseFloat(e.target.value) || 0))}
                      className="w-full bg-[#0B0E11] border border-slate-800/80 rounded-lg py-2 px-3 text-sm text-white focus:outline-none focus:border-emerald-500 font-mono"
                      min={0}
                      required
                    />
                    <p className="text-[10px] text-slate-500 font-mono">Halts live triggers if exchange capital drops below this level.</p>
                  </div>
                </div>

                {/* Dynamic Real-time Calculations Panel */}
                {(() => {
                  const estBalance = activeBalances[botExchange]?.USDT || 15000;
                  const estInitialMarginRequired = estBalance * (botMarginPercent / 100);
                  const estInitialPositionSize = estInitialMarginRequired * botLeverage;
                  return (
                    <div className="mt-3 p-4 bg-[#0B0E11]/80 rounded-xl border border-slate-800/80 space-y-3 font-sans animate-fadeIn">
                      <div className="flex justify-between items-center border-b border-slate-800/50 pb-2">
                        <span className="text-[10px] uppercase font-mono tracking-widest font-extrabold text-slate-400">Live Dynamic Position & Margin Estimations</span>
                        <span className="text-[9px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.2 rounded font-mono uppercase font-black">
                          {botLeverage}x Enabled
                        </span>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <div className="flex justify-between items-center text-xs">
                            <span className="text-slate-400">Total Position Value (Entry Price × Position Size × Leverage):</span>
                            <span className="text-white font-mono font-bold">${estInitialPositionSize.toLocaleString(undefined, { minimumFractionDigits: 2 })} USDT</span>
                          </div>
                          <div className="flex justify-between items-center text-xs">
                            <span className="text-slate-400 font-semibold font-sans">Committed Margin Required ({botMarginPercent}% of Balance):</span>
                            <span className="text-emerald-400 font-mono font-black border border-emerald-500/25 px-1.5 py-0.5 rounded bg-emerald-950/20">
                              ${estInitialMarginRequired.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT
                            </span>
                          </div>
                        </div>
                      </div>
                      <p className="text-[10px] text-slate-500 font-mono leading-relaxed pt-1">
                        ⚡ Your exchange account locks the Committed Margin of {botMarginPercent}% of balance, scaling your total position value to {botLeverage}x automatically. No arbitrary fixed settings apply.
                      </p>
                    </div>
                  );
                })()}
              </div>

              {/* Exit Configurations (Trailing Take Profit + Stop Loss) */}
              <div className="pt-4 border-t border-slate-800/60 space-y-4">
                <h3 className="text-xs uppercase font-mono font-bold tracking-widest text-[#0ecb81] text-emerald-400">Take-Profit (TP) & Stop-Loss (SL)</h3>
                
                {/* Quick Setup Presets container */}
                <div className="flex flex-col space-y-2 p-3 bg-slate-800/20 border border-slate-800/50 rounded-xl">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">Quick Setup Presets</span>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setBotTakeProfit(1.5);
                        setBotStopLoss(1.0);
                        setBotTrailingTpEnabled(true);
                        setBotTrailingProfit(1.0);
                        triggerNotification("Standard Preset Applied: TP=1.5%, SL=1.0%, Trailing=1.0%", "success");
                      }}
                      className="px-3 py-2 bg-[#0B0E11] hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-xs text-white rounded-lg font-medium transition cursor-pointer select-none text-center"
                    >
                      <span className="block font-bold">Standard</span>
                      <span className="text-[10px] text-slate-400 font-mono mt-0.5">TP 1.5% | SL 1.0% | TR 1.0%</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setBotTakeProfit(0.2);
                        setBotStopLoss(0.4);
                        setBotTrailingTpEnabled(true);
                        setBotTrailingProfit(0.4);
                        triggerNotification("Scalper Preset Applied: TP=0.2%, SL=0.4%, Trailing=0.4%", "success");
                      }}
                      className="px-3 py-2 bg-[#0B0E11] hover:bg-slate-800 border border-emerald-500/20 hover:border-emerald-500/45 text-xs text-white rounded-lg font-medium transition cursor-pointer select-none text-center"
                    >
                      <span className="block font-bold text-emerald-400">⚡ Scalper</span>
                      <span className="text-[10px] text-slate-400 font-mono mt-0.5">TP 0.2% | SL 0.4% | TR 0.4%</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setBotTakeProfit(3.0);
                        setBotStopLoss(1.5);
                        setBotTrailingTpEnabled(true);
                        setBotTrailingProfit(1.5);
                        triggerNotification("Swing Preset Applied: TP=3.0%, SL=1.5%, Trailing=1.5%", "success");
                      }}
                      className="px-3 py-2 bg-[#0B0E11] hover:bg-slate-800 border border-indigo-500/20 hover:border-indigo-500/45 text-xs text-white rounded-lg font-medium transition cursor-pointer select-none text-center"
                    >
                      <span className="block font-bold text-indigo-400">🛡️ Swing</span>
                      <span className="text-[10px] text-slate-400 font-mono mt-0.5">TP 3.0% | SL 1.5% | TR 1.5%</span>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Standard TP percentage */}
                  <div className="space-y-1">
                    <label className="text-xs uppercase font-mono tracking-wider font-semibold text-slate-400">Target Take Profit (Min 0.01%)</label>
                    <div className="flex items-center gap-1">
                      <input
                        id="target_tp_input"
                        type="number"
                        step="any"
                        value={botTakeProfit}
                        onChange={(e) => setBotTakeProfit(parseFloat(e.target.value) || 0)}
                        className="w-full bg-[#0B0E11] border border-slate-800/80 rounded-lg py-2 px-3 text-sm text-white focus:outline-none focus:border-emerald-500"
                        min={0.01}
                        required
                      />
                      <span className="text-xs font-mono text-slate-500">%</span>
                    </div>
                  </div>

                  {/* Customizable Trailing Take Profit */}
                  <div className="p-3 bg-[#0B0E11]/30 border border-slate-800/50 rounded-xl space-y-2 animate-fadeIn flex flex-col justify-center">
                    <div className="flex items-center gap-2.5 select-none font-sans">
                      <input
                        id="trail_tp_checkbox"
                        type="checkbox"
                        checked={botTrailingTpEnabled}
                        onChange={(e) => setBotTrailingTpEnabled(e.target.checked)}
                        className="w-4 h-4 rounded text-emerald-500 bg-[#0B0E11] border-slate-850 border-slate-800 focus:ring-0 active:scale-95 transition cursor-pointer"
                      />
                      <label htmlFor="trail_tp_checkbox" className="text-xs font-semibold text-white cursor-pointer uppercase font-mono tracking-wider">Enable Trailing Profit</label>
                    </div>

                    {botTrailingTpEnabled ? (
                      <div className="space-y-1 pl-6.5 transition animate-fadeIn">
                        <label className="text-[10px] uppercase font-mono tracking-wider font-semibold text-slate-400">Trailing Profit Deviation Offset (Min 0.001%)</label>
                        <div className="flex items-center gap-1">
                          <input
                            id="trailing_offset_input"
                            type="number"
                            step="any"
                            value={botTrailingProfit}
                            onChange={(e) => setBotTrailingProfit(parseFloat(e.target.value) || 0)}
                            className="w-full bg-[#0B0E11] border border-slate-800/80 rounded-lg py-1 px-2.5 text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
                            min={0.001}
                          />
                          <span className="text-xs font-mono text-slate-500">%</span>
                        </div>
                        <p className="text-[9px] text-slate-400 font-mono leading-tight">Tracks peaks. Position closes only when price drops by this offset from the highest peak seen.</p>
                      </div>
                    ) : (
                      <p className="text-[9px] text-slate-500 pl-6.5 font-mono leading-tight">Standard Take Profit will execute immediately upon reaching the exact Target. No trailing peak-tracking.</p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Stop Loss threshold */}
                  <div className="space-y-1">
                    <label className="text-xs uppercase font-mono tracking-wider font-semibold text-slate-400">Stop Loss Limit (Min 0.01%)</label>
                    <div className="flex items-center gap-1">
                      <input
                        id="stop_loss_input"
                        type="number"
                        step="any"
                        value={botStopLoss}
                        onChange={(e) => setBotStopLoss(parseFloat(e.target.value) || 0)}
                        className="w-full bg-[#0B0E11] border border-slate-800/80 rounded-lg py-2 px-3 text-sm text-white focus:outline-none focus:border-emerald-500"
                        min={0.01}
                      />
                      <span className="text-xs font-mono text-slate-500">%</span>
                    </div>
                    <p className="text-[10px] text-slate-400 font-mono font-sans font-mono animate-fadeIn">Absolute price drop limit trigger. Must be at least 0.01%.</p>
                  </div>

                  {/* Trailing Stop Loss checkbox toggle */}
                  <div className="flex items-center gap-3 pt-5 select-none animate-fadeIn">
                    <input
                      id="trail_sl_checkbox"
                      type="checkbox"
                      checked={botTrailingSL}
                      onChange={(e) => setBotTrailingSL(e.target.checked)}
                      className="w-4.5 h-4.5 rounded text-emerald-500 bg-[#0B0E11] border-slate-800 focus:ring-0 active:scale-95 transition cursor-pointer"
                    />
                    <div>
                      <label htmlFor="trail_sl_checkbox" className="text-xs font-semibold text-white cursor-pointer uppercase font-mono tracking-wider">Enable Trailing Stop Loss</label>
                      <p className="text-[10px] text-slate-500 font-mono">Dynamic Stop Loss tracks price upward locking in cumulative profits.</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-800/60 flex justify-end gap-3 font-sans">
                <button
                  type="button"
                  onClick={() => setActiveTab("dashboard")}
                  className="px-4 py-2 text-xs font-bold text-slate-400 hover:text-white transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  id="submit_create_bot_btn"
                  type="submit"
                  className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-5 py-2 rounded-lg cursor-pointer transition shadow-lg active:scale-95 flex items-center gap-2"
                >
                  <Play className="w-3.5 h-3.5 fill-current" /> Initialize Strategy
                </button>
              </div>

            </form>
          </div>
        )}

        {/* -------------------------------------------------------------------------- */}
        {/* NAV ROUTING TABS: C. BOT LIST/MANAGEMENT */}
        {/* -------------------------------------------------------------------------- */}
        {activeTab === "bot_list" && (
          <div className="space-y-6">
            <div className="flex justify-between items-center bg-[#181A20] p-6 rounded-xl border border-slate-800/80 shadow-xl">
              <div>
                <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
                  <Sliders className="text-emerald-400 w-6 h-6" />
                  Strategy Configuration Manager
                </h1>
                <p className="text-xs text-slate-400 mt-1">
                  Adjust core limits, pause tracking states, edit DCA configurations, or copy specialized signal formatting alerts.
                </p>
              </div>
            </div>

            {displayedBots.length === 0 ? (
              <div className="bg-[#1E2329] border border-slate-800/80 rounded-xl p-8 text-center text-slate-550 text-slate-500 max-w-lg">
                <Settings className="w-12 h-12 mx-auto text-slate-700 mb-2" />
                No active automation strategies configured. Select "New Trading Bot" above to configure a script under Administrator Mode.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {displayedBots.map(bot => {
                  const protocolStr = webhookProtocol ? `${webhookProtocol}://` : "http://";
                  const portStr = webhookPort && webhookPort !== "80" && webhookPort !== "443" ? `:${webhookPort}` : "";
                  
                  // Primary secure parameterized webhook URL containing Bot ID
                  const whUrl = `${protocolStr}${webhookHost}${portStr}/webhook/${bot.id}`;
                  
                  const activeAct = botPayloadActions[bot.id] || "buy";
                  
                  // Complete payload templates adhering explicitly to user specs
                  const buyPayloadJsonString = JSON.stringify({
                    botId: bot.id,
                    botName: bot.name,
                    pair: bot.pair,
                    action: "buy",
                    secret: bot.webhookSecret
                  }, null, 2);

                  const sellPayloadJsonString = JSON.stringify({
                    botId: bot.id,
                    botName: bot.name,
                    pair: bot.pair,
                    action: "sell",
                    secret: bot.webhookSecret
                  }, null, 2);

                  const safetyPayloadJsonString = JSON.stringify({
                    botId: bot.id,
                    botName: bot.name,
                    pair: bot.pair,
                    action: "safety",
                    secret: bot.webhookSecret
                  }, null, 2);

                  const payloadJsonString = activeAct === "buy" 
                    ? buyPayloadJsonString 
                    : activeAct === "sell" 
                      ? sellPayloadJsonString 
                      : safetyPayloadJsonString;

                  return (
                    <div key={bot.id} className="bg-[#1E2329] border border-slate-800/80 rounded-xl p-5 shadow-lg relative overflow-hidden flex flex-col justify-between h-full hover:border-[#38bdf8]/30 transition-all duration-300">
                      
                      <div>
                        {/* Upper row info indicators */}
                        <div className="flex justify-between items-start gap-4">
                          <div>
                            <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                              {bot.type.toUpperCase()} AUTOMATION UNIT
                            </span>
                            <div className="mt-2 text-xs font-mono font-bold text-slate-500 bg-slate-500/10 border border-slate-500/20 px-2 py-0.5 rounded select-none w-fit">
                              ID: <span className="text-emerald-400 select-all font-bold">{bot.id}</span>
                            </div>
                            <h3 className="text-base font-black text-white mt-1.5 tracking-wide block">{bot.name}</h3>
                            {bot.status === "active" && (
                              <div className="mt-1.5 text-[10px] font-mono font-bold text-[#38bdf8] bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded flex items-center gap-1 select-none animate-pulse w-fit">
                                <Radio className="w-3.5 h-3.5 text-[#38bdf8] shrink-0" />
                                <span>WEBHOOK SIGNAL TRACKING ACTIVE</span>
                              </div>
                            )}
                          </div>
                          <span className={`inline-flex items-center gap-1.5 text-xs font-mono font-bold px-2 py-0.5 rounded ${bot.status === "active" ? "bg-emerald-500/10 text-emerald-400" : "bg-zinc-500/15 text-slate-450"}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${bot.status === "active" ? "bg-emerald-400" : "bg-slate-400"}`}></span>
                            {bot.status === "active" ? "ACTIVE" : "PAUSED"}
                          </span>
                        </div>

                        {/* Specs overview details */}
                        <div className="grid grid-cols-2 gap-3.5 mt-4 py-3 border-y border-slate-800/65 font-mono text-[11px] text-slate-400 leading-relaxed bg-[#181A20]/40 px-3.5 rounded-lg border border-slate-800">
                          <div>Pair Symbol: <span className="text-white font-semibold text-xs">{bot.pair}</span></div>
                          <div>Base Order: <span className="text-white font-semibold text-xs">${bot.baseOrderSize} USDT</span></div>
                          {bot.type === "dca" && (
                            <>
                              <div>Safety Orders: <span className="text-white font-semibold">${bot.safetyOrderSize} USDT</span></div>
                              <div>Deviation Gap: <span className="text-white font-semibold">{bot.priceDeviation}%</span></div>
                            </>
                          )}
                          <div>Take Profit: <span className="text-emerald-400 font-bold">+{bot.takeProfitPercent}%</span></div>
                          <div>Trailing Offset: <span className="text-[#0ecb81] font-semibold">{bot.trailingTpPercent}%</span></div>
                          {bot.stopLossPercent ? (
                            <div className="col-span-2 text-red-400">
                              🛑 Target Stop-Loss Limit: <span className="font-semibold">-{bot.stopLossPercent}%</span> {bot.trailingSlEnabled && <span className="text-slate-500 font-sans">(Trailing)</span>}
                            </div>
                          ) : (
                            <div className="col-span-2 text-slate-500">🛑 Stop-Loss Limit: Disabled (0.00%)</div>
                          )}
                        </div>

                        {/* Copyable Webhook Instruction Box */}
                        <div className="bg-[#0B0E11]/90 border border-slate-800/80 p-3.5 rounded-lg mt-4 font-mono text-[10px] space-y-3 shadow-lg">
                          <div className="flex justify-between items-center text-slate-400 border-b border-slate-800 pb-1.5 select-none font-sans">
                            <span className="flex items-center gap-1 font-mono text-[9px] uppercase font-bold tracking-wider text-slate-500">
                              <Code className="w-3.5 h-3.5 text-[#38bdf8]" /> Webhook Automation Linkers
                            </span>
                            <span className="bg-[#38bdf8]/10 text-[#38bdf8] font-bold px-1.5 py-0.2 rounded text-[8px] uppercase font-mono tracking-widest border border-[#38bdf8]/20">POST SECURE</span>
                          </div>

                          {/* Interactive VPS URL Customizer directly inside Linker Box */}
                          <div className="bg-[#181A20] rounded-lg p-2 border border-slate-800 space-y-2">
                            <div className="flex justify-between items-center text-[8px] font-bold text-slate-500 tracking-wider uppercase font-mono">
                              <span className="flex items-center gap-1"><Globe className="w-3 h-3 text-amber-500" /> VPS Custom Linker Configuration</span>
                              <span className="text-amber-400">customizer</span>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-2 text-[9px] font-sans">
                              <div>
                                <label className="text-[8px] font-bold text-slate-400 block mb-0.5 uppercase font-mono">Port Override</label>
                                <div className="flex gap-1.5">
                                  <input
                                    type="text"
                                    value={webhookPort}
                                    onChange={(e) => setWebhookPort(e.target.value)}
                                    placeholder="80, 3000"
                                    className="w-full bg-[#0B0E11] border border-slate-800 rounded px-1.5 py-0.5 text-[10px] text-white focus:outline-none focus:border-emerald-500 font-mono"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setWebhookPort("80");
                                      setWebhookProtocol("http");
                                    }}
                                    className={`px-1.5 py-0.5 rounded text-[8px] font-mono font-bold transition border cursor-pointer shrink-0 ${
                                      webhookPort === "80"
                                        ? "bg-emerald-500/25 border-emerald-500/40 text-emerald-400"
                                        : "bg-slate-900 border-slate-800 text-slate-400 hover:text-white"
                                    }`}
                                    title="Set Webhook Port to 80 (standard VPS HTTP)"
                                  >
                                    80
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setWebhookPort("3000")}
                                    className={`px-1.5 py-0.5 rounded text-[8px] font-mono font-bold transition border cursor-pointer shrink-0 ${
                                      webhookPort === "3000"
                                        ? "bg-blue-500/25 border-blue-500/40 text-blue-400"
                                        : "bg-slate-900 border-slate-800 text-slate-400 hover:text-white"
                                    }`}
                                    title="Set Webhook Port to 3000"
                                  >
                                    3k
                                  </button>
                                </div>
                              </div>

                              <div>
                                <label className="text-[8px] font-bold text-slate-400 block mb-0.5 uppercase font-mono">Host / VPS IP Address</label>
                                <input
                                  type="text"
                                  value={webhookHost}
                                  onChange={(e) => setWebhookHost(e.target.value)}
                                  placeholder="e.g. 192.168.1.50"
                                  className="w-full bg-[#0B0E11] border border-slate-800 rounded px-1.5 py-0.5 text-[10px] text-white focus:outline-none focus:border-emerald-500 font-mono"
                                />
                              </div>
                            </div>
                          </div>
                          
                          {/* Destination Webhook Copy group */}
                          <div className="space-y-1">
                            <div className="flex justify-between items-center">
                              <span className="text-slate-500 uppercase text-[8px] font-bold select-none">SECURE UNIQUE WEBHOOK URL</span>
                              <button
                                onClick={() => handleCopyText(bot.id + "_url", whUrl)}
                                className="text-[#38bdf8] hover:text-blue-300 font-sans text-[9px] font-bold flex items-center gap-1 cursor-pointer"
                              >
                                {copiedStates[bot.id + "_url"] ? (
                                  <><Check className="w-2.5 h-2.5" /> Webhook URL Copied!</>
                                ) : (
                                  <><Copy className="w-2.5 h-2.5" /> Copy Webhook URL</>
                                )}
                              </button>
                            </div>
                            <span className="text-white block bg-[#181A20] p-1.5 rounded border border-slate-800 text-[9.5px] truncate leading-tight select-all">
                              {whUrl}
                            </span>
                          </div>

                          {/* Quick Payload copy tools */}
                          <div className="py-2 px-2.5 bg-[#181A20] rounded border border-slate-800 space-y-2">
                            <div className="flex justify-between items-center border-b border-slate-800 pb-1 text-[8px] font-bold text-slate-400 font-mono">
                              <span>QUICK PAYLOAD UTILITIES</span>
                              <span className="text-[#38bdf8]">JSON template alerts</span>
                            </div>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => handleCopyText(bot.id + "_buy_json", buyPayloadJsonString)}
                                className="flex-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 font-sans text-[9px] font-bold py-1 px-1.5 rounded border border-emerald-500/20 flex items-center justify-center gap-1 cursor-pointer transition"
                              >
                                {copiedStates[bot.id + "_buy_json"] ? (
                                  <><Check className="w-3 h-3" /> Buy Copied!</>
                                ) : (
                                  <><Copy className="w-3 h-3" /> Copy Buy Payload</>
                                )}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleCopyText(bot.id + "_sell_json", sellPayloadJsonString)}
                                className="flex-1 bg-red-500/10 hover:bg-red-500/20 text-red-400 font-sans text-[9px] font-bold py-1 px-1.5 rounded border border-red-500/20 flex items-center justify-center gap-1 cursor-pointer transition"
                              >
                                {copiedStates[bot.id + "_sell_json"] ? (
                                  <><Check className="w-3 h-3" /> Sell Copied!</>
                                ) : (
                                  <><Copy className="w-3 h-3" /> Copy Sell Payload</>
                                )}
                              </button>
                            </div>
                          </div>

                          {/* Dynamic Signal tabs switch trigger */}
                          <div className="space-y-1">
                            <div className="flex justify-between items-center">
                              <span className="text-slate-550 text-slate-500 uppercase text-[8px] font-bold select-none">LIVE INTERACTIVE PREVIEW</span>
                              <button
                                onClick={() => handleCopyText(bot.id + "_clone_json", payloadJsonString)}
                                className="text-emerald-400 hover:text-emerald-300 font-sans text-[9px] font-bold flex items-center gap-1 cursor-pointer"
                              >
                                {copiedStates[bot.id + "_clone_json"] ? (
                                  <><Check className="w-2.5 h-2.5" /> Preview Copied!</>
                                ) : (
                                  <><Copy className="w-2.5 h-2.5" /> Copy Selected JSON</>
                                )}
                              </button>
                            </div>

                            {/* Subtabs selector action triggers */}
                            <div className="flex bg-[#181A20] p-0.5 rounded border border-slate-800 text-[9px] font-sans font-semibold mb-1">
                              <button
                                type="button"
                                onClick={() => setBotPayloadActions(prev => ({ ...prev, [bot.id]: "buy" }))}
                                className={`flex-1 py-1 rounded cursor-pointer transition uppercase text-center ${activeAct === "buy" ? "bg-emerald-600/20 text-emerald-400 border border-emerald-500/10 font-bold" : "text-slate-400 hover:text-slate-200"}`}
                              >
                                Buy Signal
                              </button>
                              <button
                                type="button"
                                onClick={() => setBotPayloadActions(prev => ({ ...prev, [bot.id]: "sell" }))}
                                className={`flex-1 py-1 rounded cursor-pointer transition uppercase text-center ${activeAct === "sell" ? "bg-red-600/20 text-red-400 border border-red-500/10 font-bold" : "text-slate-400 hover:text-slate-200"}`}
                              >
                                Sell Signal
                              </button>
                              {bot.type === "dca" && (
                                <button
                                  type="button"
                                  onClick={() => setBotPayloadActions(prev => ({ ...prev, [bot.id]: "safety" }))}
                                  className={`flex-1 py-1 rounded cursor-pointer transition uppercase text-center ${activeAct === "safety" ? "bg-emerald-600/20 text-emerald-400 border border-emerald-500/10 font-bold" : "text-slate-400 hover:text-slate-200"}`}
                                >
                                  Safety Order
                                </button>
                              )}
                            </div>

                            {/* JSON code block display */}
                            <pre className="text-slate-200 overflow-x-auto leading-tight bg-[#040608] p-2.5 rounded border border-slate-800/85 font-mono text-[9.5px]">
                              {payloadJsonString}
                            </pre>
                          </div>
                        </div>
                      </div>

                      {/* Bot Admin Toggle controls */}
                      <div className="flex gap-2 mt-5 font-sans border-t border-slate-800/50 pt-4 flex-wrap">
                        <button
                          onClick={() => handleToggleBot(bot)}
                          className={`flex-1 min-w-[120px] py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer border transition ${bot.status === "active" ? "bg-[#0B0E11]/80 border-slate-800 hover:bg-slate-900/60 text-slate-350" : "bg-emerald-600 border-emerald-500 hover:bg-emerald-500 text-white"}`}
                        >
                          {bot.status === "active" ? (
                            <><Pause className="w-3.5 h-3.5" /> Pause Tracking</>
                          ) : (
                            <><Play className="w-3.5 h-3.5 fill-current" /> Start Tracking</>
                          )}
                        </button>
                        
                        {/* Edit strategy configuration metadata button */}
                        <button
                          onClick={() => handleEditClick(bot)}
                          className="px-3 py-1.5 rounded-lg border border-slate-800 bg-[#181A20] font-sans hover:bg-slate-800 transition cursor-pointer text-xs font-semibold text-slate-300 flex items-center gap-1.5"
                          title="Tweak parameters, sizes, take profits, or bounds for this active strategy"
                        >
                          <Edit className="w-3.5 h-3.5 text-slate-400" /> Edit
                        </button>

                        <button
                          onClick={() => handleDeleteBot(bot.id, bot.name)}
                          className="px-3 py-1.5 rounded-lg border border-red-500/20 font-sans text-red-400 hover:bg-red-500/10 transition cursor-pointer flex items-center gap-1.5 text-xs font-bold"
                          title="Erase Bot configurations completely"
                        >
                          <Trash2 className="w-4 h-4" /> Delete
                        </button>
                      </div>

                    </div>
                  );
                })}
              </div>
            )}

            {/* STRATEGY MODIFICATION EDIT MODAL OVERLAY */}
            {editingBot && (
              <div className="fixed inset-0 bg-[#040608]/90 backdrop-blur-md flex items-center justify-center z-50 p-4 transition animate-fadeIn select-none">
                <div 
                  className="bg-[#1E2329] border border-slate-800/90 rounded-2xl p-6 shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto space-y-5 animate-slideUp select-text"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex justify-between items-start border-b border-slate-800/80 pb-3">
                    <div>
                      <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-[#0ecb81] text-emerald-400">
                        Edit Strategy Parameters
                      </span>
                      <h2 className="text-xl font-black text-white mt-0.5 font-sans tracking-tight">
                        {editingBot.name}
                      </h2>
                    </div>
                    <button 
                      onClick={() => setEditingBot(null)}
                      className="text-slate-400 hover:text-white transition cursor-pointer font-sans font-bold text-lg p-1"
                    >
                      ✕
                    </button>
                  </div>

                  <form onSubmit={handleUpdateBot} className="space-y-4 font-sans text-xs">
                    
                    {/* Bot Name label setting */}
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-350 block uppercase font-mono tracking-wider">Trading Bot Label</label>
                      <input
                        type="text"
                        value={editBotName}
                        onChange={(e) => setEditBotName(e.target.value)}
                        className="w-full bg-[#0B0E11] border border-slate-800 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-emerald-500"
                        required
                      />
                    </div>

                    {/* Pricing configuration row details */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <div className="flex justify-between items-center">
                          <label className="text-xs font-bold text-slate-350 block uppercase font-mono tracking-wider">Instrument Pair</label>
                          {editPairSearchQuery && (
                            <button
                              type="button"
                              onClick={() => setEditPairSearchQuery("")}
                              className="text-[10px] text-emerald-450 hover:text-emerald-400 font-sans focus:outline-none"
                            >
                              Reset
                            </button>
                          )}
                        </div>
                        <div className="space-y-1">
                          <input
                            type="text"
                            placeholder="🔍 Search (e.g. BTC)..."
                            value={editPairSearchQuery}
                            onChange={(e) => {
                              const trimmed = e.target.value;
                              setEditPairSearchQuery(trimmed);
                              const matched = Object.keys(marketPrices).filter(p => p.toLowerCase().includes(trimmed.toLowerCase()));
                              if (matched.length > 0 && !matched.includes(editBotPair)) {
                                setEditBotPair(matched[0]);
                              }
                            }}
                            className="w-full bg-[#0B0E11] border border-slate-800 rounded-lg p-1.5 text-[11px] text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-mono"
                          />
                          <select
                            value={editBotPair}
                            onChange={(e) => setEditBotPair(e.target.value)}
                            className="w-full bg-[#0B0E11] border border-slate-800 rounded-lg p-2 text-xs text-white uppercase font-mono focus:border-emerald-555 focus:outline-none cursor-pointer"
                          >
                            {Object.keys(marketPrices)
                              .filter(p => p.toLowerCase().includes(editPairSearchQuery.toLowerCase()))
                              .map(p => (
                                <option key={p} value={p}>{p}</option>
                              ))
                            }
                            {Object.keys(marketPrices).filter(p => p.toLowerCase().includes(editPairSearchQuery.toLowerCase())).length === 0 && (
                              <option value="" disabled>No pairs match</option>
                            )}
                          </select>
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-350 block uppercase font-mono tracking-wider">Base Order Size (USDT)</label>
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            value={editBotBaseOrder}
                            onChange={(e) => setEditBotBaseOrder(Math.max(5, parseFloat(e.target.value) || 0))}
                            className="w-full bg-[#0B0E11] border border-slate-800 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                            min={5}
                            required
                          />
                          <span className="font-mono text-slate-500">USDT</span>
                        </div>
                      </div>
                    </div>

                    {/* Dynamic Leverage Configurator - Edit Mode */}
                    <div className="p-4 bg-[#181A20]/80 rounded-xl border border-slate-800/80 space-y-3">
                      <div className="text-[10px] uppercase font-bold text-emerald-400 tracking-wider font-mono flex items-center gap-1.5 mb-1 font-sans">
                        <Sliders className="w-3.5 h-3.5" />
                        Dynamic Leverage Configurator (1x - 200x)
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
                        <div className="space-y-1">
                          <div className="flex justify-between text-[11px] text-slate-400 font-sans">
                            <span>Adjust Leverage Ratio</span>
                            <span className="font-mono text-white font-extrabold">{editBotLeverage}x Factor</span>
                          </div>
                          <input
                            type="range"
                            min="1"
                            max="200"
                            step="1"
                            value={editBotLeverage}
                            onChange={(e) => setEditBotLeverage(Math.min(200, Math.max(1, parseInt(e.target.value) || 1)))}
                            className="w-full accent-emerald-500 cursor-pointer h-1.5 bg-[#0b0e11] rounded-lg border-none"
                          />
                          <div className="flex justify-between text-[8px] font-mono text-slate-500">
                            <span>1x</span>
                            <span>50x</span>
                            <span>100x</span>
                            <span>150x</span>
                            <span>200x Max</span>
                          </div>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-500 uppercase font-mono tracking-wider block font-sans">Or Enter Manual Multiplier</label>
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              min="1"
                              max="200"
                              value={editBotLeverage}
                              onChange={(e) => setEditBotLeverage(Math.min(200, Math.max(1, parseInt(e.target.value) || 1)))}
                              className="bg-[#0b0e11] text-xs font-mono font-bold text-white border border-slate-800 rounded-lg py-1.5 px-3 w-28 focus:outline-none focus:border-emerald-500"
                            />
                            <span className={`px-2 py-1 text-[9px] font-mono font-extrabold uppercase rounded shrink-0 ${
                              editBotLeverage === 1 ? "bg-slate-800 text-slate-400" :
                              editBotLeverage <= 10 ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" :
                              editBotLeverage <= 50 ? "bg-yellow-500/10 text-yellow-500 border border-yellow-500/20" :
                              editBotLeverage <= 100 ? "bg-orange-500/10 text-orange-400 border border-orange-500/20" :
                              "bg-red-500/15 text-red-400 border border-red-500/20 animate-pulse"
                            }`}>
                              {editBotLeverage === 1 ? "Spot (1x)" :
                               editBotLeverage <= 10 ? "Low Risk" :
                               editBotLeverage <= 50 ? "Active Risk" :
                               editBotLeverage <= 100 ? "Elevated" :
                               "EXTREME (200x)"}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Margin % used - Edit Mode */}
                      <div className="border-t border-slate-800/40 pt-3 mt-2 grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
                        <div className="space-y-1">
                          <div className="flex justify-between text-[11px] text-slate-400 font-sans">
                            <span>Adjust Committed Margin % Used</span>
                            <span className="font-mono text-white font-extrabold">{editBotMarginPercent}%</span>
                          </div>
                          <input
                            type="range"
                            min="1"
                            max="100"
                            step="1"
                            value={editBotMarginPercent}
                            onChange={(e) => setEditBotMarginPercent(Math.min(100, Math.max(1, parseInt(e.target.value) || 1)))}
                            className="w-full accent-emerald-500 cursor-pointer h-1.5 bg-[#0b0e11] rounded-lg border-none"
                          />
                          <div className="flex justify-between text-[8px] font-mono text-slate-500">
                            <span>1%</span>
                            <span>25%</span>
                            <span>50%</span>
                            <span>75%</span>
                            <span>100% Max</span>
                          </div>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-500 uppercase font-mono tracking-wider block font-sans">Or Enter Manual Percentage</label>
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              min="1"
                              max="100"
                              value={editBotMarginPercent}
                              onChange={(e) => setEditBotMarginPercent(Math.min(100, Math.max(1, parseInt(e.target.value) || 1)))}
                              className="bg-[#0b0e11] text-xs font-mono font-bold text-white border border-slate-800 rounded-lg py-1.5 px-3 w-28 focus:outline-none focus:border-emerald-500"
                            />
                            <span className="text-[9px] font-mono text-slate-455 font-bold uppercase shrink-0">
                              Portfolio Margin
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* DCA Parameters condition panel */}
                    {editingBot.type === "dca" && (
                      <div className="p-4 bg-[#181A20]/80 rounded-xl border border-slate-800/80 space-y-4">
                        <div className="text-[10px] uppercase font-bold text-slate-450 tracking-wider font-mono text-slate-400">DCA Scaling Bounds Settings</div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-350 block uppercase tracking-wider font-mono text-slate-500">Safety Order (USDT)</label>
                            <input
                              type="number"
                              value={editBotSafetyOrder}
                              onChange={(e) => setEditBotSafetyOrder(Math.max(5, parseFloat(e.target.value) || 0))}
                              className="w-full bg-[#0B0E11] border border-slate-800 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                              min={5}
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-350 block uppercase tracking-wider font-mono text-slate-500">DCA Deviation Gap %</label>
                            <input
                              type="number"
                              step="0.1"
                              value={editBotDeviation}
                              onChange={(e) => setEditBotDeviation(Math.max(0.1, parseFloat(e.target.value) || 0))}
                              className="w-full bg-[#0B0E11] border border-slate-800 rounded-lg p-2 text-xs text-white focus:outline-none"
                              min={0.1}
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-350 block uppercase tracking-wider font-mono text-slate-500">Max Safety Orders</label>
                            <input
                              type="number"
                              value={editBotMaxSafety}
                              onChange={(e) => setEditBotMaxSafety(Math.max(1, parseInt(e.target.value) || 1))}
                              className="w-full bg-[#0B0E11] border border-slate-800 rounded-lg p-2 text-xs text-white focus:outline-none"
                              min={1}
                              max={15}
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Exit Conditions customization group */}
                    <div className="p-4 bg-[#181A20]/80 rounded-xl border border-slate-800/80 space-y-4">
                      <div className="text-[10px] uppercase font-bold text-emerald-400 tracking-wider font-mono flex items-center gap-1">Take Profit & Protection Metrics</div>
                      
                      {/* Quick Setup Presets container */}
                      <div className="flex flex-col space-y-2 p-2.5 bg-slate-900/40 border border-slate-800 rounded-xl">
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider font-mono">Quick Setup Presets</span>
                        <div className="grid grid-cols-3 gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setEditBotTakeProfit(1.5);
                              setEditBotStopLoss(1.0);
                              setEditBotTrailingTpEnabled(true);
                              setEditBotTrailingProfit(1.0);
                              triggerNotification("Standard Preset Applied: TP=1.5%, SL=1.0%, Trailing=1.0%", "success");
                            }}
                            className="px-2 py-1.5 bg-[#0B0E11] hover:bg-slate-800 border border-slate-800 text-[10px] text-white rounded-lg font-medium transition cursor-pointer select-none text-center"
                          >
                            <span className="block font-bold">Standard</span>
                            <span className="text-[9px] text-slate-400 font-mono mt-0.5">TP 1.5 | SL 1.0 | TR 1.0</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditBotTakeProfit(0.2);
                              setEditBotStopLoss(0.4);
                              setEditBotTrailingTpEnabled(true);
                              setEditBotTrailingProfit(0.4);
                              triggerNotification("Scalper Preset Applied: TP=0.2%, SL=0.4%, Trailing=0.4%", "success");
                            }}
                            className="px-2 py-1.5 bg-[#0B0E11] hover:bg-slate-800 border border-slate-800 text-[10px] text-white rounded-lg font-medium transition cursor-pointer select-none text-center"
                          >
                            <span className="block font-bold text-emerald-400">⚡ Scalper</span>
                            <span className="text-[9px] text-slate-400 font-mono mt-0.5">TP 0.2 | SL 0.4 | TR 0.4</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditBotTakeProfit(3.0);
                              setEditBotStopLoss(1.5);
                              setEditBotTrailingTpEnabled(true);
                              setEditBotTrailingProfit(1.5);
                              triggerNotification("Swing Preset Applied: TP=3.0%, SL=1.5%, Trailing=1.5%", "success");
                            }}
                            className="px-2 py-1.5 bg-[#0B0E11] hover:bg-slate-800 border border-indigo-500/20 hover:indigo-500/40 text-[10px] text-white rounded-lg font-medium transition cursor-pointer select-none text-center"
                          >
                            <span className="block font-bold text-indigo-400">🛡️ Swing</span>
                            <span className="text-[9px] text-slate-400 font-mono mt-0.5">TP 3.0 | SL 1.5 | TR 1.5</span>
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-350 block uppercase tracking-wider font-mono text-slate-500">Target Take Profit TP % (Min 0.01%)</label>
                          <input
                            type="number"
                            step="any"
                            value={editBotTakeProfit}
                            onChange={(e) => setEditBotTakeProfit(parseFloat(e.target.value) || 0)}
                            className="w-full bg-[#0B0E11] border border-slate-800 rounded-lg p-2 text-xs text-white focus:outline-none"
                            min={0.01}
                            required
                          />
                        </div>

                        {/* Customizable Trailing Take Profit in Edit mode */}
                        <div className="p-2.5 bg-[#0B0E11]/30 border border-slate-800/60 rounded-xl space-y-1.5 flex flex-col justify-center">
                          <div className="flex items-center gap-2 select-none">
                            <input
                              id="edit_trail_tp_chk"
                              type="checkbox"
                              checked={editBotTrailingTpEnabled}
                              onChange={(e) => setEditBotTrailingTpEnabled(e.target.checked)}
                              className="w-3.5 h-3.5 rounded text-emerald-500 bg-[#0B0E11] border-slate-800 focus:ring-0 cursor-pointer"
                            />
                            <label htmlFor="edit_trail_tp_chk" className="text-[10px] font-bold text-white cursor-pointer uppercase font-mono tracking-wider">Enable Trailing Profit</label>
                          </div>

                          {editBotTrailingTpEnabled ? (
                            <div className="space-y-1 pl-5.5 animate-fadeIn">
                              <label className="text-[9px] uppercase font-mono tracking-wider font-semibold text-slate-400 block">TP Deviation Offset % (Min 0.001%)</label>
                              <div className="flex items-center gap-1">
                                <input
                                  type="number"
                                  step="any"
                                  value={editBotTrailingProfit}
                                  onChange={(e) => setEditBotTrailingProfit(parseFloat(e.target.value) || 0)}
                                  className="w-full bg-[#0B0E11] border border-slate-800 rounded-lg p-1 text-[11px] text-white focus:outline-none font-mono"
                                  min={0.001}
                                />
                                <span className="text-[10px] font-mono text-slate-500">%</span>
                              </div>
                            </div>
                          ) : (
                            <p className="text-[9px] text-slate-500 pl-5.5 font-mono leading-tight">Instant lock-in upon crossing target level.</p>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-slate-800/65 pt-3.5">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-350 block uppercase tracking-wider font-mono text-slate-555 text-slate-500">Protect Stop Loss Threshold %</label>
                          <input
                            type="number"
                            step="any"
                            value={editBotStopLoss}
                            onChange={(e) => setEditBotStopLoss(parseFloat(e.target.value) || 0)}
                            className="w-full bg-[#0B0E11] border border-slate-800 rounded-lg p-2 text-xs text-white focus:outline-none"
                            min={0.01}
                          />
                        </div>

                        <div className="flex items-center gap-2.5 pt-4">
                          <input
                            id="edit_trail_sl_chk"
                            type="checkbox"
                            checked={editBotTrailingSL}
                            onChange={(e) => setEditBotTrailingSL(e.target.checked)}
                            className="w-4 h-4 text-emerald-500 bg-[#0B0E11] border-slate-800 focus:ring-0 cursor-pointer"
                          />
                          <div>
                            <label htmlFor="edit_trail_sl_chk" className="text-[10px] font-bold text-white cursor-pointer uppercase font-mono">Enable Trailing SL</label>
                            <span className="text-[9px] text-slate-500 block leading-none mt-0.5">Dynamic trailing tracking</span>
                          </div>
                        </div>
                      </div>

                    </div>

                     {/* Live Dynamic Calculations Preview - Edit Mode */}
                     {(() => {
                        const estBalance = activeBalances[editingBot.exchange || "binance"]?.USDT || 15000;
                        const estInitialMarginRequired = estBalance * (editBotMarginPercent / 100);
                        const estInitialPositionSize = estInitialMarginRequired * editBotLeverage;
                        return (
                          <div className="p-4 bg-[#0B0E11]/80 rounded-xl border border-slate-800/80 space-y-3 font-sans">
                            <div className="flex justify-between items-center border-b border-slate-800/50 pb-2">
                              <span className="text-[10px] uppercase font-mono tracking-widest font-extrabold text-slate-400">Live Edited Position & Margin Estimations</span>
                              <span className="text-[9px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.2 rounded font-mono uppercase font-black">
                                {editBotLeverage}x Mode
                              </span>
                            </div>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div className="space-y-1.5">
                                <div className="flex justify-between items-center text-xs">
                                  <span className="text-slate-400">Total Position Value (Entry Price × Position Size × Leverage):</span>
                                  <span className="text-white font-mono font-bold">${estInitialPositionSize.toLocaleString(undefined, { minimumFractionDigits: 2 })} USDT</span>
                                </div>
                                <div className="flex justify-between items-center text-xs">
                                  <span className="text-slate-400 font-semibold">Committed Margin Required ({editBotMarginPercent}% of Balance):</span>
                                  <span className="text-emerald-400 font-mono font-black border border-emerald-500/25 px-1.5 py-0.5 rounded bg-emerald-950/20">
                                    ${estInitialMarginRequired.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                     })()}

                    {/* Actions Row */}
                    <div className="flex justify-end gap-3 pt-3.5 border-t border-slate-800/80 text-xs">
                      <button
                        type="button"
                        onClick={() => setEditingBot(null)}
                        className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white transition cursor-pointer"
                      >
                        Abort Tweaking
                      </button>
                      <button
                        type="submit"
                        className="bg-emerald-600 hover:bg-emerald-500 text-white font-heavy text-xs px-5 py-2 rounded-lg cursor-pointer transition shadow-lg flex items-center gap-1"
                      >
                        <Check className="w-3.5 h-3.5" /> Save Strategy Configuration
                      </button>
                    </div>

                  </form>
                </div>
              </div>
            )}

          </div>
        )}

        {/* -------------------------------------------------------------------------- */}
        {/* NAV ROUTING TABS: D. MULTILATERAL EXCHANGES API SETTING */}
        {/* -------------------------------------------------------------------------- */}
        {activeTab === "exchanges" && (
          <div className="space-y-6 max-w-3xl animate-fadeIn">
            <div>
              <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2 font-sans">
                <Wallet className="text-emerald-400" /> Multi-Exchange API Credential Management
              </h1>
              <p className="text-xs text-slate-400 mt-0.5 font-sans">Register authenticated API keys with double‑endpoint cross‑check validation and real‑time WebSocket data-streams.</p>
            </div>

            {/* Withdrawal Restrictor Lock Dialog Modal Backdrop popup */}
            {withdrawalBlockMsg && (
              <div className="fixed inset-0 z-50 bg-[#0B0E11]/85 backdrop-blur-sm flex items-center justify-center p-4">
                <div className="bg-[#1E2329] border-2 border-red-500/35 rounded-xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-scaleUp">
                  <div className="flex items-center gap-3 text-red-400">
                    <ShieldAlert className="w-8 h-8 shrink-0 animate-bounce" />
                    <div>
                      <h2 className="text-sm font-black uppercase font-mono tracking-wider">Security Access Lock Triggered</h2>
                      <p className="text-[10px] text-slate-450 font-sans">Policy Action: Enforced Safeguard Prevents Exfiltration</p>
                    </div>
                  </div>
                  <div className="p-3 bg-red-950/20 border border-red-500/20 rounded-lg text-xs font-mono text-slate-300 leading-normal">
                    {withdrawalBlockMsg}
                  </div>
                  <p className="text-[10px] text-slate-500 font-sans">
                    All linked API credentials operate exclusively under a strictly locked sandboxed enclave. 
                    Asset withdrawal channels are fully blocked server-side by security policy. Your fund capitals are secure.
                  </p>
                  <div className="pt-2">
                    <button
                      onClick={() => setWithdrawalBlockMsg(null)}
                      className="w-full py-2 rounded-lg bg-red-650 hover:bg-red-600 border border-red-500/30 text-white font-mono text-xs font-bold transition cursor-pointer select-none"
                    >
                      Acknowledge & Safe Close
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Environment Control Panel */}
            <div className="bg-[#1E2329] border border-slate-800/80 rounded-xl p-5 shadow-xl space-y-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 font-sans">
                <div>
                  <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-emerald-400 font-bold" />
                    Trading Environment Control Center
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Toggle execution networks. Unrestricted Administration Mode gives full visibility over demo & production accounts.
                  </p>
                </div>
                
                {/* Mode Select Buttons */}
                <div className="flex gap-2">
                  <button
                    id="real_mode_selector_btn"
                    onClick={() => {
                      setGlobalMode("real");
                      triggerNotification("Real Mode (production account) selected", "info");
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold font-mono transition cursor-pointer select-none border ${
                      globalMode === "real" 
                        ? "bg-emerald-500/15 border-emerald-500 text-emerald-300" 
                        : "bg-slate-900/50 border-slate-800 text-slate-450 hover:bg-slate-850"
                    }`}
                  >
                    🚀 Real Mode (Production)
                  </button>
                  <button
                    id="demo_mode_selector_btn"
                    onClick={() => {
                      setGlobalMode("sandbox");
                      triggerNotification("Demo Mode (sandbox/testnet) selected", "info");
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold font-mono transition cursor-pointer select-none border ${
                      globalMode === "sandbox" 
                        ? "bg-amber-500/15 border-amber-500 text-amber-300" 
                        : "bg-slate-900/50 border-slate-800 text-slate-450 hover:bg-slate-850"
                    }`}
                  >
                    🧪 Demo Mode (Sandbox)
                  </button>
                </div>
              </div>

              {/* Status indicator bar */}
              <div className={`p-3 rounded-lg border flex items-center justify-between text-xs font-mono leading-relaxed ${
                globalMode === "real"
                  ? "bg-emerald-950/15 border-emerald-500/25 text-emerald-300"
                  : "bg-amber-950/15 border-amber-500/25 text-amber-300"
              }`}>
                <div className="flex items-center gap-2.5">
                  <span className={`w-2.5 h-2.5 rounded-full ${globalMode === "real" ? "bg-[#0ecb81]" : "bg-amber-500"} animate-pulse shrink-0`} />
                  <span>
                    Status: <strong className="font-extrabold uppercase">{globalMode} Mode</strong> is active. 
                    {globalMode === "real" 
                      ? " High-priority queries map to live Binance REST/WebSocket endpoints." 
                      : " Bypass credentials checks. Secure zero-risk sandbox simulation enabled."}
                  </span>
                </div>
                <div className="text-[9px] bg-slate-900/60 px-2 py-0.5 rounded border border-slate-800 text-slate-450 font-extrabold hidden sm:block uppercase">
                  Privileged Admin Access
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Credentials registration Form */}
              <div className="lg:col-span-2 bg-[#1E2329] border border-slate-800/80 rounded-xl p-6 shadow-xl space-y-4">
                <h3 className="text-sm font-sans font-black text-white uppercase tracking-wider mb-2 border-b border-slate-800/80 pb-2 flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Shield className="w-4 h-4 text-emerald-400" />
                    Secure API Integration Hub
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono font-bold capitalize">Read-Only Enclosed Gate</span>
                </h3>

                <form onSubmit={handleExchangeSync} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-xs uppercase font-mono tracking-wider font-semibold text-slate-400">Target Market Exchange</label>
                      <select
                        value={exchangeSelect}
                        onChange={(e) => setExchangeSelect(e.target.value)}
                        className="w-full bg-[#0B0E11] border border-slate-800/80 rounded-lg py-2 px-3 text-sm text-white focus:outline-none focus:border-emerald-500"
                      >
                        <option value="binance">Binance Client (REST / WSS)</option>
                        <option value="bybit">Bybit Financials (REST / WSS)</option>
                        <option value="okx">OKX Enterprise (REST / WSS)</option>
                        <option value="gate.io">Gate.io Global (REST / WSS)</option>
                        <option value="kucoin">KuCoin Global Desk (REST / WSS)</option>
                        <option value="coinbase">Coinbase Wallet Cloud</option>
                        <option value="weexio">weexio Exchange Platform</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs uppercase font-mono tracking-wider font-semibold text-slate-400 block pb-1">Dual-Endpoint Verification</label>
                      <div className="flex items-center justify-between bg-[#0B0E11] border border-slate-800/80 rounded-lg py-2 px-3 h-[40px]">
                        <span className="text-xs font-mono text-slate-400">
                          {simulateMismatch ? "⚠️ Match Discrepancy (Fallback ON)" : "✅ Synchronized Ledger Matching"}
                        </span>
                        <input
                          type="checkbox"
                          checked={simulateMismatch}
                          onChange={(e) => setSimulateMismatch(e.target.checked)}
                          className="w-4 h-4 accent-emerald-500 cursor-pointer"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-xs uppercase font-mono tracking-wider font-semibold text-slate-400">API Key Client</label>
                      <input
                        id="api_key_input"
                        type="text"
                        value={exchangeApiKey}
                        onChange={(e) => setExchangeApiKey(e.target.value)}
                        placeholder="Enter API Key (e.g. binance_live_key)"
                        className="w-full bg-[#0B0E11] border border-slate-800/80 rounded-lg py-2.5 px-3 text-xs text-white focus:outline-none font-mono focus:border-emerald-500"
                        required
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs uppercase font-mono tracking-wider font-semibold text-slate-400">API Secret Token</label>
                      <input
                        id="api_secret_input"
                        type="password"
                        value={exchangeApiSecret}
                        onChange={(e) => setExchangeApiSecret(e.target.value)}
                        placeholder="••••••••••••••••••••"
                        className="w-full bg-[#0B0E11] border border-slate-800/80 rounded-lg py-2.5 px-3 text-xs text-white focus:outline-none font-mono focus:border-emerald-500"
                        required
                      />
                    </div>
                  </div>

                  {syncStatus && (
                    <div className="p-3 bg-emerald-950/25 border border-emerald-500/30 text-xs text-emerald-300 rounded-lg flex items-center gap-2 font-mono animate-fadeIn">
                      <Check className="w-4 h-4 shrink-0 text-emerald-400" /> {syncStatus}
                    </div>
                  )}

                  <button
                    id="submit_exchange_keys_btn"
                    type="submit"
                    disabled={exchangeSyncLoading}
                    className="w-full py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold active:scale-[0.98] transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    {exchangeSyncLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    Synchronize Balance & Keys
                  </button>
                </form>

                {/* Sub‑ledger Fund Transfer Form Panel */}
                <div className="border-t border-slate-800/80 pt-5 mt-5">
                  <h4 className="text-xs uppercase font-mono tracking-wider font-extrabold text-slate-300 mb-2.5 flex items-center gap-2">
                    <ArrowLeftRight className="w-4 h-4 text-emerald-400" />
                    Sub-Ledger Portfolio Fund Transfer Tool
                  </h4>
                  <p className="text-[11px] text-slate-400 mb-3.5 leading-relaxed">
                    Transfer collateral instantly between the Spot Account Asset Ledger and Futures Margin Vault. Uses Binance SAPI endpoints in Real mode.
                  </p>

                  <form onSubmit={handleFundTransfer} className="space-y-4 bg-[#0B0E11]/45 p-4 rounded-xl border border-slate-800/80">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {/* Asset Select */}
                      <div className="space-y-1">
                        <label className="text-[10px] uppercase font-mono tracking-wider font-semibold text-slate-400 block">Transfer Asset</label>
                        <select
                          value={transferAsset}
                          onChange={(e) => setTransferAsset(e.target.value)}
                          className="w-full bg-[#0b0e11] border border-[#1e2329] focus:border-slate-700 rounded-lg py-2 px-3 text-xs text-white focus:outline-none"
                        >
                          <option value="USDT">USDT (Tether USD)</option>
                          <option value="BTC">BTC (Bitcoin)</option>
                          <option value="ETH">ETH (Ethereum)</option>
                          <option value="SOL">SOL (Solana)</option>
                        </select>
                      </div>

                      {/* Direction Selection */}
                      <div className="space-y-1">
                        <label className="text-[10px] uppercase font-mono tracking-wider font-semibold text-slate-400 block">Direction Route</label>
                        <select
                          value={transferDirection}
                          onChange={(e) => setTransferDirection(e.target.value as any)}
                          className="w-full bg-[#0b0e11] border border-[#1e2329] focus:border-slate-700 rounded-lg py-2 px-3 text-xs text-white focus:outline-none"
                        >
                          <option value="spot_to_futures">Spot Wallet ➡️ Futures Vault</option>
                          <option value="futures_to_spot">Futures Vault ➡️ Spot Wallet</option>
                        </select>
                      </div>

                      {/* Amount Input */}
                      <div className="space-y-1">
                        <label className="text-[10px] uppercase font-mono tracking-wider font-semibold text-slate-400 block">Amount to Transfer</label>
                        <input
                          type="number"
                          step="any"
                          value={transferAmount}
                          onChange={(e) => setTransferAmount(e.target.value)}
                          placeholder="e.g. 1000"
                          className="w-full bg-[#0b0e11] border border-[#1e2329] focus:border-[#0ecb81] rounded-lg py-2 px-3 text-xs text-white font-mono focus:outline-none"
                          required
                        />
                      </div>
                    </div>

                    {transferStatusMsg && (
                      <div className={`p-3 text-xs rounded-lg font-mono animate-fadeIn ${
                        transferStatusMsg.startsWith("✅") 
                          ? "bg-emerald-950/20 border border-emerald-500/25 text-emerald-300" 
                          : "bg-red-950/20 border border-red-500/25 text-red-300"
                      }`}>
                        {transferStatusMsg}
                      </div>
                    )}

                    <button
                      id="execute_transfer_btn"
                      type="submit"
                      disabled={transferLoading}
                      className="w-full py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold active:scale-[0.98] transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      {transferLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <ArrowLeftRight className="w-3.5 h-3.5" />}
                      Execute Instant Transfer
                    </button>
                  </form>
                </div>

                {/* Audit Logs Rendering */}
                {walletLogs.length > 0 && (
                  <div className="p-4 bg-[#0B0E11] rounded-xl border border-slate-800 text-[11px] font-mono space-y-2 animate-fadeIn max-h-[180px] overflow-y-auto">
                    <div className="flex justify-between items-center pb-1 border-b border-slate-800">
                      <span className="text-slate-400 uppercase text-[9px] font-bold tracking-wider block">Dual-Endpoint Cross-Check Logs</span>
                      <div className="flex gap-2 text-[8px]">
                        <span className="bg-emerald-500/10 text-emerald-400 px-1 rounded border border-emerald-500/20 font-mono">REST: CONNECTED</span>
                        <span className="bg-blue-500/10 text-blue-400 px-1 rounded border border-blue-500/20 font-mono">WSS: STREAMING</span>
                      </div>
                    </div>
                    {walletLogs.map((logLine, idx) => (
                      <div key={idx} className={logLine.includes("⚠️") ? "text-amber-400" : logLine.includes("✅") ? "text-[#0ecb81]" : "text-slate-400"}>
                        {logLine}
                      </div>
                    ))}
                  </div>
                )}

                {/* Active Connected Exchanges List */}
                {currentUser.apiKeys && Object.keys(currentUser.apiKeys).length > 0 && (
                  <div className="border-t border-slate-800/80 pt-4 mt-4 space-y-2.5">
                    <h4 className="text-xs uppercase font-mono tracking-wider font-extrabold text-slate-300">
                      Active API Key Connections
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {Object.keys(currentUser.apiKeys).map((exchangeKey) => {
                        const credentials = currentUser.apiKeys[exchangeKey];
                        // Mask the key
                        const maskedKey = credentials?.apiKey
                          ? `${credentials.apiKey.slice(0, 6)}...${credentials.apiKey.slice(-4)}`
                          : "••••••••••••";
                        return (
                          <div key={exchangeKey} className="flex justify-between items-center p-2.5 bg-[#0b0e11]/80 rounded-lg border border-slate-800 font-mono text-xs">
                            <div>
                              <span className="text-white font-extrabold uppercase text-[10px] block leading-tight">{exchangeKey}</span>
                              <span className="text-[10px] text-slate-500 block leading-tight">{globalSettings?.hideApiKeys ? "••••••••••••" : maskedKey}</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleRemoveExchangeKeys(exchangeKey)}
                              className="px-2 py-1 bg-red-950/20 hover:bg-red-500 hover:text-white text-red-150 border border-red-500/20 rounded font-mono text-[9px] font-bold cursor-pointer transition uppercase"
                            >
                              Disconnect
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Global Gateway Settings & Preferences Dashboard */}
                <div className="border-t border-slate-800/80 pt-5 mt-5">
                  <h4 className="text-xs uppercase font-mono tracking-wider font-extrabold text-slate-200 mb-2.5 flex items-center justify-between">
                    <span className="flex items-center gap-2 font-sans font-black">
                       <Settings className="w-4 h-4 text-emerald-400" />
                       GLOBAL TRADING PREFERENCES DASHBOARD
                    </span>
                    {showAutoSaveTick ? (
                      <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded font-mono font-bold animate-pulse">
                         ⚡ Auto-Saved
                      </span>
                    ) : (
                      <span className="text-[9px] text-slate-500 font-mono font-bold">Auto-Saves Changes</span>
                    )}
                  </h4>
                  <p className="text-[11px] text-slate-400 mb-4 leading-relaxed font-sans">
                    Configure unified default parameters applied automatically when compiling signals and booting new DCA/Signal bots. Saved immediately to cloud.
                  </p>

                  <div className="bg-[#0B0E11]/45 p-4 rounded-xl border border-slate-800/80 space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Default Leverage */}
                      <div className="space-y-1">
                        <label className="text-[10px] uppercase font-mono tracking-wider font-semibold text-slate-400 block pb-0.5">Default leverage multiplier</label>
                        <select
                          value={globalSettings?.defaultLeverage || 10}
                          onChange={(e) => {
                            const newLeverage = parseInt(e.target.value);
                            handleAutoSaveSettings({ ...globalSettings, defaultLeverage: newLeverage });
                          }}
                          className="w-full bg-[#0b0e11] border border-slate-800 focus:border-slate-700 rounded-lg py-1.5 px-2.5 text-xs text-white focus:outline-none"
                        >
                          <option value="1">1x (No Leverage)</option>
                          <option value="3">3x (Low Risk)</option>
                          <option value="5">5x (Moderate)</option>
                          <option value="10">10x (Standard)</option>
                          <option value="20">20x (Agile Risk)</option>
                          <option value="50">50x (High Risk Futures)</option>
                        </select>
                      </div>

                      {/* Default Paper Trading Setting */}
                      <div className="space-y-1">
                        <label className="text-[10px] uppercase font-mono tracking-wider font-semibold text-slate-400 block pb-0.5">Default Sandbox Simulation</label>
                        <select
                          value={globalSettings?.defaultPaperTrading ? "true" : "false"}
                          onChange={(e) => {
                            const isPaper = e.target.value === "true";
                            handleAutoSaveSettings({ ...globalSettings, defaultPaperTrading: isPaper });
                          }}
                          className="w-full bg-[#0b0e11] border border-slate-800 focus:border-slate-700 rounded-lg py-1.5 px-2.5 text-xs text-white focus:outline-none"
                        >
                          <option value="true">Enable Paper Trading (Risk Free)</option>
                          <option value="false">Enable Production Mode (Direct keys)</option>
                        </select>
                      </div>

                      {/* Default Max Position Size */}
                      <div className="space-y-1">
                        <label className="text-[10px] uppercase font-mono tracking-wider font-semibold text-slate-400 block pb-0.5">Default Max Position Size (USDT)</label>
                        <input
                          type="number"
                          value={globalSettings?.maxPositionSizeLimit || 25000}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || 0;
                            handleAutoSaveSettings({ ...globalSettings, maxPositionSizeLimit: val });
                          }}
                          className="w-full bg-[#0b0e11] border border-slate-800 focus:border-[#0ecb81] rounded-lg py-1.5 px-2.5 text-xs text-white font-mono focus:outline-none"
                        />
                      </div>

                      {/* Price Tick Interval Rate */}
                      <div className="space-y-1">
                        <label className="text-[10px] uppercase font-mono tracking-wider font-semibold text-slate-400 block pb-0.5">Live Price Feed Updates</label>
                        <select
                          value={globalSettings?.priceTickRate || 3500}
                          onChange={(e) => {
                            const val = parseInt(e.target.value);
                            handleAutoSaveSettings({ ...globalSettings, priceTickRate: val });
                          }}
                          className="w-full bg-[#0b0e11] border border-slate-800 focus:border-slate-700 rounded-lg py-1.5 px-2.5 text-xs text-white focus:outline-none"
                        >
                          <option value="1500">Fast Feed (1.5 seconds / tick)</option>
                          <option value="3500">Normal Feed (3.5 seconds / tick)</option>
                          <option value="5000">Coarse Feed (5.0 seconds / tick)</option>
                          <option value="10000">Idle Feed (10.0 seconds / tick)</option>
                        </select>
                      </div>

                      {/* Cloud Sync Frequency Interval Rate */}
                      <div className="space-y-1">
                        <label className="text-[10px] uppercase font-mono tracking-wider font-semibold text-slate-400 block pb-0.5">Database Cloud Polling Sync</label>
                        <select
                          value={globalSettings?.dbSyncRate || 10000}
                          onChange={(e) => {
                            const val = parseInt(e.target.value);
                            handleAutoSaveSettings({ ...globalSettings, dbSyncRate: val });
                          }}
                          className="w-full bg-[#0b0e11] border border-slate-800 focus:border-slate-700 rounded-lg py-1.5 px-2.5 text-xs text-white focus:outline-none"
                        >
                          <option value="4000">Aggressive Sync (4 seconds)</option>
                          <option value="10000">Normal Sync (10 seconds - High Performance)</option>
                          <option value="20000">Balanced Sync (20 seconds - Recommended)</option>
                          <option value="45000">ECO Saver Mode (45 seconds - Lowest Latency)</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 text-[10px] font-mono leading-none text-slate-400">
                      {/* Notification Sound Toggle */}
                      <label className="flex items-center gap-2 p-2 bg-[#0b0e11] rounded border border-slate-800/60 cursor-pointer hover:border-slate-700 transition">
                        <input
                          type="checkbox"
                          checked={!!globalSettings?.soundAlertsEnabled}
                          onChange={(e) => {
                            handleAutoSaveSettings({ ...globalSettings, soundAlertsEnabled: e.target.checked });
                          }}
                          className="w-3.5 h-3.5 accent-emerald-500 cursor-pointer shrink-0"
                        />
                        <span>Sound Chimes</span>
                      </label>

                      {/* Auto-Refill low balance */}
                      <label className="flex items-center gap-2 p-2 bg-[#0b0e11] rounded border border-slate-800/60 cursor-pointer hover:border-slate-700 transition">
                        <input
                          type="checkbox"
                          checked={!!globalSettings?.autoRefillEnabled}
                          onChange={(e) => {
                            handleAutoSaveSettings({ ...globalSettings, autoRefillEnabled: e.target.checked });
                          }}
                          className="w-3.5 h-3.5 accent-emerald-500 cursor-pointer shrink-0"
                        />
                        <span>Auto-Refill Demo</span>
                      </label>

                      {/* Hide API Keys */}
                      <label className="flex items-center gap-2 p-2 bg-[#0b0e11] rounded border border-slate-800/60 cursor-pointer hover:border-slate-700 transition">
                        <input
                          type="checkbox"
                          checked={!!globalSettings?.hideApiKeys}
                          onChange={(e) => {
                            handleAutoSaveSettings({ ...globalSettings, hideApiKeys: e.target.checked });
                          }}
                          className="w-3.5 h-3.5 accent-emerald-500 cursor-pointer shrink-0"
                        />
                        <span>Hide API Keys</span>
                      </label>
                    </div>
                  </div>
                </div>
              </div>

              {/* Connected balances indicators and overview */}
              <div className="bg-[#1E2329] border border-slate-800/80 rounded-xl p-6 shadow-xl space-y-4">
                <div className="border-b border-slate-800/50 pb-2 flex items-center justify-between">
                  <h3 className="text-sm font-sans font-black text-white uppercase tracking-wider flex items-center gap-2">
                    <Wallet className="w-4.5 h-4.5 text-emerald-400" /> Active portfolios
                  </h3>
                  <span className="text-[10px] font-mono font-bold text-slate-500 uppercase">Dual-Ledgers</span>
                </div>

                {/* Spot vs Futures account toggle selection */}
                <div className="grid grid-cols-2 gap-1.5 p-1 bg-[#0b0e11] border border-slate-800 rounded-lg">
                  <button
                    id="toggle_spot_selector_btn"
                    onClick={() => {
                      setSelectedAccountType("spot");
                      triggerNotification("Viewing Spot Asset Ledgers", "info");
                    }}
                    className={`py-1.5 rounded text-[11px] font-bold font-mono transition cursor-pointer select-none ${
                      selectedAccountType === "spot"
                        ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/15"
                        : "text-slate-400 hover:text-white border border-transparent"
                    }`}
                  >
                    🪙 Spot Accounts
                  </button>
                  <button
                    id="toggle_futures_selector_btn"
                    onClick={() => {
                      setSelectedAccountType("futures");
                      triggerNotification("Viewing Futures Margin Ledgers", "info");
                    }}
                    className={`py-1.5 rounded text-[11px] font-bold font-mono transition cursor-pointer select-none ${
                      selectedAccountType === "futures"
                        ? "bg-orange-500/10 text-orange-400 border border-orange-500/15"
                        : "text-slate-400 hover:text-white border border-transparent"
                    }`}
                  >
                    ⚡ Futures Trading
                  </button>
                </div>

                <div className="space-y-4">
                  {["binance", "bybit", "okx", "gate.io", "kucoin"].map(exchange => {
                    const isConfigured = !!currentUser.apiKeys?.[exchange];
                    const assetBalances = activeBalances[exchange] || { USDT: 0, BTC: 0, ETH: 0, SOL: 0 };
                    
                    // Live conversion rates
                    const btcPrice = marketPrices["BTC/USDT"] || 67500.0;
                    const ethPrice = marketPrices["ETH/USDT"] || 3450.0;
                    const solPrice = marketPrices["SOL/USDT"] || 145.0;

                    const prices: Record<string, number> = {
                      USDT: 1.0,
                      BTC: btcPrice,
                      ETH: ethPrice,
                      SOL: solPrice
                    };

                    // Total USDT margin locked across all open positions for this specific exchange
                    const activeLockedUSDT = displayedPositions
                      .filter(p => p.status === "open" && (p.exchange || "binance") === exchange)
                      .reduce((sum, p) => sum + (p.marginLocked || p.totalInvested / (p.leverage || 1)), 0);

                    const unpnlExchange = displayedPositions
                      .filter(p => p.status === "open" && (p.exchange || "binance") === exchange)
                      .reduce((sum, p) => sum + (p.pnl || 0), 0);

                    // Map actual wallet assets
                    const assets = [
                      {
                        symbol: "USDT",
                        name: "Tether USD (Stable)",
                        current: assetBalances.USDT ?? 0,
                        remaining: Math.max(0, (assetBalances.USDT ?? 0) - activeLockedUSDT),
                        value: (assetBalances.USDT ?? 0) * prices.USDT
                      },
                      {
                        symbol: "BTC",
                        name: "Bitcoin Core Asset",
                        current: assetBalances.BTC ?? 0,
                        remaining: assetBalances.BTC ?? 0,
                        value: (assetBalances.BTC ?? 0) * prices.BTC
                      },
                      {
                        symbol: "ETH",
                        name: "Ethereum Smart Contracts",
                        current: assetBalances.ETH ?? 0,
                        remaining: assetBalances.ETH ?? 0,
                        value: (assetBalances.ETH ?? 0) * prices.ETH
                      },
                      {
                        symbol: "SOL",
                        name: "Solana Super Fast",
                        current: assetBalances.SOL ?? 0,
                        remaining: assetBalances.SOL ?? 0,
                        value: (assetBalances.SOL ?? 0) * prices.SOL
                      }
                    ];

                    const totalValuationUSDT = assets.reduce((sum, a) => sum + a.value, 0);

                    return (
                      <div key={exchange} className={`p-4 bg-[#0B0E11]/90 rounded-xl border font-sans select-none space-y-3 transition ${isConfigured ? "border-emerald-500/35 shadow-[0_0_12px_rgba(16,185,129,0.04)]" : "border-slate-800/85"}`}>
                        <div className="flex items-center justify-between pb-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-extrabold text-white uppercase text-xs tracking-wider font-mono">{exchange} Terminal</span>
                            {isConfigured ? (
                              <span className="bg-emerald-500/15 text-emerald-400 font-bold px-2 py-0.5 rounded text-[8px] tracking-wider font-mono border border-emerald-500/20">KEY ACTIVE</span>
                            ) : (
                              <span className="bg-[#1e2329]/60 text-slate-400 font-semibold px-2 py-0.5 rounded text-[8px] tracking-wider font-mono border border-slate-700/50">DEMO MODE</span>
                            )}
                          </div>
                          <span className={`h-2 text-xs font-mono font-bold flex items-center gap-1.5 ${isConfigured ? "text-emerald-450" : "text-slate-500"}`}>
                            <span className={`h-2.5 w-2.5 rounded-full ${isConfigured ? "bg-[#0ecb81]" : "bg-slate-700"}`} />
                          </span>
                        </div>

                        {/* Grand Total Net Worth Valuation Header */}
                        <div className="bg-[#181A20]/80 p-3 rounded-lg border border-slate-800 space-y-2">
                          <div className="flex justify-between items-center bg-[#0b0e11]/30 p-1.5 rounded">
                            <div>
                              <span className="text-[8px] text-slate-500 font-mono font-bold uppercase tracking-wider block">
                                TOTAL {selectedAccountType.toUpperCase()} BALANCE
                              </span>
                              <span className="text-xs font-black text-white font-mono">${totalValuationUSDT.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                            </div>
                            <div className="text-right">
                              <span className="text-[8px] text-slate-500 font-mono font-bold uppercase tracking-wider block">NET ASSET EQUITY</span>
                              <span className="font-mono text-xs font-black text-[#0ecb81]">${(totalValuationUSDT + unpnlExchange).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                            </div>
                          </div>

                          {/* SPOT vs FUTURES Explicit Separation */}
                          <div className="pt-2 border-t border-slate-800/80 grid grid-cols-2 gap-2 text-[10px] font-mono leading-none">
                            <div className="p-1.5 bg-[#0B0E11] rounded border border-slate-800/85">
                              <span className="text-slate-450 block text-[7px] uppercase font-bold tracking-wider mb-1">SPOT WALLET</span>
                              <span className="text-emerald-400 block font-bold truncate">USDT: ${(spotBalances[exchange]?.USDT ?? 0).toFixed(2)}</span>
                            </div>
                            <div className="p-1.5 bg-[#0B0E11] rounded border border-slate-800/85">
                              <span className="text-slate-450 block text-[7px] uppercase font-bold tracking-wider mb-1">FUTURES WALLET</span>
                              <span className="text-orange-450 text-orange-400 block font-bold truncate">USDT: ${(futuresBalances[exchange]?.USDT ?? 0).toFixed(2)}</span>
                            </div>
                          </div>
                        </div>

                        {/* Ledger Breakdown Grid */}
                        <div className="space-y-2 pt-1.5">
                          <div className="grid grid-cols-4 text-[9px] font-mono text-slate-500 uppercase font-bold tracking-wider select-none px-1 pb-1 border-b border-slate-800/40">
                            <span>S/CUR</span>
                            <span className="text-right">LEDGER FUNDS</span>
                            <span className="text-right">NET EQUITY</span>
                            <span className="text-right">SECURE CONTROL</span>
                          </div>

                          <div className="space-y-1.5 font-mono text-[11px]">
                            {assets.map(asset => {
                              const sharePercent = totalValuationUSDT > 0 ? (asset.value / totalValuationUSDT) * 100 : 0;
                              // Approximate live equity for this asset row including any open unrealized gains/losses
                              const assetEquity = asset.symbol === "USDT" ? asset.current + unpnlExchange : asset.value;

                              return (
                                <div key={asset.symbol} className="space-y-1">
                                  <div className="grid grid-cols-4 items-center">
                                    {/* Asset symbol */}
                                    <div>
                                      <span className="font-extrabold text-white block leading-tight">{asset.symbol}</span>
                                      <span className="text-[8px] text-slate-500 block leading-none truncate max-w-[40px] font-sans">{asset.name.split(" ")[0]}</span>
                                    </div>
                                    
                                    {/* Wallet Funds (Total Available) */}
                                    <span className="text-right text-white font-semibold">
                                      {asset.current.toLocaleString(undefined, { minimumFractionDigits: asset.symbol === "USDT" ? 2 : 4, maximumFractionDigits: asset.symbol === "USDT" ? 2 : 4 })}
                                    </span>

                                    {/* Net Equity */}
                                    <span className={`text-right font-bold ${asset.symbol === "USDT" ? "text-emerald-400" : "text-white"}`}>
                                      ${assetEquity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </span>

                                    {/* Withdrawal Button Enforcing Physical Lock */}
                                    <button
                                      onClick={() => handleBlockWithdrawal(exchange, asset.symbol, asset.current.toString())}
                                      className="px-1.5 py-0.5 rounded bg-red-650 hover:bg-red-650 bg-red-500/10 hover:bg-red-500 text-red-400 hover:text-white border border-red-500/20 text-[8px] font-mono cursor-pointer transition flex items-center justify-center font-bold ml-auto"
                                    >
                                      Withdraw
                                    </button>
                                  </div>

                                  {/* Small visual bar representing portfolio share percentage */}
                                  <div className="w-full h-1 bg-slate-900 rounded-full overflow-hidden">
                                    <div 
                                      style={{ width: `${sharePercent}%` }} 
                                      className={`h-full rounded-full ${
                                        asset.symbol === "USDT" ? "bg-emerald-500" :
                                        asset.symbol === "BTC" ? "bg-amber-500" :
                                        asset.symbol === "ETH" ? "bg-blue-500" : "bg-purple-500"
                                      }`}
                                    />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {!isConfigured && (
                          <div className="mt-2 text-[10px] text-slate-500 leading-normal border-t border-slate-800/50 pt-2 flex items-center gap-1 font-sans select-none">
                            <HelpCircle className="w-3.5 h-3.5 text-slate-500" />
                            Preloaded demo balances active. Sync API keys to link live balances.
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

            </div>
          </div>
        )}

        {/* -------------------------------------------------------------------------- */}
        {/* NAV ROUTING TABS: E. TRADE HISTORY TAB */}
        {/* -------------------------------------------------------------------------- */}
        {activeTab === "trade_history" && (
          <div className="space-y-6 animate-fadeIn">
            
            {/* Header section with Stats action */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2.5 font-sans">
                  <History className="text-emerald-400" /> Archival Trade History
                </h1>
                <p className="text-xs text-slate-400 mt-0.5">Comprehensive historic register of closed virtual and programmatic positions settled by your DCA & Signal bots.</p>
              </div>
              <button
                onClick={loadTradeHistory}
                disabled={loadingHistory}
                className="self-start md:self-auto px-4 py-2 border border-slate-700 hover:border-slate-500 bg-[#1E2329] hover:bg-slate-800 rounded-lg text-xs font-semibold text-slate-200 hover:text-white transition cursor-pointer flex items-center gap-2 disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingHistory ? 'animate-spin' : ''}`} />
                {loadingHistory ? "Querying..." : "Sync Archives"}
              </button>
            </div>

            {/* Quick Metrics Analytics Ribbon */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-[#1E2329] border border-slate-800/80 p-4 rounded-xl shadow-xl flex flex-col justify-between">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest font-mono">Total Terminated</span>
                <span className="text-2xl font-black text-white font-mono mt-2">{tradeMetrics.total} <span className="text-[10px] text-slate-500 font-sans font-normal">Trades</span></span>
              </div>
              
              <div className="bg-[#1E2329] border border-slate-800/80 p-4 rounded-xl shadow-xl flex flex-col justify-between">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest font-mono">Target Wins / Losses</span>
                <span className="text-2xl font-black text-white font-mono mt-2">
                  <span className="text-emerald-400">{tradeMetrics.wins}</span>
                  <span className="text-slate-600 mx-1.5">/</span>
                  <span className="text-red-400">{tradeMetrics.losses}</span>
                </span>
              </div>

              <div className="bg-[#1E2329] border border-slate-800/80 p-4 rounded-xl shadow-xl flex flex-col justify-between">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest font-mono">Simulated Win Rate</span>
                <span className="text-2xl font-black text-emerald-400 font-mono mt-2">
                  {tradeMetrics.winRate.toFixed(1)}%
                </span>
              </div>

              <div className="bg-[#1E2329] border border-slate-800/80 p-4 rounded-xl shadow-xl flex flex-col justify-between">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest font-mono font-mono">Cumulative Realized Net PnL</span>
                <span className={`text-2xl font-black font-mono mt-2 ${tradeMetrics.netPnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {tradeMetrics.netPnl >= 0 ? "+" : ""}${tradeMetrics.netPnl.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT
                </span>
              </div>
            </div>

            {/* Filter and Control Toolbar Panel */}
            <div className="bg-[#1E2329] border border-slate-800/80 rounded-xl p-5 shadow-xl flex flex-col xl:flex-row gap-4 items-center justify-between">
              
              <div className="flex flex-wrap items-center gap-3 w-full xl:w-auto">
                {/* Search input filter */}
                <div className="relative w-full sm:w-60">
                  <Search className="absolute left-3 top-3 w-4 h-4 text-slate-500" />
                  <input
                    type="text"
                    placeholder="Search by pair or bot name..."
                    value={historySearchQuery}
                    onChange={(e) => {
                      setHistorySearchQuery(e.target.value);
                      setHistoryPage(1); // Reset page on filter
                    }}
                    className="w-full bg-[#0B0E11] border border-slate-800 rounded-lg pl-9 pr-8 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/80 transition"
                  />
                  {historySearchQuery && (
                    <button
                      onClick={() => {
                        setHistorySearchQuery("");
                        setHistoryPage(1);
                      }}
                      className="absolute right-3 top-2.5 text-slate-400 hover:text-white text-xs font-bold"
                    >
                      ×
                    </button>
                  )}
                </div>

                {/* Filter Spot vs Futures */}
                <select
                  value={historyMarketType}
                  onChange={(e) => {
                    setHistoryMarketType(e.target.value as any);
                    setHistoryPage(1);
                  }}
                  className="bg-[#0B0E11] border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 shrink-0 cursor-pointer font-sans font-medium"
                >
                  <option value="all">🌐 All Accounts</option>
                  <option value="spot">💰 Spot Trades Only</option>
                  <option value="futures">⚡ Futures Account</option>
                </select>

                {/* Dynamic/Smart Pair Selector Filter */}
                <select
                  value={historyPairFilter}
                  onChange={(e) => {
                    setHistoryPairFilter(e.target.value);
                    setHistoryPage(1);
                  }}
                  className="bg-[#0B0E11] border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 shrink-0 cursor-pointer font-sans font-medium"
                >
                  <option value="all">🔍 All Symbol Pairs</option>
                  <option value="BTC/USDT">BTC/USDT (Bitcoin)</option>
                  <option value="ETH/USDT">ETH/USDT (Ethereum)</option>
                  <option value="SOL/USDT">SOL/USDT (Solana)</option>
                  <option value="BNB/USDT">BNB/USDT (Binance Coin)</option>
                </select>

                {/* Date range filter selector */}
                <select
                  value={historyDateRange}
                  onChange={(e) => {
                    setHistoryDateRange(e.target.value as any);
                    setHistoryPage(1);
                  }}
                  className="bg-[#0B0E11] border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 shrink-0 cursor-pointer font-sans font-medium"
                >
                  <option value="all">📅 All Time Records</option>
                  <option value="1d">📅 Past 24 Hours</option>
                  <option value="7d">📅 Past 7 Days</option>
                  <option value="30d">📅 Past 30 Days</option>
                </select>

                {/* Clear trade archival records button */}
                <button
                  type="button"
                  onClick={handleClearTradeHistory}
                  disabled={loadingHistory || closedPositions.length === 0}
                  className="px-3 py-2 bg-red-950/20 hover:bg-red-500 hover:text-white border border-red-500/25 rounded-lg text-xs font-mono font-bold uppercase transition cursor-pointer flex items-center gap-1.5 shrink-0 disabled:opacity-40"
                  title="Manually wipe all historic register records"
                >
                  <Trash2 className="w-3.5 h-3.5 text-red-500 font-bold shrink-0" /> Clear Archive History
                </button>

                {/* Secure Auto-Refresh Controller Selector */}
                <label className="inline-flex items-center gap-2 px-3 py-2 bg-[#0B0E11] hover:bg-slate-800 border border-slate-800 hover:border-slate-700 rounded-lg text-xs font-semibold text-slate-200 select-none cursor-pointer transition">
                  <input
                    type="checkbox"
                    checked={historyAutoRefresh}
                    onChange={(e) => {
                      const enabled = e.target.checked;
                      setHistoryAutoRefresh(enabled);
                      if (enabled) {
                        triggerNotification("Archival Auto-Refresh Enabled.", "info");
                      } else {
                        triggerNotification("Archival Auto-Refresh Disabled. Deals will only refresh on-demand.", "info");
                      }
                    }}
                    className="w-3.5 h-3.5 rounded border-slate-800 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-0 bg-[#0B0E11] cursor-pointer"
                  />
                  <span>🔄 Auto-Refresh</span>
                </label>

                {/* Export trade data dropdown action panel */}
                <div className="relative group inline-block">
                  <button
                    type="button"
                    className="px-3 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 font-semibold rounded-lg text-xs transition cursor-pointer flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Export Ledger</span>
                  </button>
                  <div className="invisible group-hover:visible hover:visible opacity-0 group-hover:opacity-100 transition-all duration-150 absolute left-0 bottom-full xl:bottom-auto xl:top-full mt-1 mb-1 xl:mb-0 w-40 bg-[#1e2329] border border-slate-800 rounded-lg shadow-2xl py-1 z-50 flex flex-col">
                    <button
                      type="button"
                      onClick={() => handleExportTradeHistory("csv")}
                      className="px-3.5 py-2 text-left text-xs font-sans text-slate-200 hover:bg-slate-800 hover:text-white transition flex items-center gap-2 border-b border-slate-800/50"
                    >
                      <span className="text-emerald-400 font-extrabold text-[10px] bg-emerald-500/10 px-1 py-0.5 rounded leading-none">CSV</span>
                      <span>Export to Excel/CSV</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleExportTradeHistory("json")}
                      className="px-3.5 py-2 text-left text-xs font-sans text-slate-200 hover:bg-slate-800 hover:text-white transition flex items-center gap-2"
                    >
                      <span className="text-blue-400 font-extrabold text-[10px] bg-blue-550/10 bg-blue-500/10 px-1 py-0.5 rounded leading-none">JSON</span>
                      <span>Raw Ledger JSON</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Rows limit selection & Pagination navigation elements */}
              <div className="flex items-center gap-5 w-full xl:w-auto justify-between xl:justify-end border-t xl:border-t-0 border-slate-800/60 pt-3 xl:pt-0">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-slate-500 uppercase font-mono tracking-wider">Per Page:</span>
                  <select
                    value={historyLimit}
                    onChange={(e) => {
                      setHistoryLimit(parseInt(e.target.value));
                      setHistoryPage(1);
                    }}
                    className="bg-[#0B0E11] border border-slate-800 rounded px-2.5 py-1 text-xs text-slate-200 focus:outline-none"
                  >
                    <option value={5}>5 Rows</option>
                    <option value={10}>10 Rows</option>
                    <option value={20}>20 Rows</option>
                    <option value={50}>50 Rows</option>
                    <option value={100}>100 Rows</option>
                  </select>
                </div>

                <div className="flex items-center gap-2 font-mono text-xs text-slate-400 shrink-0">
                  <span>Page {currentPage} of {totalPages}</span>
                  <div className="inline-flex gap-1">
                    <button
                      onClick={() => setHistoryPage(prev => Math.max(1, prev - 1))}
                      disabled={currentPage <= 1 || loadingHistory}
                      className="px-2.5 py-1 bg-[#0B0E11] border border-slate-800 rounded text-[10px] font-bold hover:bg-slate-800 disabled:opacity-40 shrink-0"
                    >
                      ◀ Prev
                    </button>
                    <button
                      onClick={() => setHistoryPage(prev => Math.min(totalPages, prev + 1))}
                      disabled={currentPage >= totalPages || loadingHistory}
                      className="px-2.5 py-1 bg-[#0B0E11] border border-slate-800 rounded text-[10px] font-bold hover:bg-slate-800 disabled:opacity-40 shrink-0"
                    >
                      Next ▶
                    </button>
                  </div>
                </div>
              </div>

            </div>

            {/* Archive Table Render segment */}
            <div className="bg-[#1E2329] border border-slate-800/80 rounded-xl overflow-hidden shadow-2xl">
              {loadingHistory ? (
                <div className="p-12 text-center text-slate-450 font-mono text-xs flex flex-col items-center justify-center gap-3">
                  <RefreshCw className="w-8 h-8 text-emerald-400 animate-spin" />
                  <span>Scanning secure databases...</span>
                </div>
              ) : paginatedClosedPositions.length === 0 ? (
                <div className="p-16 text-center text-slate-400">
                  <History className="w-10 h-10 mx-auto text-slate-600 mb-2.5" />
                  <span className="font-mono text-xs text-slate-500">No matching closed positions archived.</span>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse table-auto">
                    <thead>
                      <tr className="bg-[#181A20] border-b border-slate-800 text-[10px] uppercase font-mono tracking-wider text-slate-400">
                        <th className="py-3 px-4">
                          <button
                            onClick={() => {
                              if (historySortKey === "closedAt") {
                                setHistorySortOrder(prev => prev === "asc" ? "desc" : "asc");
                              } else {
                                setHistorySortKey("closedAt");
                                setHistorySortOrder("desc");
                              }
                            }}
                            className="hover:text-white flex items-center gap-1 cursor-pointer"
                          >
                            Timestamp {historySortKey === "closedAt" ? (historySortOrder === "asc" ? "▲" : "▼") : ""}
                          </button>
                        </th>
                        <th className="py-3 px-4">
                          <button
                            onClick={() => {
                              if (historySortKey === "pair") {
                                setHistorySortOrder(prev => prev === "asc" ? "desc" : "asc");
                              } else {
                                setHistorySortKey("pair");
                                setHistorySortOrder("asc");
                              }
                            }}
                            className="hover:text-white flex items-center gap-1 cursor-pointer"
                          >
                            Pair {historySortKey === "pair" ? (historySortOrder === "asc" ? "▲" : "▼") : ""}
                          </button>
                        </th>
                        <th className="py-3 px-4">Direction</th>
                        <th className="py-3 px-4 text-right">TP Target</th>
                        <th className="py-3 px-4 text-right">SL Target</th>
                        <th className="py-3 px-4 text-center">Close Reason</th>
                        <th className="py-3 px-4 text-right">
                          <button
                            onClick={() => {
                              if (historySortKey === "pnl") {
                                setHistorySortOrder(prev => prev === "asc" ? "desc" : "asc");
                              } else {
                                setHistorySortKey("pnl");
                                setHistorySortOrder("desc");
                              }
                            }}
                            className="hover:text-white flex items-center gap-1 cursor-pointer ml-auto"
                          >
                            Result / ROI {historySortKey === "pnl" ? (historySortOrder === "asc" ? "▲" : "▼") : ""}
                          </button>
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800 text-slate-200 font-mono text-xs">
                      {paginatedClosedPositions.map((pos) => {
                        const isWin = pos.pnl >= 0;
                        return (
                          <tr key={pos.id} className="hover:bg-slate-800/25 transition">
                            <td className="py-3 px-4 text-slate-400 text-[11px]" title={pos.closedAt}>
                              {pos.closedAt ? new Date(pos.closedAt).toLocaleString() : "Date Unavailable"}
                            </td>
                            <td className="py-3 px-4">
                              <span className="font-bold text-white block">{pos.pair}</span>
                              <span className="text-[10px] text-slate-500 font-sans block truncate max-w-[120px]" title={pos.botName}>
                                Bot: {pos.botName}
                              </span>
                            </td>
                            <td className="py-3 px-4">
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                pos.type === "long" ? "bg-emerald-950/80 text-emerald-400 border border-emerald-500/20" : "bg-red-950/80 text-red-400 border border-red-500/20"
                              } uppercase`}>
                                {pos.type}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-right text-slate-300">
                              {pos.tpTriggerPrice && pos.tpTriggerPrice > 0 ? (
                                <span>${pos.tpTriggerPrice.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</span>
                              ) : (
                                <span className="text-slate-600">Disabled</span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-right text-slate-300">
                              {pos.slTriggerPrice && pos.slTriggerPrice > 0 ? (
                                <span>${pos.slTriggerPrice.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</span>
                              ) : (
                                <span className="text-slate-600">Disabled</span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-center">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase font-sans tracking-wide ${
                                pos.closeReason === "tp" || pos.closeReason === "trailing_tp"
                                  ? "bg-emerald-950 text-emerald-400 border border-emerald-500/20"
                                  : pos.closeReason === "sl"
                                  ? "bg-red-950 text-red-400 border border-red-800/20"
                                  : "bg-slate-900 text-slate-400 border border-slate-700/20"
                              }`}>
                                {pos.closeReason || "Unrecorded"}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-right">
                              <div className="flex flex-col items-end">
                                <span className={`font-bold inline-flex items-center gap-1 ${isWin ? "text-emerald-400" : "text-red-400"}`}>
                                  {isWin ? <ArrowUpRight className="w-3.5 h-3.5 text-emerald-400" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                                  {isWin ? "+" : ""}${pos.pnl.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT
                                </span>
                                <span className={`text-[10px] font-bold ${isWin ? "text-emerald-500" : "text-red-500"}`}>
                                  {isWin ? "+" : ""}{pos.pnlPercent.toFixed(2)}%
                                </span>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Bottom footer total items info */}
              {!loadingHistory && paginatedClosedPositions.length > 0 && (
                <div className="bg-[#181A20] border-t border-slate-800/80 px-5 py-3 font-mono text-[10px] text-slate-500 flex flex-col sm:flex-row gap-3 justify-between items-center">
                  <span>SHOWING ENTRIES {(currentPage - 1) * historyLimit + 1} - {Math.min(currentPage * historyLimit, totalItems)} OF {totalItems} Archived Trades</span>
                  
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={currentPage <= 1}
                      onClick={() => setHistoryPage(prev => Math.max(1, prev - 1))}
                      className="px-2.5 py-1 rounded bg-[#1e2329] hover:bg-slate-800 border border-slate-700/80 text-slate-300 disabled:opacity-40 disabled:hover:bg-[#1e2329] transition cursor-pointer font-bold uppercase text-[9px]"
                    >
                      ◀ Prev
                    </button>
                    <span className="text-slate-400 px-1">Page {currentPage} of {totalPages}</span>
                    <button
                      type="button"
                      disabled={currentPage >= totalPages}
                      onClick={() => setHistoryPage(prev => Math.min(totalPages, prev + 1))}
                      className="px-2.5 py-1 rounded bg-[#1e2329] hover:bg-slate-800 border border-slate-700/80 text-slate-300 disabled:opacity-40 disabled:hover:bg-[#1e2329] transition cursor-pointer font-bold uppercase text-[9px]"
                    >
                      Next ▶
                    </button>
                  </div>

                  <span className="uppercase text-emerald-500/80 tracking-normal text-[9px] font-bold">Auto-Sync Engine Active</span>
                </div>
              )}
            </div>

          </div>
        )}

        {/* -------------------------------------------------------------------------- */}
        {/* NAV ROUTING TABS: F. DEALS TERMINAL TAB */}
        {/* -------------------------------------------------------------------------- */}
        {activeTab === "deals_terminal" && (
          <div className="space-y-6 animate-fadeIn">
            
            {/* Header segment */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <h1 className="text-2xl font-black text-white tracking-tight flex items-center justify-start gap-2.5 font-sans">
                  <Briefcase className="text-emerald-400 w-6 h-6" /> Deals Terminal
                </h1>
                <p className="text-xs text-slate-400 mt-0.5">Unified operations cockpit showing active contract placements, closed trade cycles, and comprehensive audit history.</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setClosedPositions([]);
                    loadTradeHistory();
                    triggerNotification("Deals cache successfully refreshed.", "success");
                  }}
                  className="px-3.5 py-2 border border-slate-700 bg-[#1E2329] hover:bg-slate-800 rounded-lg text-xs font-semibold text-slate-200 hover:text-white transition cursor-pointer flex items-center gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Sync Deals
                </button>
              </div>
            </div>

            {/* Quick Metrics Analytics Ribbon */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-[#1E2329] border border-slate-800/80 p-4 rounded-xl shadow-xl flex flex-col justify-between">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono">Open Deals</span>
                <span className="text-2xl font-black text-white font-mono mt-1.5 flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse inline-block"></span>
                  {positions.length} <span className="text-[10px] text-slate-500 font-sans font-normal">Active Positions</span>
                </span>
              </div>
              
              <div className="bg-[#1E2329] border border-slate-800/80 p-4 rounded-xl shadow-xl flex flex-col justify-between">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono">Realized Deals</span>
                <span className="text-2xl font-black text-slate-100 font-mono mt-1.5">
                  {closedPositions.length} <span className="text-[10px] text-slate-500 font-sans font-normal">Closed Cycles</span>
                </span>
              </div>

              <div className="bg-[#1E2329] border border-slate-800/80 p-4 rounded-xl shadow-xl flex flex-col justify-between">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono">Deals Win Rate</span>
                <span className="text-2xl font-black text-emerald-400 font-mono mt-1.5">
                  {tradeMetrics.winRate.toFixed(1)}%
                </span>
              </div>

              <div className="bg-[#1E2329] border border-slate-800/80 p-4 rounded-xl shadow-xl flex flex-col justify-between">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono font-mono">Combined PnL</span>
                <span className={`text-2xl font-black font-mono mt-1.5 ${tradeMetrics.netPnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {tradeMetrics.netPnl >= 0 ? "+" : ""}${tradeMetrics.netPnl.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            {/* Inner Selection Toggles */}
            <div className="border-b border-slate-800/80 flex items-center justify-between pb-3 flex-wrap gap-3">
              <div className="flex gap-2 bg-[#181A20] p-1 rounded-lg border border-slate-800/60 font-mono text-xs font-bold leading-none select-none">
                <button
                  onClick={() => setDealsSupTab("active")}
                  className={`px-4 py-1.5 rounded-md transition cursor-pointer flex items-center gap-2 ${dealsSupTab === "active" ? "bg-slate-800 text-emerald-400 font-semibold" : "text-slate-400 hover:text-white"}`}
                >
                  <TrendingUp className="w-3.5 h-3.5" />
                  Active Deals ({positions.length})
                </button>
                <button
                  onClick={() => setDealsSupTab("closed")}
                  className={`px-4 py-1.5 rounded-md transition cursor-pointer flex items-center gap-2 ${dealsSupTab === "closed" ? "bg-slate-800 text-emerald-400 font-semibold" : "text-slate-400 hover:text-white"}`}
                >
                  <History className="w-3.5 h-3.5" />
                  Realized Deals ({closedPositions.length})
                </button>
                <button
                  onClick={() => setDealsSupTab("logs")}
                  className={`px-4 py-1.5 rounded-md transition cursor-pointer flex items-center gap-2 ${dealsSupTab === "logs" ? "bg-slate-800 text-emerald-400 font-semibold" : "text-slate-400 hover:text-white"}`}
                >
                  <Terminal className="w-3.5 h-3.5" />
                  Deal Log Entries ({logs.length})
                </button>
              </div>

              {dealsSupTab === "closed" && (
                <div className="relative w-64">
                  <input
                    type="text"
                    placeholder="Search realized deals..."
                    value={dealsSearchQuery}
                    onChange={(e) => setDealsSearchQuery(e.target.value)}
                    className="w-full bg-[#181A20] border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-mono"
                  />
                  <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-slate-500" />
                </div>
              )}
            </div>

            {/* Content Switch Board */}
            {dealsSupTab === "active" && (
              <div className="bg-[#181A20] border border-slate-800/80 rounded-xl p-6 shadow-2xl space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <h3 className="text-sm font-black text-white uppercase tracking-wider font-sans">Open Positions Deck</h3>
                  <span className="text-[10px] font-mono text-slate-500">REAL-TIME PRICES LOADED</span>
                </div>

                {displayedPositions.length === 0 ? (
                  <div className="py-12 text-center rounded-lg border border-dashed border-slate-800 text-slate-500 space-y-3.5">
                    <p className="font-mono text-xs">No active deals running at this interval under Administrator Mode.</p>
                    <button
                      onClick={() => setActiveTab("create_bot")}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-slate-900 rounded font-bold text-xs uppercase tracking-wider transition hover:text-white cursor-pointer"
                    >
                      Start New Automation Bot
                    </button>
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-lg border border-slate-800 bg-[#0B0E11]/40">
                    <table className="w-full text-left border-collapse font-sans text-xs select-none">
                      <thead>
                        <tr className="bg-[#0B0E11]/90 border-b border-slate-800 uppercase text-slate-400 font-mono tracking-wider text-[10px]">
                          <th className="py-3 px-4">Bot Strategy</th>
                          <th className="py-3 px-4">Instrument</th>
                          <th className="py-3 px-4">Direction</th>
                          <th className="py-3 px-4 text-right">Entry Price</th>
                          <th className="py-3 px-4 text-right">Mark Price</th>
                          <th className="py-3 px-4 text-right">Target TP Price</th>
                          <th className="py-3 px-4 text-right">Target SL Price</th>
                          <th className="py-3 px-4 text-right">Position & Margin</th>
                          <th className="py-3 px-4 text-right">Profit / Loss</th>
                          <th className="py-3 px-4 text-center">Safety Fills</th>
                          <th className="py-3 px-4 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800 text-slate-100 font-mono">
                        {displayedPositions.map(p => {
                          const botRef = bots.find(b => b.id === p.botId);
                          const isLong = p.type === "long";
                          return (
                            <tr key={p.id} className="hover:bg-slate-900/40 transition">
                              <td className="py-3 px-4 font-bold font-sans text-white text-[13px]">{p.botName}</td>
                              <td className="py-3 px-4 uppercase text-slate-300 font-bold">{p.pair}</td>
                              <td className="py-3 px-4">
                                <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                                  isLong ? "bg-emerald-950 text-emerald-400 border border-emerald-500/25" : "bg-red-950 text-red-485 border border-red-500/25"
                                }`}>
                                  {p.type.toUpperCase()}
                                </span>
                              </td>
                              <td className="py-3 px-4 text-right text-slate-200">${p.entryPrice.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 4 })}</td>
                              <td className="py-3 px-4 text-right text-emerald-400 font-bold">${p.currentPrice.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 4 })}</td>
                              <td className="py-3 px-4 text-right text-emerald-400 font-bold">${p.tpTriggerPrice.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 4 })}</td>
                              <td className="py-3 px-4 text-right">
                                {p.slTriggerPrice > 0 ? (
                                  <span className="text-red-400 font-bold">${p.slTriggerPrice.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 4 })}</span>
                                ) : (
                                  <span className="text-slate-500 italic">No SL set</span>
                                )}
                              </td>
                              <td className="py-3 px-4 text-right">
                                <div className="flex flex-col items-end gap-0.5 leading-tight">
                                  <span className="text-white font-extrabold text-xs">
                                    ${(p.totalInvested || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT
                                  </span>
                                  <span className="text-[10px] text-slate-400">
                                    Margin: ${(p.marginLocked || ((p.totalInvested || 0) / (p.leverage || 1))).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT ({p.leverage || 1}x)
                                  </span>
                                </div>
                              </td>
                              <td className="py-3 px-4 text-right">
                                <div className="flex flex-col items-end leading-normal">
                                  <span className={`text-[13px] font-black ${p.pnlPercent >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                                    {p.pnlPercent >= 0 ? "+" : ""}{p.pnlPercent.toFixed(2)}%
                                  </span>
                                  <span className={`text-[10px] ${p.pnl >= 0 ? "text-emerald-400/80" : "text-red-400/80"}`}>
                                    {p.pnl >= 0 ? "+" : ""}${p.pnl.toFixed(2)}
                                  </span>
                                </div>
                              </td>
                              <td className="py-3 px-4 text-center">
                                {botRef?.type === "dca" ? (
                                  <span className="bg-[#0B0E11]/80 border border-slate-800 px-2.5 py-0.5 rounded text-slate-200">
                                    {p.safetyOrdersCount} / {botRef.maxSafetyOrders} Fills
                                  </span>
                                ) : (
                                  <span className="text-slate-500">N/A</span>
                                )}
                              </td>
                              <td className="py-3 px-4 text-right">
                                <button
                                  onClick={() => handleManualClosePosition(p)}
                                  className="px-2.5 py-1 text-[10px] bg-red-950/70 hover:bg-red-900 border border-red-500/50 text-red-100 hover:text-white rounded cursor-pointer font-bold transition duration-150 inline-flex items-center gap-1"
                                >
                                  <XCircle className="w-3.5 h-3.5" /> Close Deal
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {dealsSupTab === "closed" && (
              <div className="space-y-6">
                {/* Performance Summary Panel */}
                <div className="bg-[#181A20] border border-slate-800/80 rounded-xl p-6 shadow-2xl space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                    <div className="flex items-center gap-2">
                      <Activity className="text-emerald-400 w-4 h-4" />
                      <h3 className="text-sm font-black text-white uppercase tracking-wider font-sans">Performance Summary</h3>
                    </div>
                    <span className="text-[10px] font-mono text-slate-500">CUMULATIVE METRICS</span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Average Win Card */}
                    <div className="bg-[#1E2329]/50 border border-slate-800/80 p-4 rounded-xl flex items-center justify-between">
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono">Avg Win Size</span>
                        <div className="text-xl font-bold text-emerald-400 font-mono mt-1">
                          +${tradeMetrics.avgWinSize.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                        <p className="text-[10px] text-slate-500 mt-1 font-sans">Based on {tradeMetrics.wins} profitable trades</p>
                      </div>
                      <div className="h-10 w-10 rounded-lg bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
                        <ArrowUpRight className="text-emerald-400 w-5 h-5" />
                      </div>
                    </div>

                    {/* Average Loss Card */}
                    <div className="bg-[#1E2329]/50 border border-slate-800/80 p-4 rounded-xl flex items-center justify-between">
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono">Avg Loss Size</span>
                        <div className="text-xl font-bold text-red-400 font-mono mt-1">
                          -${tradeMetrics.avgLossSize.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                        <p className="text-[10px] text-slate-500 mt-1 font-sans">Based on {tradeMetrics.losses} negative trades</p>
                      </div>
                      <div className="h-10 w-10 rounded-lg bg-red-500/10 flex items-center justify-center border border-red-500/20">
                        <ArrowDownRight className="text-red-400 w-5 h-5" />
                      </div>
                    </div>

                    {/* Profit Factor Card */}
                    <div className="bg-[#1E2329]/50 border border-slate-800/80 p-4 rounded-xl flex items-center justify-between">
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono">Profit Factor</span>
                        <div className={`text-xl font-black font-mono mt-1 ${
                          tradeMetrics.profitFactor === "∞" || parseFloat(tradeMetrics.profitFactor as string) >= 1.5 
                            ? "text-emerald-400" 
                            : parseFloat(tradeMetrics.profitFactor as string) >= 1.0 
                            ? "text-slate-200" 
                            : "text-red-400"
                        }`}>
                          {tradeMetrics.profitFactor}
                        </div>
                        <p className="text-[10px] text-slate-500 mt-1 font-sans">Gross profit / Gross loss ratio</p>
                      </div>
                      <div className="h-10 w-10 rounded-lg bg-[#1E2329]/50 border border-slate-800 flex items-center justify-center">
                        <TrendingUp className="text-slate-400 w-5 h-5" />
                      </div>
                    </div>
                  </div>

                  {/* Profitability details */}
                  <div className="pt-2.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-[10px] text-slate-500 border-t border-slate-800/60 font-mono">
                    <div>
                      GROSS PROFIT: <span className="text-emerald-400 font-bold">${tradeMetrics.totalGrossProfit.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      <span className="mx-2 text-slate-700">|</span>
                      GROSS LOSS: <span className="text-red-400 font-bold">${tradeMetrics.totalGrossLoss.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                    <div>
                      STATUS: {tradeMetrics.total === 0 ? (
                        <span className="text-slate-400 uppercase font-black">No Trades Realized</span>
                      ) : parseFloat(tradeMetrics.profitFactor as string) >= 1.0 || tradeMetrics.profitFactor === "∞" ? (
                        <span className="text-emerald-400 uppercase font-black flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"></span>Net Profitable Engine</span>
                      ) : (
                        <span className="text-red-400 uppercase font-black flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-red-400"></span>Net Negative Engine</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Settle Cycles Registry */}
                <div className="bg-[#181A20] border border-slate-800/80 rounded-xl p-6 shadow-2xl space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                    <h3 className="text-sm font-black text-white uppercase tracking-wider font-sans">Settled Cycles Registry</h3>
                    <span className="text-[10px] font-mono text-slate-500">HISTORIC RECOVERY SECURED</span>
                  </div>

                {closedPositions.filter(p => p.botName.toLowerCase().includes(dealsSearchQuery.toLowerCase()) || p.pair.toLowerCase().includes(dealsSearchQuery.toLowerCase())).length === 0 ? (
                  <div className="py-12 text-center rounded-lg border border-dashed border-slate-800 text-slate-500">
                    <p className="font-mono text-xs">No settled cycles registered for your selection.</p>
                  </div>
                ) : (
                  <div className="max-h-[500px] overflow-y-auto relative rounded-lg border border-slate-800 bg-[#0B0E11]/40 scrollbar-thin">
                    <table className="w-full text-left border-collapse font-sans text-xs select-none">
                      <thead className="sticky top-0 z-10 shadow-sm border-b border-slate-800 bg-[#0B0E11]">
                        <tr className="uppercase text-slate-400 font-mono tracking-wider text-[10px]">
                          <th className="py-3 px-4 bg-[#0B0E11]">Timestamp</th>
                          <th className="py-3 px-4 bg-[#0B0E11]">Bot Strategy</th>
                          <th className="py-3 px-4 bg-[#0B0E11]">Pair</th>
                          <th className="py-3 px-4 bg-[#0B0E11]">Action</th>
                          <th className="py-3 px-4 bg-[#0B0E11] text-right">TP Target</th>
                          <th className="py-3 px-4 bg-[#0B0E11] text-right">SL Target</th>
                          <th className="py-3 px-4 bg-[#0B0E11]">Reason</th>
                          <th className="py-3 px-4 bg-[#0B0E11] text-right">Result</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800 text-slate-100 font-mono">
                        {closedPositions
                          .filter(p => p.botName.toLowerCase().includes(dealsSearchQuery.toLowerCase()) || p.pair.toLowerCase().includes(dealsSearchQuery.toLowerCase()))
                          .map((pos) => {
                            const isWin = pos.pnl > 0;
                            const settleTime = pos.closedAt ? new Date(pos.closedAt).toLocaleString() : "Unrecorded";
                            return (
                              <tr key={pos.id} className="hover:bg-slate-900/40 transition">
                                <td className="py-3 px-4 text-slate-500 text-[10px]">{settleTime}</td>
                                <td className="py-3 px-4 font-bold text-white font-sans text-[13px]">{pos.botName}</td>
                                <td className="py-3 px-4 uppercase text-slate-300 font-bold">{pos.pair}</td>
                                <td className="py-3 px-4">
                                  <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                                    pos.type === "long" ? "bg-emerald-950 text-emerald-400" : "bg-red-950 text-red-500 text-red-100"
                                  }`}>
                                    {pos.type.toUpperCase()}
                                  </span>
                                </td>
                                <td className="py-3 px-4 text-right text-emerald-400">
                                  {pos.tpTriggerPrice ? `$${pos.tpTriggerPrice.toLocaleString(undefined, { minimumFractionDigits: 1 })}` : "-"}
                                </td>
                                <td className="py-3 px-4 text-right text-red-400">
                                  {pos.slTriggerPrice ? `$${pos.slTriggerPrice.toLocaleString(undefined, { minimumFractionDigits: 1 })}` : "-"}
                                </td>
                                <td className="py-3 px-4">
                                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                    pos.closeReason === "tp" || pos.closeReason === "trailing_tp" ? "bg-emerald-555/10 text-emerald-400" :
                                    pos.closeReason === "sl" ? "bg-red-555/10 text-red-400" : "bg-slate-800 text-slate-400"
                                  }`}>
                                    {pos.closeReason === "trailing_tp" ? "TRAIL TP" : pos.closeReason?.toUpperCase() || "MANUAL"}
                                  </span>
                                </td>
                                <td className="py-3 px-4 text-right">
                                  <div className="flex flex-col items-end leading-normal">
                                    <span className={`text-[13px] font-black ${isWin ? "text-emerald-400" : "text-red-400"}`}>
                                      {isWin ? "+" : ""}{pos.pnlPercent.toFixed(2)}%
                                    </span>
                                    <span className={`text-[10px] ${isWin ? "text-emerald-400/80" : "text-red-400/80"}`}>
                                      {isWin ? "+" : ""}${pos.pnl.toFixed(2)}
                                    </span>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
              </div>
            )}

            {dealsSupTab === "logs" && (
              <div className="bg-[#181A20] border border-slate-800/80 rounded-xl p-6 shadow-2xl space-y-4">
                <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                  <h3 className="text-sm font-black text-white uppercase tracking-wider font-sans">Full Systems Audit-Trail</h3>
                  {logs.length > 0 && (
                    <button
                      onClick={handleClearLogs}
                      className="text-[10px] font-mono text-red-400 hover:text-red-300 transition cursor-pointer"
                    >
                      Clear Log Trace
                    </button>
                  )}
                </div>

                {logs.length === 0 ? (
                  <div className="py-12 text-center rounded-lg border border-dashed border-slate-800 text-slate-500 font-mono text-xs">
                    No log events captured at this cycle.
                  </div>
                ) : (
                  <div className="space-y-2 h-[450px] overflow-y-auto pr-1">
                    {logs.map(l => {
                      const logTypeColor = 
                        l.type === "success" ? "text-emerald-400" :
                        l.type === "error" ? "text-red-400" :
                        l.type === "trade" ? "text-cyan-400 font-bold" : "text-amber-400";
                      return (
                        <div key={l.id} className="p-3 bg-[#0B0E11]/90 rounded-lg border border-slate-800 font-mono text-[11px] leading-relaxed flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 hover:border-slate-700/80 transition animate-fadeIn">
                          <div>
                            <span className={`font-bold mr-2 uppercase tracking-wide text-[10px] ${logTypeColor}`}>[{l.type}]</span>
                            <span className="text-slate-200">{l.message}</span>
                          </div>
                          <span className="text-slate-500 text-[10px] text-right shrink-0">{new Date(l.createdAt).toLocaleTimeString()}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

          </div>
        )}

        {/* -------------------------------------------------------------------------- */}
        {/* NAV ROUTING TABS: G. TRADINGVIEW WEBHOOKS TAB */}
        {/* -------------------------------------------------------------------------- */}
        {activeTab === "tradingview_webhooks" && (
          <div className="space-y-6 animate-fadeIn">
            
            {/* Header section */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <h1 className="text-2xl font-black text-white tracking-tight flex items-center justify-start gap-2.5 font-sans">
                    <Radio className="text-blue-400 w-6 h-6 animate-pulse" /> TradingView Webhook Control
                  </h1>
                  
                  {incomingSignals.length > 0 &&
                  (new Date().getTime() - new Date(incomingSignals[0].hookTime).getTime() < 15 * 60 * 1000) ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 shadow-[0_0_12px_rgba(16,185,129,0.15)] select-none">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                      WEBHOOK ACTIVE
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-bold bg-amber-500/10 text-amber-500 border border-amber-500/25 shadow-[0_0_12px_rgba(245,158,11,0.1)] select-none">
                      <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                      WEBHOOK NOT RECEIVING
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400 mt-1.5 font-sans">
                  Unified endpoint configuration, dynamic payload templates, and real-time incoming signal verification logs.
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  id="refresh_signals_btn"
                  onClick={() => {
                    loadWebhookHistory();
                    triggerNotification("Webhook logs synchronized successfully.", "success");
                  }}
                  className="px-3.5 py-2 border border-slate-700 bg-[#1E2329] hover:bg-slate-800 rounded-lg text-xs font-semibold text-slate-200 hover:text-white transition cursor-pointer flex items-center gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Reload Logs
                </button>
              </div>
            </div>

            {/* Config & URL setup details */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Left Column: API Configuration & TV Template Maker */}
              <div className="lg:col-span-2 space-y-6">
                
                {/* Endpoint & Instruction card */}
                <div className="bg-[#1E2329] border border-slate-800 p-6 rounded-xl shadow-xl space-y-4">
                  <h3 className="text-xs font-sans font-black text-white uppercase tracking-wider flex items-center gap-2 border-b border-slate-800 pb-2">
                    <Link className="w-4 h-4 text-emerald-400" />
                    TradingView Alert Configuration Setup
                  </h3>
                  
                  <div className="space-y-3.5">
                    <div>
                      <label className="text-[10px] font-mono text-slate-450 block mb-1">YOUR SECURE WEBHOOK URL</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          readOnly
                          value={computedWebhookUrl}
                          className="w-full bg-[#0B0E11] border border-slate-800 rounded-lg py-2 px-3 text-xs font-mono text-emerald-400 select-all focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => handleCopyText("wh_url_full", computedWebhookUrl)}
                          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1"
                        >
                          {copiedStates["wh_url_full"] ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                              Copied
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" />
                              Copy URL
                            </>
                          )}
                        </button>
                      </div>
                      <p className="text-[10px] text-slate-505 font-sans mt-1 p-0.5">
                        Paste this exact address into the <strong className="text-slate-300">"Webhook URL"</strong> checkbox within the TradingView Alert configuration panel under the <strong className="text-slate-300 font-sans">Notifications</strong> tab.
                      </p>
                    </div>

                    {/* VPS Custom Domain & Port Configurator */}
                    <div className="bg-[#181A20] rounded-lg p-4 border border-slate-800/80 space-y-3">
                      <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                        <h4 className="text-[11px] font-mono text-white tracking-wider flex items-center gap-1.5 uppercase font-bold">
                          <Globe className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                          VPS Port & IP Custom Override Tool
                        </h4>
                        <span className="text-[9px] font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded uppercase border border-amber-500/20">
                          Active State
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400 font-sans leading-relaxed">
                        Deploying onto a VPS? Define your custom IP address (or domain name) and target listener port here. Your copied configurations will adjust to match.
                      </p>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                        <div>
                          <label className="text-[9px] font-mono text-slate-450 block mb-1 uppercase font-bold">PROTOCOL</label>
                          <select
                            value={webhookProtocol}
                            onChange={(e) => setWebhookProtocol(e.target.value)}
                            className="w-full bg-[#0B0E11] border border-slate-800 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
                          >
                            <option value="http">http (Unsecured / Standard)</option>
                            <option value="https">https (SSL Secured)</option>
                          </select>
                        </div>

                        <div>
                          <label className="text-[9px] font-mono text-slate-450 block mb-1 uppercase font-bold">HOST / DOMAIN / IP</label>
                          <input
                            type="text"
                            placeholder="e.g. 192.168.1.50"
                            value={webhookHost}
                            onChange={(e) => setWebhookHost(e.target.value)}
                            className="w-full bg-[#0B0E11] border border-slate-800 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
                          />
                        </div>

                        <div>
                          <label className="text-[9px] font-mono text-slate-450 block mb-1 uppercase font-bold">PORT OVERRIDE</label>
                          <input
                            type="text"
                            placeholder="e.g. 80, 3000, 8080"
                            value={webhookPort}
                            onChange={(e) => setWebhookPort(e.target.value)}
                            className="w-full bg-[#0B0E11] border border-slate-800 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
                          />
                          <div className="flex gap-1 pt-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                setWebhookPort("80");
                                setWebhookProtocol("http");
                              }}
                              className={`flex-1 py-1 rounded text-[9px] font-mono font-bold transition border cursor-pointer ${
                                webhookPort === "80"
                                  ? "bg-emerald-500/20 border-emerald-500/30 text-emerald-400"
                                  : "bg-slate-900 border-slate-800 text-slate-400 hover:text-white"
                              }`}
                            >
                              Port 80 (VPS Default)
                            </button>
                            <button
                              type="button"
                              onClick={() => setWebhookPort("3000")}
                              className={`flex-1 py-1 rounded text-[9px] font-mono font-bold transition border cursor-pointer ${
                                webhookPort === "3000"
                                  ? "bg-blue-500/20 border-blue-500/30 text-blue-400"
                                  : "bg-slate-900 border-slate-800 text-slate-400 hover:text-white"
                              }`}
                            >
                              Port 3000
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 bg-[#0B0E11] rounded-lg p-2 border border-slate-800/60 font-mono text-[9px] text-slate-400">
                        <span>GENERATED ENDPOINT PREVIEW:</span>
                        <span className="text-amber-400 font-semibold select-all break-all">{computedWebhookUrl}</span>
                      </div>
                    </div>

                    <div className="p-3 bg-blue-500/10 border border-blue-500/25 rounded-lg flex flex-col gap-1 text-[11px] font-sans leading-relaxed text-blue-300">
                      <div className="flex items-center gap-1.5 font-bold uppercase font-mono text-[10px] text-blue-400">
                        <Radio className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                        Unified Webhook Setup (All bots share one webhook)
                      </div>
                      <p>
                        <strong>Single URL & Key:</strong> You only need to configure <strong>one single alert webhook</strong> in your TradingView system! All of your automated trading bots share your secure universal secret indicator key:
                      </p>
                      <div className="bg-[#0B0E11] px-2.5 py-1.5 rounded font-mono text-xs text-white break-all mt-1 select-all flex items-center justify-between">
                        <span>{globalWebhookSecret}</span>
                        <button
                          type="button"
                          onClick={() => handleCopyText("unified_wh_sec", globalWebhookSecret)}
                          className="text-blue-400 hover:text-blue-300 text-[9px] font-bold font-mono"
                        >
                          {copiedStates["unified_wh_sec"] ? "COPIED" : "COPY SECRET"}
                        </button>
                      </div>
                    </div>

                    <div className="p-3 bg-amber-500/10 border border-amber-500/25 rounded-lg flex flex-col gap-1 text-[11px] font-sans leading-relaxed text-amber-200">
                      <div className="flex items-center gap-1.5 font-bold uppercase font-mono text-[10px] text-amber-400 font-sans">
                        <Globe className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        VPS Port 80 Deployment Integration
                      </div>
                      <p>
                        <strong>VPS Production Mode:</strong> When deploying this server unit on a virtual private server, it is configured to dynamically listen directly on <strong className="text-white">Port 80</strong> by default in production. This enables seamless, clean webhook integration URL pointers that require no custom suffix strings (e.g. <code>http://your_vps_ip/api/webhook/signal</code>).
                      </p>
                      <p className="text-[10px] text-amber-300/80">
                        Make sure to allow port 80 traffic through your VPS firewall/security group, or override this port by setting the custom <code className="font-mono text-white text-[9px]">PORT</code> environment variable if necessary.
                      </p>
                    </div>

                    <div className="bg-[#181A20] rounded-lg p-4 border border-slate-800/80 space-y-3">
                      <h4 className="text-[11px] font-mono text-white tracking-wider flex items-center gap-1.5 uppercase">
                        <Shield className="w-3.5 h-3.5 text-blue-400" /> Webhook Alert Template Creator
                      </h4>
                      <p className="text-[11px] text-slate-400 font-sans">
                        Choose a target bot and direction parameters to generate the precise JSON message payload needed for automated TradingView trigger executions:
                      </p>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-2">
                        <div>
                          <label className="text-[9px] font-mono text-slate-500 block mb-1 font-bold">SELECT BOT CLIENT</label>
                          <select
                            value={testerBotId}
                            onChange={(e) => setTesterBotId(e.target.value)}
                            className="w-full bg-[#0B0E11] border border-slate-800 rounded-lg p-2 text-xs text-white uppercase font-mono focus:outline-none focus:border-emerald-500"
                          >
                            {displayedBots.length === 0 ? (
                              <option value="">Create a bot first</option>
                            ) : (
                              displayedBots.map(b => (
                                <option key={b.id} value={b.id}>
                                  {b.name} ({b.pair} • {b.type.toUpperCase()})
                                </option>
                              ))
                            )}
                          </select>
                        </div>

                        <div>
                          <label className="text-[9px] font-mono text-slate-500 block mb-1 font-bold">TRIGGER ACTION</label>
                          <div className="grid grid-cols-3 gap-1 p-1 bg-[#0B0E11] border border-slate-800 rounded-lg">
                            {(["buy", "sell", "safety"] as const).map(act => (
                              <button
                                key={act}
                                type="button"
                                onClick={() => setTesterAction(act)}
                                className={`py-1 text-center text-[9px] rounded font-mono font-bold uppercase cursor-pointer ${testerAction === act ? "bg-emerald-600 text-white" : "text-slate-400 hover:text-white"}`}
                              >
                                {act}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>

                      {(() => {
                        const activeBot = bots.find(b => b.id === testerBotId);
                        if (!activeBot) return null;
                        const templateJson = {
                          botId: activeBot.id,
                          botName: activeBot.name,
                          action: testerAction,
                          pair: activeBot.pair,
                          price: "{{close}}",
                          secret: globalWebhookSecret
                        };
                        const templateStr = JSON.stringify(templateJson, null, 2);

                        return (
                          <div className="pt-3 space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-[9px] font-mono text-slate-500 block font-bold">TRADINGVIEW ALERT MESSAGE TEXT (JSON)</span>
                              <button
                                type="button"
                                onClick={() => handleCopyText("tv_msg_tmplt", templateStr)}
                                className="text-[10px] text-emerald-450 hover:text-emerald-350 cursor-pointer flex items-center gap-1 font-mono font-bold"
                              >
                                {copiedStates["tv_msg_tmplt"] ? "Copied!" : "Copy Payload Code"}
                              </button>
                            </div>
                            <pre className="p-3 bg-[#0B0E11] rounded-lg border border-slate-850 font-mono text-[10px] text-emerald-400 overflow-x-auto select-all">
                              {templateStr}
                            </pre>
                            <p className="text-[10px] text-slate-500 leading-normal font-sans">
                              🎯 <strong className="text-slate-400 font-sans">Tip:</strong> The <code className="text-emerald-500 font-mono">"{{close}}"</code> placeholder is a TradingView variable that automatically replaces itself with the current standard close price of the trigger candle.
                            </p>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                </div>

                {/* Simulated Webhook Injector / Debug Test Block */}
                <div className="bg-[#1E2329] border border-slate-800 p-6 rounded-xl shadow-xl space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <h3 className="text-xs font-sans font-black text-white uppercase tracking-wider flex items-center gap-2">
                      <Sliders className="w-4 h-4 text-emerald-400" />
                      Diagnostic Test Suite (Simulate Signal)
                    </h3>
                    <span className="text-[10px] font-mono text-emerald-400 font-extrabold animate-pulse">ADMIN DIAGNOSTIC GATEWAY</span>
                  </div>

                  <p className="text-xs text-slate-400 font-sans leading-relaxed">
                    Send a test POST request directly from ApexTerminal frontend to verify that endpoints, bot states, and collateral trades actuate correctly:
                  </p>

                  <form onSubmit={handleTriggerWebhook} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-3.5">
                      <div>
                        <label className="text-[9px] font-mono text-slate-455 block mb-1">TARGET BOT INTEGRATION</label>
                        <select
                          value={testerBotId}
                          onChange={(e) => setTesterBotId(e.target.value)}
                          className="w-full bg-[#0B0E11] border border-slate-800 rounded-lg p-2.5 text-xs text-white uppercase font-mono"
                        >
                          {displayedBots.length === 0 ? (
                            <option value="">No Active Bots Registered</option>
                          ) : (
                            displayedBots.map(b => (
                              <option key={b.id} value={b.id}>
                                {b.name} ({b.pair} • {b.type.toUpperCase()})
                              </option>
                            ))
                          )}
                        </select>
                      </div>

                      <div>
                        <label className="text-[9px] font-mono text-slate-455 block mb-1">WEBHOOK SECURITY TOKEN</label>
                        <input
                          type="text"
                          value={bots.find(b => b.id === testerBotId)?.webhookSecret || globalWebhookSecret}
                          readOnly
                          className="w-full bg-[#0B0E11]/70 border border-slate-800/80 rounded-lg p-2.5 text-xs text-blue-450 font-mono select-all focus:outline-none text-blue-400"
                        />
                      </div>
                    </div>

                    <div className="space-y-3.5">
                      <div>
                        <label className="text-[9px] font-mono text-slate-455 block mb-1">TRIGGER EXECUTION PRICE (USDT)</label>
                        <input
                          type="number"
                          step="any"
                          value={testerBotId ? (marketPrices[bots.find(b => b.id === testerBotId)?.pair || "BTC/USDT"] || 1000) : 1000}
                          readOnly
                          className="w-full bg-[#0B0E11]/70 border border-slate-800/80 rounded-lg p-2.5 text-xs text-emerald-400 font-mono focus:outline-none"
                        />
                      </div>

                      <div className="pt-2">
                        <button
                          type="submit"
                          disabled={testerLoading || bots.length === 0}
                          className="w-full py-2.5 bg-[#0C1E14] hover:bg-emerald-950/70 text-emerald-400 hover:text-white border border-emerald-550/40 text-xs font-bold rounded-lg uppercase tracking-wider transition cursor-pointer"
                        >
                          {testerLoading ? "Broadcasting..." : "Dispatch Local test Payload"}
                        </button>
                      </div>
                    </div>
                  </form>

                  {testerResponse && (
                    <div className="bg-[#0B0E11] border border-slate-800 p-3.5 rounded-lg text-[10px] font-mono text-slate-400 space-y-1.5 overflow-x-auto relative">
                      <span className="text-emerald-400 font-black block text-[11px]">TRANSLATED GATEWAY SERVER RESPONSE:</span>
                      <div>GATEWAY STATUS: <span className="text-white font-black">{testerResponse.success ? "200 OK / VERIFIED" : "400 BAD REQUEST"}</span></div>
                      <pre className="mt-1 leading-normal text-slate-300">{JSON.stringify(testerResponse, null, 2)}</pre>
                    </div>
                  )}
                </div>

              </div>

              {/* Right Column: Setup requirements FAQ */}
              <div className="bg-[#1E2329] border border-slate-800 p-6 rounded-xl shadow-xl space-y-4 h-fit">
                <h3 className="text-xs font-sans font-black text-rose-455 uppercase tracking-wider flex items-center gap-2 border-b border-slate-800 pb-2">
                  <Settings className="w-4 h-4 text-emerald-405" />
                  TradingView setup checklist
                </h3>

                <ul className="space-y-4 text-xs text-slate-300 font-sans">
                  <li className="space-y-1.5">
                    <span className="bg-slate-800 text-slate-200 px-2 py-0.5 rounded text-[10px] font-mono font-bold">STEP 1</span>
                    <p className="leading-relaxed">
                      Build your trading script or indicator plot (such as MACD, Supertrend, or RSI Crossover) inside <strong className="text-white">TradingView Pine Editor</strong>.
                    </p>
                  </li>

                  <li className="space-y-1.5">
                    <span className="bg-slate-800 text-slate-200 px-2 py-0.5 rounded text-[10px] font-mono font-bold">STEP 2</span>
                    <p className="leading-relaxed">
                      Click <strong className="text-white font-bold">"Set Alert"</strong>. Under the <strong className="text-emerald-400 font-bold">Notifications</strong> tab, turn on the Webhook URL checkbox, and paste:
                    </p>
                    <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
                      <code className="flex-1 p-2 bg-[#0B0E11] rounded text-[10px] font-mono break-all border border-slate-800 text-amber-400">
                        {testerBotId ? (() => {
                          const b = bots.find(x => x.id === testerBotId);
                          if (!b) return computedWebhookUrl;
                          const protocolStr = webhookProtocol ? `${webhookProtocol}://` : "http://";
                          const portStr = webhookPort && webhookPort !== "80" && webhookPort !== "443" ? `:${webhookPort}` : "";
                          return b.webhookUrl || `${protocolStr}${webhookHost}${portStr}/webhook/${currentUser.uid}/${b.id}`;
                        })() : (() => {
                          const protocolStr = webhookProtocol ? `${webhookProtocol}://` : "http://";
                          const portStr = webhookPort && webhookPort !== "80" && webhookPort !== "443" ? `:${webhookPort}` : "";
                          return `${protocolStr}${webhookHost}${portStr}/webhook/${currentUser.uid}/[bot_id]`;
                        })()}
                      </code>
                      <button
                        type="button"
                        onClick={() => {
                          const val = testerBotId ? (() => {
                            const b = bots.find(x => x.id === testerBotId);
                            if (!b) return computedWebhookUrl;
                            const protocolStr = webhookProtocol ? `${webhookProtocol}://` : "http://";
                            const portStr = webhookPort && webhookPort !== "80" && webhookPort !== "443" ? `:${webhookPort}` : "";
                            return b.webhookUrl || `${protocolStr}${webhookHost}${portStr}/webhook/${currentUser.uid}/${b.id}`;
                          })() : (() => {
                            const protocolStr = webhookProtocol ? `${webhookProtocol}://` : "http://";
                            const portStr = webhookPort && webhookPort !== "80" && webhookPort !== "443" ? `:${webhookPort}` : "";
                            return `${protocolStr}${webhookHost}${portStr}/webhook/${currentUser.uid}/[bot_id]`;
                          })();
                          handleCopyText("computed_bot_wh_url", val);
                        }}
                        className="py-1.5 px-3 rounded bg-emerald-600 hover:bg-emerald-500 font-mono text-[9px] font-bold text-white uppercase transition shrink-0 cursor-pointer text-center"
                      >
                        {copiedStates["computed_bot_wh_url"] ? "Copied!" : "Copy Webhook URL"}
                      </button>
                    </div>
                  </li>

                  <li className="space-y-1.5">
                    <span className="bg-slate-800 text-slate-200 px-2 py-0.5 rounded text-[10px] font-mono font-bold">STEP 3</span>
                    <p className="leading-relaxed">
                      In the alert's <strong className="text-white">Message</strong> textarea field, paste the custom bot alert payload code. You can copy the code from the generator.
                    </p>
                  </li>

                  <li className="space-y-1.5">
                    <span className="bg-slate-800 text-slate-200 px-2 py-0.5 rounded text-[10px] font-mono font-bold">STEP 4</span>
                    <p className="leading-relaxed text-slate-400 text-[10px]">
                      When the indicator conditions trigger on TradingView, their servers will instantly forward the command payload to ApexTerminal to actuate positions instantly.
                    </p>
                  </li>
                </ul>
              </div>

            </div>

            {/* Bottom Segment: Dynamic logs list of actually arrived signals */}
            <div className="bg-[#181A20] border border-slate-800 rounded-xl p-6 shadow-2xl space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-800 pb-3">
                <div>
                  <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                    <Terminal className="text-blue-400 w-4.5 h-4.5" />
                    Incoming Webhook Signal Logs
                  </h3>
                  <p className="text-[10px] text-slate-500 font-sans mt-0.5">Real-time trace logs of all network triggers arriving from external server pings.</p>
                </div>
                
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={incomingSignals.length === 0 || isClearingSignals}
                    onClick={async () => {
                      setIsClearingSignals(true);
                      try {
                        const res = await fetch("/api/webhook/clear-log", { method: "POST" });
                        const data = await res.json();
                        if (data.success) {
                          setIncomingSignals([]);
                          triggerNotification("All signal history traces removed.", "success");
                        }
                      } catch (err) {
                        triggerNotification("Failed to connect to express API.", "error");
                      } finally {
                        setIsClearingSignals(false);
                      }
                    }}
                    className="px-3 py-1.5 bg-red-950 hover:bg-red-900 border border-red-550/40 text-[11px] font-mono font-bold text-red-100 rounded-lg cursor-pointer transition disabled:opacity-50"
                  >
                    {isClearingSignals ? "Clearing..." : "Flush Signal Log"}
                  </button>
                </div>
              </div>

              {incomingSignals.length === 0 ? (
                <div className="py-12 text-center rounded-lg border border-dashed border-slate-800 text-slate-500 font-mono text-xs space-y-2">
                  <div>No external signals received yet.</div>
                  <div className="text-[10px] text-slate-600 font-sans">TradingView or simulator alerts will appear here instantly when dispatched.</div>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-slate-800 bg-[#0B0E11]/40">
                  <table className="w-full text-left border-collapse font-sans text-xs select-none">
                    <thead>
                      <tr className="bg-[#0B0E11]/90 border-b border-slate-800 uppercase text-slate-400 font-mono tracking-wider text-[10px]">
                        <th className="py-3 px-4">Arrival Connection</th>
                        <th className="py-3 px-4">Targeting Bot</th>
                        <th className="py-3 px-4">Instrument / Action</th>
                        <th className="py-3 px-4 text-right">Received Price</th>
                        <th className="py-3 px-4">Secret Authentication</th>
                        <th className="py-3 px-4">IP Address / Client</th>
                        <th className="py-3 px-4">Status & Details</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800 text-slate-100 font-mono">
                      {incomingSignals.map((sig) => {
                        const isOk = sig.success;
                        const actionColor = 
                          sig.action === "buy" ? "text-emerald-400 font-bold" :
                          sig.action === "sell" ? "text-red-400 font-bold" : "text-amber-400 font-bold";
                        return (
                          <tr key={sig.id} className="hover:bg-slate-900/40 transition">
                            <td className="py-3 px-4 text-slate-500 text-[10px] leading-tight">
                              <div>{new Date(sig.hookTime).toLocaleDateString()}</div>
                              <div className="text-slate-600 block font-normal">{new Date(sig.hookTime).toLocaleTimeString()}</div>
                            </td>
                            <td className="py-3 px-4 text-slate-200">
                              <span className="font-sans font-black bg-slate-800/80 px-2 py-0.5 rounded text-white text-[11px] border border-slate-700/50">
                                {bots.find(b => b.id === sig.botId)?.name || sig.botId}
                              </span>
                            </td>
                            <td className="py-3 px-4">
                              <span className="text-slate-350 mr-1.5 font-sans font-bold">{sig.pair}</span>
                              <span className={`px-1.5 py-0.5 rounded text-[10px] ${actionColor}`}>
                                {sig.action.toUpperCase()}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-right text-slate-100 font-bold">
                              ${sig.price.toLocaleString(undefined, { minimumFractionDigits: 1 })}
                            </td>
                            <td className="py-3 px-4 text-slate-400 text-[11px]">
                              <code>{sig.secret}</code>
                            </td>
                            <td className="py-3 px-4 text-slate-500 text-[10px] max-w-[124px] truncate" title={sig.userAgent}>
                              <div>{sig.clientIp}</div>
                              <div className="text-slate-600 truncate">{sig.userAgent}</div>
                            </td>
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-1.5">
                                <span className={`h-2 w-2 rounded-full ${isOk ? "bg-emerald-400" : "bg-red-400"}`}></span>
                                <span className={isOk ? "text-emerald-350" : "text-red-350"}>
                                  {sig.message}
                                </span>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

          </div>
        )}

      </div>
    </div>
  );
}
