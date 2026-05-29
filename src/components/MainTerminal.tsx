import React, { useState, useEffect, useMemo } from "react";
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
  Edit, Copy, Search, Sliders, Globe, AlertTriangle, XCircle, History, Briefcase, TrendingUp, Radio
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
  const [apiPairsSource, setApiPairsSource] = useState<string>("Local Sandbox Feeds");
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

  // Copy indicators state & Webhook Payload Action toggles
  const [copiedStates, setCopiedStates] = useState<Record<string, boolean>>({});
  const [botPayloadActions, setBotPayloadActions] = useState<Record<string, "buy" | "sell" | "safety">>({});

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
    return localStorage.getItem("apex_webhook_host") || (window.location.hostname.includes("run.app") ? "your_vps_ip_here" : window.location.hostname);
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
    return `${protocolStr}${webhookHost}${portStr}/api/webhook/signal`;
  }, [webhookProtocol, webhookHost, webhookPort]);

  // Unified global Webhook secret for all created bots
  const globalWebhookSecret = useMemo(() => {
    return `wh_usr_${currentUser.uid.replace(/[^\w]/g, "").substring(0, 8)}_${currentUser.recoveryPhrase}`;
  }, [currentUser]);

  // Clipboard copies handler
  const handleCopyText = (key: string, value: string) => {
    navigator.clipboard.writeText(value);
    setCopiedStates(prev => ({ ...prev, [key]: true }));
    setTimeout(() => {
      setCopiedStates(prev => ({ ...prev, [key]: false }));
    }, 1500);
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

  // ----------------------------------------------------
  // LOAD USER BOT CONFIGURATIONS & POSITIONS
  // ----------------------------------------------------
  useEffect(() => {
    const loadData = async () => {
      try {
        const loadedBots = await dbService.getBots(currentUser.uid);
        const loadedPos = await dbService.getPositions(currentUser.uid);
        const loadedLogs = await dbService.getLogs(currentUser.uid);
        
        setBots(loadedBots);
        setPositions(loadedPos.filter(p => p.status === "open"));
        setClosedPositions(loadedPos.filter(p => p.status === "closed"));
        setLogs(loadedLogs);

        // Pre-select first bot in tester list
        if (loadedBots.length > 0) {
          setTesterBotId(loadedBots[0].id);
        }
      } catch (e) {
        console.error("Error fetching Firestore entries:", e);
      }
    };
    loadData();
  }, [currentUser]);

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

  useEffect(() => {
    if (activeTab === "trade_history") {
      loadTradeHistory();
    }
  }, [activeTab, currentUser]);

  const loadWebhookHistory = async () => {
    try {
      const res = await fetch("/api/webhook/signals-log");
      const data = await res.json();
      if (data.success) {
        setIncomingSignals(data.signals);
      }
    } catch (e) {
      console.warn("Unable to fetch webhook history from express:", e);
    }
  };

  useEffect(() => {
    if (activeTab === "tradingview_webhooks") {
      loadWebhookHistory();
      const intervalId = setInterval(loadWebhookHistory, 3000);
      return () => clearInterval(intervalId);
    }
  }, [activeTab]);

  // ----------------------------------------------------
  // REAL-TIME PRICE FEED SIMULATOR TICKER
  // ----------------------------------------------------
  useEffect(() => {
    const handleTick = async () => {
      // 1. Tick prices
      setMarketPrices(prev => {
        const nextPrices = getUpdatedPrices(prev);

        // Update historical tracking blocks
        setPriceHistories(prevHist => {
          const nextHist = { ...prevHist };
          for (const pair in nextPrices) {
            const arr = prevHist[pair] ? [...prevHist[pair]] : [];
            arr.push(nextPrices[pair]);
            if (arr.length > 40) arr.shift(); // keep size bounded
            nextHist[pair] = arr;
          }
          return nextHist;
        });

        // 2. Perform math checks against Take-Profit, Trailing levels and DCA safety orders
        tickPositions(
          currentUser.uid,
          positions,
          bots,
          nextPrices,
          balances,
          async (updatedPos) => {
            setPositions(updatedPos);
          },
          async (updatedBal) => {
            setBalances(updatedBal);
          }
        ).catch(e => console.error(e));

        return nextPrices;
      });
    };

    const interval = setInterval(handleTick, 3500); // Ticks every 3.5 seconds
    return () => clearInterval(interval);
  }, [positions, bots, balances, currentUser]);

  // Handle active position list for selected pair
  const activePositionForPair = useMemo(() => {
    return positions.find(p => p.pair === selectedPair && p.status === "open");
  }, [positions, selectedPair]);

  // Memoized search, sorting, and filtering of closed positions
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
  }, [closedPositions, historySearchQuery, historySortKey, historySortOrder]);

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
    const wins = closedPositions.filter(p => p.pnl > 0).length;
    const losses = total - wins;
    const winRate = total > 0 ? (wins / total) * 100 : 0;
    const netPnl = closedPositions.reduce((acc, p) => acc + p.pnl, 0);
    const avgRoi = total > 0 ? closedPositions.reduce((acc, p) => acc + p.pnlPercent, 0) / total : 0;

    return { total, wins, losses, winRate, netPnl, avgRoi };
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
    try {
      const resp = await fetch("/api/exchange/balance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          exchange: exchangeSelect,
          apiKey: exchangeApiKey,
          apiSecret: exchangeApiSecret,
        }),
      });
      const data = await resp.json();

      if (data.success) {
        // Hydrate simulated balance updates in Firestore profile
        const newBalances = { ...balances, [exchangeSelect]: data.balances };
        const newApiKeys = {
          ...(currentUser.apiKeys || {}),
          [exchangeSelect]: { apiKey: exchangeApiKey, apiSecret: exchangeApiSecret },
        };

        await dbService.updateUserProfile(currentUser.uid, {
          balances: newBalances,
          apiKeys: newApiKeys,
        });

        setBalances(newBalances);
        setCurrentUser(prev => ({ ...prev, balances: newBalances, apiKeys: newApiKeys }));

        triggerNotification(`Exchange API Keys synced for ${exchangeSelect.toUpperCase()}! Balances uploaded successfully.`, "success");
        setSyncStatus(`Sync Connection Verified! Balance: ${data.balances.USDT} USDT`);
        await dbService.addLog(
          currentUser.uid,
          `🗝️ Exchange Connection Verified: Fully synced ${exchangeSelect.toUpperCase()} trading keys. Virtual Balance: ${data.balances.USDT} USDT, ${data.balances.BTC} BTC`,
          "info"
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
  // BOT CREATION FLOW
  // ----------------------------------------------------
  const handleCreateBot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!botName.trim()) {
      triggerNotification("Please give your trading bot a unique name.", "error");
      return;
    }

    const exchangeId = "binance"; // Simulated default exchange
    const totalDcaCover = botBaseOrder + (botSafetyOrder * botMaxSafety);
    const availableUsdt = balances[exchangeId]?.USDT || 0;

    // Zero balance guard
    if (availableUsdt === 0) {
      triggerNotification(`Authentication Alert: Your simulated ${exchangeId.toUpperCase()} balance has 0 USDT. Sync a key or fund exchange in the Settings tab first.`, "error");
      return;
    }

    try {
      const newBot: Omit<TradingBot, "id"> = {
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
        webhookSecret: globalWebhookSecret,
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
      // Create Webhook POST query to Express Server Endpoint
      const hookPayload = {
        secret: globalWebhookSecret,
        action: testerAction, // 'buy' (open bot trigger), 'sell' (take profit close / manual exit)
        pair: bot.pair,
        botId: bot.id,
        price: marketPrices[bot.pair] || 100.0,
      };

      const res = await fetch("/api/webhook/signal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(hookPayload),
      });

      const data = await res.json();
      setTesterResponse(data);

      if (data.success) {
        triggerNotification(`Signal webhook accepted! Bot state synchronizing...`, "success");
        await dbService.addLog(
          currentUser.uid,
          `📡 [WEBHOOK ALERT RECEIVED]: Authentication Secret Verified. Command: ${testerAction.toUpperCase()} for ${bot.pair}. Injecting trade logic.`,
          "trade",
          bot.id,
          bot.name
        );

        // Process Signal trade open / close inside UI directly
        const exchangeId = "binance";
        const currentPrice = marketPrices[bot.pair] || 100.0;

        if (testerAction === "buy") {
          // Check if position already exists
          const existingPos = positions.find(p => p.botId === bot.id && p.status === "open");
          if (existingPos) {
            triggerNotification(`Ignored signal: Position for "${bot.name}" is already open.`, "info");
            await dbService.addLog(
              currentUser.uid,
              `⚠️ [SIGNAL IGNORED]: Webhook trigger declined for ${bot.pair} because bot already has an outstanding active position.`,
              "error",
              bot.id,
              bot.name
            );
          } else {
            // Check balance configuration before opening trade as requested
            const currentUsdt = balances[exchangeId]?.USDT || 0;
            const sizeNeeded = bot.baseOrderSize;

            if (currentUsdt < sizeNeeded) {
              await dbService.addLog(
                currentUser.uid,
                `❌ [TRADE REJECTED]: Balance check failed before trade execution. Available: ${currentUsdt.toFixed(2)} USDT, Required: ${sizeNeeded} USDT. Bot: ${bot.name}`,
                "error",
                bot.id,
                bot.name
              );
              triggerNotification(`Insufficient Balance on Exchange! Required: ${sizeNeeded} USDT.`, "error");
            } else {
              // Settle balances
              const nextBal = { ...balances };
              nextBal[exchangeId].USDT = parseFloat((currentUsdt - sizeNeeded).toFixed(2));
              setBalances(nextBal);
              await dbService.updateUserProfile(currentUser.uid, { balances: nextBal });

              // Create active trade details
              const calculatedQty = sizeNeeded / currentPrice;
              const profitTarget = bot.takeProfitPercent;
              const tpPrice = parseFloat((currentPrice * (1 + profitTarget / 100)).toFixed(4));
              
              let slPrice = 0;
              if (bot.stopLossPercent) {
                const slDistance = currentPrice * (bot.stopLossPercent / 100);
                slPrice = parseFloat((currentPrice - slDistance).toFixed(4));
              }

              const newPosition: Position = {
                id: "pos_" + Math.random().toString(36).substring(2, 9),
                userId: currentUser.uid,
                botId: bot.id,
                botName: bot.name,
                pair: bot.pair,
                type: "long",
                status: "open",
                entryPrice: currentPrice,
                currentPrice: currentPrice,
                amount: parseFloat(calculatedQty.toFixed(6)),
                totalInvested: sizeNeeded,
                safetyOrdersCount: 0,
                maxPriceSeen: currentPrice,
                trailingTpActive: false,
                tpTriggerPrice: tpPrice,
                slTriggerPrice: slPrice,
                pnl: 0,
                pnlPercent: 0,
                createdAt: new Date().toISOString(),
              };

              await dbService.savePosition(newPosition);
              setPositions(prev => [newPosition, ...prev]);

              await dbService.addLog(
                currentUser.uid,
                `🟢 [TRADE OPENED VIA WEBHOOK]: Signal Bot "${bot.name}" executed Long entry @ $${currentPrice}. Target TP: $${tpPrice}, Exit Limit (SL): $${slPrice}`,
                "trade",
                bot.id,
                bot.name
              );
            }
          }
        } else if (testerAction === "sell") {
          // Manual/Webhook forced close position
          const openPos = positions.find(p => p.botId === bot.id && p.status === "open");
          if (openPos) {
            openPos.status = "closed";
            openPos.closedAt = new Date().toISOString();
            openPos.closeReason = "webhook";

            const returnUsdt = openPos.totalInvested + openPos.pnl;
            const nextBal = { ...balances };
            if (!nextBal[exchangeId]) nextBal[exchangeId] = { USDT: 0 };
            nextBal[exchangeId].USDT = parseFloat((nextBal[exchangeId].USDT + returnUsdt).toFixed(2));
            setBalances(nextBal);
            await dbService.updateUserProfile(currentUser.uid, { balances: nextBal });

            await dbService.savePosition(openPos);
            setPositions(prev => prev.filter(p => p.id !== openPos.id));
            setClosedPositions(prev => [openPos, ...prev]);

            await dbService.addLog(
              currentUser.uid,
              `🛑 [TRADE TERMINATED]: Webhook direct command forced close for ${bot.pair} @ $${currentPrice}. Settled returns: $${returnUsdt.toFixed(2)} USDT`,
              "trade",
              bot.id,
              bot.name
            );
          } else {
            triggerNotification("Decline: No open position matches this bot ID.", "info");
          }
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
          <div className="p-4 mx-3 my-4 rounded-lg bg-slate-900/40 border border-slate-800/80 flex items-center gap-2.5">
            <User className="w-8 h-8 text-emerald-400 bg-slate-800 rounded-full p-1.5 shrink-0" />
            <div className="overflow-hidden">
              <span className="text-xs font-semibold text-white truncate block">{currentUser.email}</span>
              <span className="text-[10px] text-slate-500 font-mono uppercase block">{dbService.isUsingFirebase() ? "Cloud database" : "Sandbox local"}</span>
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
                <div className="flex items-center gap-3 bg-[#0B0E11] border border-slate-800 px-4 py-2 rounded-lg text-xs font-mono select-none">
                  <Wallet className="w-4 h-4 text-emerald-400 shrink-0" />
                  <div className="leading-tight">
                    <span className="text-slate-500 block text-[9px] font-sans uppercase tracking-wider">Simulated Main Margin Balance</span>
                    <span className="text-white font-heavy text-sm">${balances["binance"]?.USDT?.toLocaleString() || "0.00"} USDT</span>
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
                        {bots.length === 0 ? (
                          <option value="">No Active Bots Registered</option>
                        ) : (
                          // Only bots configured for the chosen selectedPair
                          bots.map(b => (
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
                      <span className={`px-2 py-0.5 font-mono text-[9px] font-bold rounded ${selectedLeverage > 50 ? "bg-red-500/10 text-red-400 border border-red-500/20" : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/10"}`}>
                        {selectedLeverage > 50 ? "HIGH LEVERAGE" : "SAFE RATIO"}
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
                        max="125"
                        step="1"
                        value={selectedLeverage}
                        onChange={(e) => setSelectedLeverage(parseInt(e.target.value))}
                        className="w-full accent-emerald-500 cursor-pointer h-1.5 bg-[#0B0E11] rounded-lg border-none"
                      />
                      <div className="flex justify-between text-[9px] font-mono text-slate-550 text-slate-500">
                        <span>1x</span>
                        <span>20x</span>
                        <span>50x</span>
                        <span>100x</span>
                        <span>125x Max</span>
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

              {positions.length === 0 ? (
                <div className="py-8 text-center text-slate-500 font-sans border-2 border-dashed border-slate-800/80 rounded-lg">
                  <Activity className="w-8 h-8 mx-auto mb-2 text-slate-600 animate-pulse" />
                  No open trades. Configure a bot and dispatch a Webhook Signal to trigger executions.
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
                        <th>Safety Order Count</th>
                        <th>PnL (USDT)</th>
                        <th>Live ROI %</th>
                        <th>Trigger Stops</th>
                        <th className="text-right">Manage Exit</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800 text-slate-100 font-mono">
                      {positions.map(p => {
                        const botRef = bots.find(b => b.id === p.botId);
                        return (
                          <tr key={p.id} className="hover:bg-slate-900/30 transition">
                            <td className="py-3 font-semibold font-sans text-white">{p.botName}</td>
                            <td>{p.pair}</td>
                            <td>${p.entryPrice.toLocaleString(undefined, { minimumFractionDigits: 1 })}</td>
                            <td>${p.currentPrice.toLocaleString(undefined, { minimumFractionDigits: 1 })}</td>
                            <td>
                              {botRef?.type === "dca" ? (
                                <span className="bg-[#0B0E11] border border-slate-800 px-2 py-0.5 rounded text-white font-mono">
                                  {p.safetyOrdersCount} / {botRef.maxSafetyOrders} fills
                                </span>
                              ) : (
                                <span className="text-slate-500">N/A (Signal Only)</span>
                              )}
                            </td>
                            <td className={p.pnl >= 0 ? "text-emerald-400" : "text-red-400"}>
                              ${p.pnl >= 0 ? "+" : ""}{p.pnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT
                            </td>
                            <td className={`font-black ${p.pnlPercent >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                              {p.pnlPercent >= 0 ? "+" : ""}{p.pnlPercent.toFixed(2)}%
                            </td>
                            <td>
                              <div className="flex flex-col gap-0.5 text-[9px] text-slate-400">
                                <span className="text-emerald-400/90 font-bold">
                                  {p.trailingTpActive ? "🔥 Trailing Margin" : `⭐ Target Profit TP @ $${p.tpTriggerPrice}`}
                                </span>
                                {botRef?.stopLossPercent && (
                                  <span className="text-red-400/90 font-bold">
                                    🛑 Stop Limit SL @ ${p.slTriggerPrice}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="text-right py-3">
                              <button
                                onClick={() => handleManualClosePosition(p)}
                                className="px-2.5 py-1 text-[10px] bg-red-950/70 hover:bg-red-900 border border-red-500/50 text-red-100 hover:text-white rounded cursor-pointer font-bold transition duration-150 inline-flex items-center gap-1.5"
                                title="Liquidate / Settle position immediately"
                              >
                                <XCircle className="w-3.5 h-3.5" /> Force Settle
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

              {/* Exit Configurations (Trailing Take Profit + Stop Loss) */}
              <div className="pt-4 border-t border-slate-800/60 space-y-4">
                <h3 className="text-xs uppercase font-mono font-bold tracking-widest text-[#0ecb81] text-emerald-400">Take-Profit (TP) & Stop-Loss (SL)</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Standard TP percentage */}
                  <div className="space-y-1">
                    <label className="text-xs uppercase font-mono tracking-wider font-semibold text-slate-400">Target Take Profit</label>
                    <div className="flex items-center gap-1">
                      <input
                        id="target_tp_input"
                        type="number"
                        step="any"
                        value={botTakeProfit}
                        onChange={(e) => setBotTakeProfit(Math.max(0.0001, parseFloat(e.target.value) || 0))}
                        className="w-full bg-[#0B0E11] border border-slate-800/80 rounded-lg py-2 px-3 text-sm text-white focus:outline-none focus:border-emerald-500"
                        min={0.0001}
                        required
                      />
                      <span className="text-xs font-mono text-slate-500">%</span>
                    </div>
                  </div>

                  {/* Customizable Trailing Take Profit */}
                  <div className="p-3 bg-[#0B0E11]/30 border border-slate-800/50 rounded-xl space-y-2 animate-fadeIn flex flex-col justify-center">
                    <div className="flex items-center gap-2.5 select-none">
                      <input
                        id="trail_tp_checkbox"
                        type="checkbox"
                        checked={botTrailingTpEnabled}
                        onChange={(e) => setBotTrailingTpEnabled(e.target.checked)}
                        className="w-4 h-4 rounded text-emerald-500 bg-[#0B0E11] border-slate-850 border-slate-800 focus:ring-0 active:scale-95 transition cursor-pointer"
                      />
                      <label htmlFor="trail_tp_checkbox" className="text-xs font-semibold text-white cursor-pointer uppercase font-mono tracking-wider">Enable Trailing Take Profit</label>
                    </div>

                    {botTrailingTpEnabled ? (
                      <div className="space-y-1 pl-6.5 transition animate-fadeIn">
                        <label className="text-[10px] uppercase font-mono tracking-wider font-semibold text-slate-400">Trailing TP Deviation (Offset)</label>
                        <div className="flex items-center gap-1">
                          <input
                            id="trailing_offset_input"
                            type="number"
                            step="any"
                            value={botTrailingProfit}
                            onChange={(e) => setBotTrailingProfit(Math.max(0.0001, parseFloat(e.target.value) || 0))}
                            className="w-full bg-[#0B0E11] border border-slate-800/80 rounded-lg py-1 px-2.5 text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
                            min={0.0001}
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
                    <label className="text-xs uppercase font-mono tracking-wider font-semibold text-slate-400">Stop Loss Limit</label>
                    <div className="flex items-center gap-1">
                      <input
                        id="stop_loss_input"
                        type="number"
                        step="any"
                        value={botStopLoss}
                        onChange={(e) => setBotStopLoss(Math.max(0, parseFloat(e.target.value) || 0))}
                        className="w-full bg-[#0B0E11] border border-slate-800/80 rounded-lg py-2 px-3 text-sm text-white focus:outline-none focus:border-emerald-500"
                        min={0}
                      />
                      <span className="text-xs font-mono text-slate-500">%</span>
                    </div>
                    <p className="text-[10px] text-slate-400 font-mono font-sans font-mono animate-fadeIn">Absolute price drop limit trigger. Set to 0 to disable.</p>
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

            {bots.length === 0 ? (
              <div className="bg-[#1E2329] border border-slate-800/80 rounded-xl p-8 text-center text-slate-550 text-slate-500 max-w-lg">
                <Settings className="w-12 h-12 mx-auto text-slate-700 mb-2" />
                No active auto-strategies configured. Select "New Trading Bot" above to configure a script.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {bots.map(bot => {
                  const whUrl = computedWebhookUrl;
                  const activeAct = botPayloadActions[bot.id] || "buy";
                  
                  // All bots use the single unified global Webhook Secret
                  const payloadJsonString = JSON.stringify({
                    secret: globalWebhookSecret,
                    action: activeAct,
                    pair: bot.pair,
                    botId: bot.id
                  }, null, 2);

                  return (
                    <div key={bot.id} className="bg-[#1E2329] border border-slate-800/80 rounded-xl p-5 shadow-lg relative overflow-hidden flex flex-col justify-between h-full hover:border-slate-700 transition">
                      
                      <div>
                        {/* Upper row info indicators */}
                        <div className="flex justify-between items-start gap-4">
                          <div>
                            <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                              {bot.type.toUpperCase()} AUTOMATION UNIT
                            </span>
                            <h3 className="text-base font-black text-white mt-1.5 tracking-wide block">{bot.name}</h3>
                            {bot.status === "active" && (
                              <div className="mt-2 text-[10px] font-mono font-bold text-[#38bdf8] bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded flex items-center gap-1 select-none animate-pulse w-fit">
                                <Radio className="w-3.5 h-3.5 text-[#38bdf8] shrink-0" />
                                <span>TRADINGVIEW WEBHOOK ACTIVE</span>
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
                          <div>Pair Symbol: <span className="text-white font-heavy text-xs">{bot.pair}</span></div>
                          <div>Base Order: <span className="text-white font-heavy text-xs">${bot.baseOrderSize} USDT</span></div>
                          {bot.type === "dca" && (
                            <>
                              <div>Safety Orders: <span className="text-white font-bold">${bot.safetyOrderSize} USDT</span></div>
                              <div>Deviation Gap: <span className="text-white font-bold">{bot.priceDeviation}%</span></div>
                            </>
                          )}
                          <div>Take Profit: <span className="text-emerald-400 font-bold">+{bot.takeProfitPercent}%</span></div>
                          <div>Trailing Offset: <span className="text-[#0ecb81] font-bold">{bot.trailingTpPercent}%</span></div>
                          {bot.stopLossPercent ? (
                            <div className="col-span-2 text-red-400">
                              🛑 Target Stop-Loss Limit: <span className="font-heavy">-{bot.stopLossPercent}%</span> {bot.trailingSlEnabled && <span className="text-slate-500 font-sans">(Trailing)</span>}
                            </div>
                          ) : (
                            <div className="col-span-2 text-slate-500">🛑 Stop-Loss Limit: Disabled (0.00%)</div>
                          )}
                        </div>

                        {/* Copyable Webhook Instruction Box */}
                        <div className="bg-[#0B0E11]/90 border border-slate-800/80 p-3.5 rounded-lg mt-4 font-mono text-[10px] space-y-3 shadow-lg">
                          <div className="flex justify-between items-center text-slate-400 border-b border-slate-800 pb-1.5 select-none font-sans">
                            <span className="flex items-center gap-1 font-mono text-[9px] uppercase font-bold tracking-wider text-slate-500">
                              <Code className="w-3.5 h-3.5 text-emerald-400" /> Webhook Alert Payload Linker
                            </span>
                            <span className="bg-emerald-500/10 text-emerald-400 font-bold px-1.5 py-0.2 rounded text-[8px] uppercase font-mono tracking-widest border border-emerald-500/20">POST</span>
                          </div>
                          
                          {/* Destination Webhook Copy group */}
                          <div className="space-y-1">
                            <div className="flex justify-between items-center">
                              <span className="text-slate-550 text-slate-500 uppercase text-[8px] font-bold select-none">DESTINATION ALERTS WEBHOOK URL</span>
                              <button
                                onClick={() => handleCopyText(bot.id + "_url", whUrl)}
                                className="text-emerald-400 hover:text-emerald-300 font-sans text-[9px] font-bold flex items-center gap-1 cursor-pointer"
                              >
                                {copiedStates[bot.id + "_url"] ? (
                                  <><Check className="w-2.5 h-2.5" /> Link Copied!</>
                                ) : (
                                  <><Copy className="w-2.5 h-2.5" /> Single Copy</>
                                )}
                              </button>
                            </div>
                            <span className="text-white block bg-[#181A20] p-1.5 rounded border border-slate-800 text-[10px] truncate leading-tight select-all">
                              {whUrl}
                            </span>
                          </div>

                          {/* Dynamic Signal tabs switch trigger */}
                          <div className="space-y-1">
                            <div className="flex justify-between items-center">
                              <span className="text-slate-550 text-slate-500 uppercase text-[8px] font-bold select-none">SECURE WEBHOOK SIGNAL PREVIEW</span>
                              <button
                                onClick={() => handleCopyText(bot.id + "_json", payloadJsonString)}
                                className="text-emerald-400 hover:text-emerald-300 font-sans text-[9px] font-bold flex items-center gap-1 cursor-pointer"
                              >
                                {copiedStates[bot.id + "_json"] ? (
                                  <><Check className="w-2.5 h-2.5" /> Webhook Copy Saved!</>
                                ) : (
                                  <><Copy className="w-2.5 h-2.5" /> Copy JSON Alert</>
                                )}
                              </button>
                            </div>

                            {/* Subtabs selector action triggers */}
                            <div className="flex bg-[#181A20] p-0.5 rounded border border-slate-800 text-[9px] font-sans font-semibold mb-1">
                              <button
                                type="button"
                                onClick={() => setBotPayloadActions(prev => ({ ...prev, [bot.id]: "buy" }))}
                                className={`flex-1 py-1 rounded cursor-pointer transition uppercase text-center ${activeAct === "buy" ? "bg-emerald-600/20 text-emerald-400 border border-emerald-500/10 font-bold" : "text-slate-450 hover:text-slate-200"}`}
                              >
                                Buy Long
                              </button>
                              <button
                                type="button"
                                onClick={() => setBotPayloadActions(prev => ({ ...prev, [bot.id]: "sell" }))}
                                className={`flex-1 py-1 rounded cursor-pointer transition uppercase text-center ${activeAct === "sell" ? "bg-red-600/20 text-red-400 border border-red-500/10 font-bold" : "text-slate-450 hover:text-slate-200"}`}
                              >
                                Sell Short
                              </button>
                              {bot.type === "dca" && (
                                <button
                                  type="button"
                                  onClick={() => setBotPayloadActions(prev => ({ ...prev, [bot.id]: "safety" }))}
                                  className={`flex-1 py-1 rounded cursor-pointer transition uppercase text-center ${activeAct === "safety" ? "bg-emerald-600/20 text-emerald-400 border border-emerald-500/10 font-bold" : "text-slate-450 hover:text-slate-200"}`}
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
                          className={`flex-1 min-w-[124px] py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer border transition ${bot.status === "active" ? "bg-[#0B0E11]/80 border-slate-800 hover:bg-slate-900/60 text-slate-350" : "bg-emerald-600 border-emerald-555 border-emerald-500 hover:bg-emerald-500 text-white"}`}
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
                          <Edit className="w-3.5 h-3.5 text-slate-400" /> Edit Configs
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
                      
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-350 block uppercase tracking-wider font-mono text-slate-500">Target Take Profit TP %</label>
                          <input
                            type="number"
                            step="any"
                            value={editBotTakeProfit}
                            onChange={(e) => setEditBotTakeProfit(Math.max(0.0001, parseFloat(e.target.value) || 0))}
                            className="w-full bg-[#0B0E11] border border-slate-800 rounded-lg p-2 text-xs text-white focus:outline-none"
                            min={0.0001}
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
                            <label htmlFor="edit_trail_tp_chk" className="text-[10px] font-bold text-white cursor-pointer uppercase font-mono tracking-wider">Enable Trailing TP</label>
                          </div>

                          {editBotTrailingTpEnabled ? (
                            <div className="space-y-1 pl-5.5 animate-fadeIn">
                              <label className="text-[9px] uppercase font-mono tracking-wider font-semibold text-slate-400 block">TP Deviation Offset %</label>
                              <div className="flex items-center gap-1">
                                <input
                                  type="number"
                                  step="any"
                                  value={editBotTrailingProfit}
                                  onChange={(e) => setEditBotTrailingProfit(Math.max(0.0001, parseFloat(e.target.value) || 0))}
                                  className="w-full bg-[#0B0E11] border border-slate-800 rounded-lg p-1 text-[11px] text-white focus:outline-none font-mono"
                                  min={0.0001}
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
                            onChange={(e) => setEditBotStopLoss(Math.max(0, parseFloat(e.target.value) || 0))}
                            className="w-full bg-[#0B0E11] border border-slate-800 rounded-lg p-2 text-xs text-white focus:outline-none"
                            min={0}
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
              <p className="text-xs text-slate-400 mt-0.5">Register high-fidelity API credentials for multiple digital exchange brokers to synchronize asset balances.</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Credentials registration Form */}
              <div className="lg:col-span-2 bg-[#1E2329] border border-slate-800/80 rounded-xl p-6 shadow-xl space-y-4">
                <h3 className="text-sm font-sans font-black text-white uppercase tracking-wider mb-2 border-b border-slate-800/80 pb-2 flex items-center gap-2">
                  <Shield className="w-4 h-4 text-emerald-400" />
                  Register Secure API Key
                </h3>

                <form onSubmit={handleExchangeSync} className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-xs uppercase font-mono tracking-wider font-semibold text-slate-400">Select Market Exchange Broker</label>
                    <select
                      value={exchangeSelect}
                      onChange={(e) => setExchangeSelect(e.target.value)}
                      className="w-full bg-[#0B0E11] border border-slate-800/80 rounded-lg py-2 px-3 text-sm text-white focus:outline-none focus:border-emerald-500"
                    >
                      <option value="binance">Binance Client SDK</option>
                      <option value="bybit">Bybit Financials API</option>
                      <option value="okx">OKX Enterprise API</option>
                      <option value="coinbase">Coinbase Wallet Cloud</option>
                      <option value="weexio">weexio Exchange Platform</option>
                      <option value="gate.io">gate.io Global Gateway</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs uppercase font-mono tracking-wider font-semibold text-slate-400">API Key</label>
                    <input
                      id="api_key_input"
                      type="text"
                      value={exchangeApiKey}
                      onChange={(e) => setExchangeApiKey(e.target.value)}
                      placeholder="Enter Exchange API Key Client (e.g. demo_binance)"
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

                  {syncStatus && (
                    <div className="p-3 bg-emerald-950/25 border border-emerald-500/30 text-xs text-emerald-300 rounded-lg flex items-center gap-2 font-mono animate-fadeIn">
                      <Check className="w-4 h-4 shrink-0" /> {syncStatus}
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
              </div>

              {/* Connected balances indicators and overview */}
              <div className="bg-[#1E2329] border border-slate-800/80 rounded-xl p-6 shadow-xl space-y-4">
                <h3 className="text-sm font-sans font-black text-white uppercase tracking-wider mb-2 flex items-center gap-2">
                  <Wallet className="w-4.5 h-4.5 text-emerald-400" /> Verified Portfolios
                </h3>

                <div className="space-y-4">
                  {["binance", "bybit", "okx", "coinbase", "weexio", "gate.io"].map(exchange => {
                    const isConfigured = !!currentUser.apiKeys?.[exchange];
                    const assetBalances = balances[exchange] || { USDT: 0, BTC: 0, ETH: 0, SOL: 0 };
                    
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

                    // Total USDT locked across all active positions
                    const activeLockedUSDT = positions
                      .filter(p => p.status === "open")
                      .reduce((sum, p) => sum + p.totalInvested, 0);

                    // Map actual wallet assets
                    const assets = [
                      {
                        symbol: "USDT",
                        name: "Tether (Collateral)",
                        current: assetBalances.USDT ?? 0,
                        remaining: Math.max(0, (assetBalances.USDT ?? 0) - activeLockedUSDT),
                        value: (assetBalances.USDT ?? 0) * prices.USDT
                      },
                      {
                        symbol: "BTC",
                        name: "Bitcoin Core",
                        current: assetBalances.BTC ?? 0,
                        remaining: assetBalances.BTC ?? 0,
                        value: (assetBalances.BTC ?? 0) * prices.BTC
                      },
                      {
                        symbol: "ETH",
                        name: "Ethereum Network",
                        current: assetBalances.ETH ?? 0,
                        remaining: assetBalances.ETH ?? 0,
                        value: (assetBalances.ETH ?? 0) * prices.ETH
                      },
                      {
                        symbol: "SOL",
                        name: "Solana Liquid",
                        current: assetBalances.SOL ?? 0,
                        remaining: assetBalances.SOL ?? 0,
                        value: (assetBalances.SOL ?? 0) * prices.SOL
                      }
                    ];

                    const totalValuationUSDT = assets.reduce((sum, a) => sum + a.value, 0);

                    return (
                      <div key={exchange} className={`p-4 bg-[#0B0E11]/90 rounded-xl border font-sans select-none space-y-3 transition ${isConfigured ? "border-emerald-500/30 ring-1 ring-emerald-500/5 bg-slate-900/10 animate-pulse" : "border-slate-800/85 bg-slate-950/20"}`}>
                        <div className="flex items-center justify-between pb-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-extrabold text-white uppercase text-xs tracking-wider font-mono">{exchange}</span>
                            {isConfigured ? (
                              <span className="bg-emerald-500/15 text-emerald-400 font-bold px-2 py-0.5 rounded text-[8px] tracking-wider font-mono border border-emerald-500/20">CONNECTED</span>
                            ) : (
                              <span className="bg-[#1e2329]/60 text-slate-400 font-semibold px-2 py-0.5 rounded text-[8px] tracking-wider font-mono border border-slate-700/50">DEMO ACTIVE</span>
                            )}
                          </div>
                          <span className={`h-2 text-xs font-mono font-bold flex items-center gap-1.5 ${isConfigured ? "text-emerald-450" : "text-slate-500"}`}>
                            <span className={`h-2 w-2 rounded-full ${isConfigured ? "bg-emerald-400 animate-pulse" : "bg-slate-700"}`}></span>
                          </span>
                        </div>

                        {/* Grand Total Net Worth Valuation Header */}
                        <div className="bg-[#181A20]/80 p-3 rounded-lg border border-slate-800 flex items-center justify-between">
                          <div>
                            <span className="text-[9px] text-slate-500 font-mono font-bold uppercase tracking-wider block">TOTAL PORTFOLIO ASSETS</span>
                            <span className="text-sm font-black text-white font-mono">${totalValuationUSDT.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="text-slate-500 text-[10px]">USDT</span></span>
                          </div>
                          {isConfigured && activeLockedUSDT > 0 && (
                            <div className="text-right">
                              <span className="text-[8px] text-orange-400 font-mono font-bold uppercase tracking-wider block">LOCK MARGIN</span>
                              <span className="text-xs font-mono font-semibold text-orange-400">-${activeLockedUSDT.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                            </div>
                          )}
                        </div>

                        {/* Ledger Breakdown Grid */}
                        <div className="space-y-2.5 pt-1.5">
                          <div className="grid grid-cols-4 text-[9px] font-mono text-slate-500 uppercase font-bold tracking-wider select-none px-1 pb-1 border-b border-slate-800/40">
                            <span>ASSET</span>
                            <span className="text-right">CURRENT</span>
                            <span className="text-right">REMAINING</span>
                            <span className="text-right">TOTAL VAL</span>
                          </div>

                          <div className="space-y-2 font-mono text-[11px]">
                            {assets.map(asset => {
                              const sharePercent = totalValuationUSDT > 0 ? (asset.value / totalValuationUSDT) * 100 : 0;
                              return (
                                <div key={asset.symbol} className="space-y-1">
                                  <div className="grid grid-cols-4 items-center">
                                    {/* Asset symbol */}
                                    <div>
                                      <span className="font-extrabold text-white block leading-tight">{asset.symbol}</span>
                                      <span className="text-[8px] text-slate-500 block leading-none truncate max-w-[50px] font-sans">{asset.name.split(" ")[0]}</span>
                                    </div>
                                    
                                    {/* Current balance */}
                                    <span className="text-right text-white font-semibold">
                                      {asset.current.toLocaleString(undefined, { minimumFractionDigits: asset.symbol === "USDT" ? 2 : 4, maximumFractionDigits: asset.symbol === "USDT" ? 2 : 4 })}
                                    </span>

                                    {/* Remaining balance */}
                                    <span className={`text-right font-bold ${asset.symbol === "USDT" && activeLockedUSDT > 0 ? "text-emerald-400 font-black animate-pulse" : "text-slate-300"}`}>
                                      {asset.remaining.toLocaleString(undefined, { minimumFractionDigits: asset.symbol === "USDT" ? 2 : 4, maximumFractionDigits: asset.symbol === "USDT" ? 2 : 4 })}
                                    </span>

                                    {/* Valuation in USDT */}
                                    <span className="text-right font-black text-white">
                                      ${asset.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </span>
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
                            Preloaded demo balances enabled. Register API keys to link live balances.
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
            <div className="bg-[#1E2329] border border-slate-800/80 rounded-xl p-5 shadow-xl flex flex-col md:flex-row gap-4 items-center justify-between">
              
              {/* Search input filter */}
              <div className="relative w-full md:w-80">
                <Search className="absolute left-3 top-3 w-4 h-4 text-slate-500" />
                <input
                  type="text"
                  placeholder="Filter key (e.g. BTC, DCA, tp)..."
                  value={historySearchQuery}
                  onChange={(e) => {
                    setHistorySearchQuery(e.target.value);
                    setHistoryPage(1); // Reset page on filter
                  }}
                  className="w-full bg-[#0B0E11] border border-slate-850 border-slate-800 rounded-lg pl-9 pr-8 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/80 transition"
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

              {/* Rows limit selection & Pagination navigation elements */}
              <div className="flex items-center gap-5 w-full md:w-auto justify-between md:justify-end">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-slate-500 uppercase font-mono tracking-wider">Per Page:</span>
                  <select
                    value={historyLimit}
                    onChange={(e) => {
                      setHistoryLimit(parseInt(e.target.value));
                      setHistoryPage(1);
                    }}
                    className="bg-[#0B0E11] border border-slate-850 border-slate-800 rounded px-2.5 py-1 text-xs text-slate-200 focus:outline-none"
                  >
                    <option value={5}>5 Rows</option>
                    <option value={10}>10 Rows</option>
                    <option value={20}>20 Rows</option>
                    <option value={50}>50 Rows</option>
                    <option value={100}>100 Rows</option>
                  </select>
                </div>

                <div className="flex items-center gap-2 font-mono text-xs text-slate-450 text-slate-450 text-slate-400">
                  <span>Page {currentPage} of {totalPages}</span>
                  <div className="inline-flex gap-1">
                    <button
                      onClick={() => setHistoryPage(prev => Math.max(1, prev - 1))}
                      disabled={currentPage <= 1 || loadingHistory}
                      className="px-2.5 py-1 bg-[#0B0E11] border border-slate-800 rounded text-[10px] font-bold hover:bg-slate-800 disabled:opacity-40"
                    >
                      ◀ Prev
                    </button>
                    <button
                      onClick={() => setHistoryPage(prev => Math.min(totalPages, prev + 1))}
                      disabled={currentPage >= totalPages || loadingHistory}
                      className="px-2.5 py-1 bg-[#0B0E11] border border-slate-800 rounded text-[10px] font-bold hover:bg-slate-800 disabled:opacity-40"
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
                  <History className="w-10 h-10 mx-auto text-slate-650 text-slate-600 mb-2.5" />
                  <span className="font-mono text-xs text-slate-500">No matching closed positions archived.</span>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse table-auto">
                    <thead>
                      <tr className="bg-[#181A20] border-b border-slate-850 border-slate-800 text-[10px] uppercase font-mono tracking-wider text-slate-450 text-slate-400">
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
                            Date Closed {historySortKey === "closedAt" ? (historySortOrder === "asc" ? "▲" : "▼") : ""}
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
                        <th className="py-3 px-4">Closed Reason</th>
                        <th className="py-3 px-4">
                          <button
                            onClick={() => {
                              if (historySortKey === "amount") {
                                setHistorySortOrder(prev => prev === "asc" ? "desc" : "asc");
                              } else {
                                setHistorySortKey("amount");
                                setHistorySortOrder("desc");
                              }
                            }}
                            className="hover:text-white flex items-center gap-1 cursor-pointer"
                          >
                            Filled Volume {historySortKey === "amount" ? (historySortOrder === "asc" ? "▲" : "▼") : ""}
                          </button>
                        </th>
                        <th className="py-3 px-4">
                          <button
                            onClick={() => {
                              if (historySortKey === "totalInvested") {
                                setHistorySortOrder(prev => prev === "asc" ? "desc" : "asc");
                              } else {
                                setHistorySortKey("totalInvested");
                                setHistorySortOrder("desc");
                              }
                            }}
                            className="hover:text-white flex items-center gap-1 cursor-pointer"
                          >
                            Cost Basis {historySortKey === "totalInvested" ? (historySortOrder === "asc" ? "▲" : "▼") : ""}
                          </button>
                        </th>
                        <th className="py-3 px-4 text-right">Settled Returns</th>
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
                            Realized profit {historySortKey === "pnl" ? (historySortOrder === "asc" ? "▲" : "▼") : ""}
                          </button>
                        </th>
                        <th className="py-3 px-4 text-right col-span-1">
                          <button
                            onClick={() => {
                              if (historySortKey === "pnlPercent") {
                                setHistorySortOrder(prev => prev === "asc" ? "desc" : "asc");
                              } else {
                                setHistorySortKey("pnlPercent");
                                setHistorySortOrder("desc");
                              }
                            }}
                            className="hover:text-white flex items-center gap-1 cursor-pointer ml-auto"
                          >
                            ROI % {historySortKey === "pnlPercent" ? (historySortOrder === "asc" ? "▲" : "▼") : ""}
                          </button>
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800 text-slate-200 font-mono text-xs">
                      {paginatedClosedPositions.map((pos) => {
                        const isWin = pos.pnl >= 0;
                        const returnUsdt = pos.totalInvested + pos.pnl;
                        return (
                          <tr key={pos.id} className="hover:bg-slate-800/25 transition">
                            <td className="py-3 px-4 text-slate-400 text-[11px]" title={pos.closedAt}>
                              {pos.closedAt ? new Date(pos.closedAt).toLocaleString() : "Date Unavailable"}
                            </td>
                            <td className="py-3 px-4">
                              <span className="font-bold text-white block">{pos.pair}</span>
                              <span className="text-[10px] text-slate-555 text-slate-500 font-sans block truncate max-w-[120px]" title={pos.botName}>
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
                            <td className="py-3 px-4">
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
                            <td className="py-3 px-4">
                              <span>{pos.amount}</span>
                            </td>
                            <td className="py-3 px-4">
                              <span className="text-slate-400">${pos.totalInvested.toFixed(2)} USDT</span>
                            </td>
                            <td className="py-3 px-4 text-right">
                              <span className="font-bold text-slate-100">${returnUsdt.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                            </td>
                            <td className="py-3 px-4 text-right">
                              <span className={`font-bold inline-flex items-center gap-1 ${isWin ? "text-emerald-400" : "text-red-400"}`}>
                                {isWin ? <ArrowUpRight className="w-3.5 h-3.5 text-emerald-450" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                                {isWin ? "+" : ""}${pos.pnl.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-right">
                              <span className={`px-1.5 py-0.5 rounded text-[11px] font-bold font-mono ${
                                isWin ? "bg-emerald-950/90 text-emerald-400" : "bg-red-950/90 text-red-400"
                              }`}>
                                {isWin ? "+" : ""}{pos.pnlPercent.toFixed(2)}%
                              </span>
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
                <div className="bg-[#181A20] border-t border-slate-800/80 px-5 py-3 font-mono text-[10px] text-slate-500 flex justify-between items-center">
                  <span>SHOWING ENTRIES {(currentPage - 1) * historyLimit + 1} - {Math.min(currentPage * historyLimit, totalItems)} OF {totalItems} TOTAL STORES</span>
                  <span className="uppercase text-emerald-500/80 tracking-normal text-[9px] font-bold">Safe Sandbox Environment Checked</span>
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

                {positions.length === 0 ? (
                  <div className="py-12 text-center rounded-lg border border-dashed border-slate-800 text-slate-500 space-y-3.5">
                    <p className="font-mono text-xs">No active deals running at this interval.</p>
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
                          <th className="py-3 px-4">Instrument / Type</th>
                          <th className="py-3 px-4">Direction</th>
                          <th className="py-3 px-4 text-right">Entry Price</th>
                          <th className="py-3 px-4 text-right">Mark Price</th>
                          <th className="py-3 px-4 text-right">Collateral Size</th>
                          <th className="py-3 px-4 text-right">ROI % / PnL</th>
                          <th className="py-3 px-4 text-center">Safety Fills</th>
                          <th className="py-3 px-4 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800 text-slate-100 font-mono">
                        {positions.map(p => {
                          const botRef = bots.find(b => b.id === p.botId);
                          const isLong = p.type === "long";
                          return (
                            <tr key={p.id} className="hover:bg-slate-900/40 transition">
                              <td className="py-3 px-4 font-bold font-sans text-white text-[13px]">{p.botName}</td>
                              <td className="py-3 px-4 uppercase text-slate-300 font-bold">{p.pair}</td>
                              <td className="py-3 px-4">
                                <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                                  isLong ? "bg-emerald-950 text-emerald-400 border border-emerald-500/25" : "bg-red-950 text-red-450 border border-red-500/25"
                                }`}>
                                  {p.type.toUpperCase()}
                                </span>
                              </td>
                              <td className="py-3 px-4 text-right text-slate-200">${p.entryPrice.toLocaleString(undefined, { minimumFractionDigits: 1 })}</td>
                              <td className="py-3 px-4 text-right text-emerald-400 font-bold">${p.currentPrice.toLocaleString(undefined, { minimumFractionDigits: 1 })}</td>
                              <td className="py-3 px-4 text-right text-slate-300">${p.totalInvested.toLocaleString()} USDT</td>
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
                  <div className="overflow-x-auto rounded-lg border border-slate-800 bg-[#0B0E11]/40">
                    <table className="w-full text-left border-collapse font-sans text-xs select-none">
                      <thead>
                        <tr className="bg-[#0B0E11]/90 border-b border-slate-800 uppercase text-slate-400 font-mono tracking-wider text-[10px]">
                          <th className="py-3 px-4">Settle Time</th>
                          <th className="py-3 px-4">Bot Strategy</th>
                          <th className="py-3 px-4">Instrument</th>
                          <th className="py-3 px-4">Direction</th>
                          <th className="py-3 px-4 text-right">Average In</th>
                          <th className="py-3 px-4 text-right">Settle Out</th>
                          <th className="py-3 px-4">Reason</th>
                          <th className="py-3 px-4 text-right">ROI % / Profit</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800 text-slate-100 font-mono">
                        {closedPositions
                          .filter(p => p.botName.toLowerCase().includes(dealsSearchQuery.toLowerCase()) || p.pair.toLowerCase().includes(dealsSearchQuery.toLowerCase()))
                          .map((pos) => {
                            const isWin = pos.pnl > 0;
                            const settleTime = pos.closedAt ? new Date(pos.closedAt).toLocaleTimeString() : "Unrecorded";
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
                                <td className="py-3 px-4 text-right text-slate-300">${pos.entryPrice.toLocaleString(undefined, { minimumFractionDigits: 1 })}</td>
                                <td className="py-3 px-4 text-right text-slate-100">${(pos.currentPrice || pos.entryPrice).toLocaleString(undefined, { minimumFractionDigits: 1 })}</td>
                                <td className="py-3 px-4">
                                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                    pos.closeReason === "tp" || pos.closeReason === "trailing_tp" ? "bg-emerald-550/10 text-emerald-400" :
                                    pos.closeReason === "sl" ? "bg-red-550/10 text-red-400" : "bg-slate-800 text-slate-400"
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
                <h1 className="text-2xl font-black text-white tracking-tight flex items-center justify-start gap-2.5 font-sans">
                  <Radio className="text-blue-400 w-6 h-6 animate-pulse" /> TradingView Webhook Control
                </h1>
                <p className="text-xs text-slate-400 mt-0.5 font-sans">
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
                            {bots.length === 0 ? (
                              <option value="">Create a bot first</option>
                            ) : (
                              bots.map(b => (
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
                          secret: globalWebhookSecret,
                          action: testerAction,
                          pair: activeBot.pair,
                          botId: activeBot.id,
                          price: "{{close}}"
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
                    <span className="text-[10px] font-mono text-amber-500 font-bold">SANDBOX TEST TRIGGER</span>
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
                          {bots.length === 0 ? (
                            <option value="">No Active Bots Registered</option>
                          ) : (
                            bots.map(b => (
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
                          value={globalWebhookSecret}
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
                    <code className="block p-2 bg-[#0B0E11] rounded text-[10px] font-mono break-all border border-slate-800 text-slate-400">
                      {computedWebhookUrl}
                    </code>
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
