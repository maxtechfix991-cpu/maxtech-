import React, { useMemo } from "react";
import { Position } from "../types";
import { TrendingUp, TrendingDown, ArrowUpRight, Award, Flame } from "lucide-react";

interface LiveChartProps {
  pair: string;
  currentPrice: number;
  activePosition?: Position;
  priceHistory: number[];
  onPump: () => void;
  onDump: () => void;
}

export default function LiveChart({
  pair,
  currentPrice,
  activePosition,
  priceHistory,
  onPump,
  onDump,
}: LiveChartProps) {
  // Find ROI
  const pnlPercent = useMemo(() => {
    if (!activePosition) return 0;
    return activePosition.pnlPercent;
  }, [activePosition, currentPrice]);

  // Determine chart metrics
  const minPrice = useMemo(() => {
    if (priceHistory.length === 0) return currentPrice * 0.99;
    let fallback = Math.min(...priceHistory);
    if (activePosition) {
      fallback = Math.min(fallback, activePosition.entryPrice, activePosition.slTriggerPrice);
    }
    return fallback * 0.998;
  }, [priceHistory, currentPrice, activePosition]);

  const maxPrice = useMemo(() => {
    if (priceHistory.length === 0) return currentPrice * 1.01;
    let fallback = Math.max(...priceHistory);
    if (activePosition) {
      fallback = Math.max(fallback, activePosition.entryPrice, activePosition.tpTriggerPrice, activePosition.maxPriceSeen);
    }
    return fallback * 1.002;
  }, [priceHistory, currentPrice, activePosition]);

  const priceRange = maxPrice - minPrice || 1;

  // Render SVG points for price trend line mapping
  const pointsString = useMemo(() => {
    if (priceHistory.length < 2) return "";
    const width = 500;
    const height = 180;
    const padding = 10;
    
    return priceHistory
      .map((val, idx) => {
        const x = padding + (idx / (priceHistory.length - 1)) * (width - padding * 2);
        const y = height - padding - ((val - minPrice) / priceRange) * (height - padding * 2);
        return `${x},${y}`;
      })
      .join(" ");
  }, [priceHistory, minPrice, priceRange]);

  // Translate price to Y coordinates on the SVG
  const getPriceY = (targetPrice: number) => {
    const height = 180;
    const padding = 10;
    if (targetPrice < minPrice) return height - padding;
    if (targetPrice > maxPrice) return padding;
    return height - padding - ((targetPrice - minPrice) / priceRange) * (height - padding * 2);
  };

  const getPriceLabel = () => {
    if (!activePosition) return "No Open Positions";
    if (activePosition.trailingTpActive) return "🔥 Trailing Take Profit Trigger (Tracks High water mark!)";
    return "Open Position Trade Levels";
  };

  return (
    <div className="bg-[#1E2329] border border-slate-800 rounded-xl p-6 shadow-xl relative overflow-hidden flex flex-col justify-between h-full">
      
      {/* Visual Chart Header */}
      <div className="flex flex-wrap justify-between items-start gap-4 mb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xl font-black font-sans text-white tracking-wider">{pair}</span>
            <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded font-mono ${pnlPercent >= 0 ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"}`}>
              {pnlPercent >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              {activePosition ? `${pnlPercent >= 0 ? "+" : ""}${pnlPercent.toFixed(2)}% ROI` : "N/A"}
            </span>
          </div>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-mono font-bold text-white tracking-tight">
              ${currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className="text-xs text-slate-505 text-slate-400 font-mono">USDT per asset</span>
          </div>
        </div>

        {/* Demo Volatility Trigger Controls */}
        <div className="flex items-center gap-2">
          <div className="bg-[#0B0E11] border border-slate-800 rounded-lg p-1.5 flex gap-1 items-center">
            <button
              id="pump_market_btn"
              onClick={onPump}
              title="Force simulated crypto pump"
              className="text-[10px] font-mono font-black uppercase text-emerald-400 hover:bg-emerald-500/15 border border-emerald-500/35 rounded px-2.5 py-1 transition cursor-pointer flex items-center gap-1"
            >
              <Flame className="w-3 h-3 animate-bounce" /> Pump (+0.5%)
            </button>
            <button
              id="dump_market_btn"
              onClick={onDump}
              title="Force simulated crypto dump"
              className="text-[10px] font-mono font-black uppercase text-red-400 hover:bg-red-500/15 border border-red-500/35 rounded px-2.5 py-1 transition cursor-pointer"
            >
              Dump (-0.5%)
            </button>
          </div>
        </div>
      </div>

      {/* SVG Volatility Graph with threshold markers */}
      <div className="relative w-full h-[180px] bg-[#0B0E11]/80 rounded-lg border border-slate-900 overflow-hidden mt-2">
        {/* Draw Line */}
        {priceHistory.length >= 2 && (
          <svg className="w-full h-full" viewBox="0 0 500 180" preserveAspectRatio="none">
            {/* Gradients fill */}
            <defs>
              <linearGradient id="chart_grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity="0.15" />
                <stop offset="100%" stopColor="#10b981" stopOpacity="0.00" />
              </linearGradient>
            </defs>
            <path
              d={`M 10,170 L ${pointsString} L 490,170 Z`}
              fill="url(#chart_grad)"
            />
            <polyline
              fill="none"
              stroke="#10b981"
              strokeWidth="2.5"
              points={pointsString}
              strokeDasharray="none"
              strokeLinejoin="round"
              strokeLinecap="round"
            />

            {/* If Position is Active, draw custom trade trigger threshold lines! */}
            {activePosition && (
              <>
                {/* 1. ENTRY PRICE LEVEL */}
                <line
                  x1="0"
                  y1={getPriceY(activePosition.entryPrice)}
                  x2="500"
                  y2={getPriceY(activePosition.entryPrice)}
                  stroke="#fbbf24"
                  strokeWidth="1"
                  strokeDasharray="3,3"
                />
                
                {/* 2. TAKE PROFIT TARGET OR TRAILING TP UPPER BOUND */}
                <line
                  x1="0"
                  y1={getPriceY(activePosition.tpTriggerPrice)}
                  x2="500"
                  y2={getPriceY(activePosition.tpTriggerPrice)}
                  stroke={activePosition.trailingTpActive ? "#b55fe6" : "#34d399"}
                  strokeWidth={activePosition.trailingTpActive ? "1.5" : "1"}
                  strokeDasharray={activePosition.trailingTpActive ? "none" : "3,3"}
                />

                {/* 3. STOP LOSS LEVEL */}
                <line
                  x1="0"
                  y1={getPriceY(activePosition.slTriggerPrice)}
                  x2="500"
                  y2={getPriceY(activePosition.slTriggerPrice)}
                  stroke="#f87171"
                  strokeWidth="1"
                  strokeDasharray="3,3"
                />
              </>
            )}
          </svg>
        )}

        {/* Labels on right of SVG overlay matching prices precisely */}
        {activePosition && (
          <div className="absolute right-2 inset-y-0 flex flex-col justify-between items-end pointer-events-none text-[9px] font-mono z-10 py-1">
            <span className="bg-[#1E2329]/90 border border-[#b55fe6] px-1.5 py-0.5 rounded text-[#b55fe6]">
              {activePosition.trailingTpActive ? "🎯 TRAIL HIGHEST SEEN" : "🎯 TARGET PROFIT"}
            </span>
            <span className="bg-[#1E2329]/80 border border-slate-700 px-1.5 py-0.5 rounded text-amber-400">
              🔑 ENTRY @ ${activePosition.entryPrice.toFixed(1)}
            </span>
            <span className="bg-[#1E2329]/80 border border-slate-700 px-1.5 py-0.5 rounded text-red-400">
              🛡️ STOP @ ${activePosition.slTriggerPrice.toFixed(1)}
            </span>
          </div>
        )}

        {/* Dynamic Watermark Indicator */}
        <div className="absolute top-2 left-3 pointer-events-none text-[10px] font-mono text-slate-600 tracking-wider">
          {getPriceLabel()}
        </div>
      </div>

      {/* Meta Indicators */}
      <div className="flex justify-between items-center text-[11px] font-mono text-slate-500 mt-4 pt-4 border-t border-slate-800">
        <div>
          RANGE: <span className="text-white">${minPrice.toFixed(1)}</span> - <span className="text-white">${maxPrice.toFixed(1)}</span>
        </div>
        {activePosition ? (
          <div className="flex items-center gap-1 text-slate-400">
            <Award className="w-3.5 h-3.5 text-amber-400" />
            INVESTED: <span className="text-white font-bold">${activePosition.totalInvested.toFixed(0)} USDT</span>
          </div>
        ) : (
          <div className="text-slate-600">Simulating live ticks...</div>
        )}
      </div>
    </div>
  );
}
