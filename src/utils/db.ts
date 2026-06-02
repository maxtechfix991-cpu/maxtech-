import { UserProfile, TradingBot, Position, SystemLog } from "../types";

export const dbService = {
  isUsingFirebase: () => true,

  // --- 1. SECURE USER AUTH & MANAGEMENT ---
  registerUser: async (email: string, password: string): Promise<UserProfile> => {
    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });

    const data = await res.json();
    if (!data.success) {
      throw new Error(data.message || "Failed to register user account.");
    }

    return {
      uid: data.userId,
      email: email.trim().toLowerCase(),
      recoveryPhrase: data.recoveryPhrase,
      apiKeys: {},
      balances: {},
      createdAt: new Date().toISOString(),
      // Custom virtual properties to guide local email verification in sandboxed preview environments
      verificationLink: data.verificationLink
    } as any;
  },

  loginUser: async (email: string, password: string): Promise<UserProfile> => {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });

    const data = await res.json();
    if (!data.success) {
      if (data.isUnverified) {
        // Embed unverified prefix to distinguish view handling in UI
        throw new Error(`UNVERIFIED:${data.message}`);
      }
      throw new Error(data.message || "Authentication failed. Incorrect email or password.");
    }

    return data.user;
  },

  resetPassword: async (email: string, recoveryPhrase: string, passwordNew: string): Promise<boolean> => {
    const res = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, recoveryPhrase, passwordNew })
    });

    const data = await res.json();
    if (!data.success) {
      throw new Error(data.message || "Could not successfully reset account access credentials.");
    }

    return true;
  },

  sendRecoveryEmail: async (email: string): Promise<{ success: boolean; recoveryPin: string }> => {
    const res = await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email })
    });

    const data = await res.json();
    if (!data.success) {
      throw new Error(data.message || "Failed to trigger recovery credentials.");
    }

    return {
      success: true,
      recoveryPin: data.recoveryPin || ""
    };
  },

  updateUserProfile: async (userId: string, data: Partial<UserProfile>): Promise<void> => {
    const res = await fetch("/api/user/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uid: userId, data })
    });

    const body = await res.json();
    if (!body.success) {
      throw new Error(body.message || "Could not synchronize updated user profile changes.");
    }
  },

  getUserProfile: async (userId: string): Promise<UserProfile> => {
    const res = await fetch(`/api/user/${userId}/profile`);
    const data = await res.json();
    if (!data.success) {
      throw new Error(data.message || "Failed to load user profile from database.");
    }
    return data.user;
  },

  // --- 2. CLOUD BOTS STORAGE SYNCHRONIZATION ---
  getBots: async (userId: string): Promise<TradingBot[]> => {
    const res = await fetch(`/api/user/${userId}/bots`);
    const data = await res.json();
    if (!data.success) {
      throw new Error(data.message || "Failed to load active bots from database server.");
    }
    return data.bots || [];
  },

  saveBot: async (bot: Omit<TradingBot, "id"> & { id?: string }): Promise<TradingBot> => {
    const finalId = bot.id || "bot_" + Math.random().toString(36).substring(2, 9);
    const completeBot: TradingBot = { ...bot, id: finalId } as TradingBot;

    const res = await fetch(`/api/user/${bot.userId}/bots`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(completeBot)
    });

    const data = await res.json();
    if (!data.success) {
      throw new Error(data.message || "Could not store bot settings securely on cloud server.");
    }

    return completeBot;
  },

  deleteBot: async (botId: string): Promise<void> => {
    // We assume the user profile will handle ID association or we query it. We can fetch from current page
    const cached = localStorage.getItem("apex_terminal_session");
    let userId = "default";
    if (cached) {
      try {
        userId = JSON.parse(cached).uid;
      } catch {}
    }

    const res = await fetch(`/api/user/${userId}/bots/${botId}`, {
      method: "DELETE"
    });

    const data = await res.json();
    if (!data.success) {
      throw new Error(data.message || "Could not delete bot configuration from database storage.");
    }
  },

  // --- 3. CLOUD POSITIONS STORAGE SYNCHRONIZATION ---
  getPositions: async (userId: string): Promise<Position[]> => {
    const res = await fetch(`/api/user/${userId}/positions`);
    const data = await res.json();
    if (!data.success) {
      throw new Error(data.message || "Failed to load active trade positions from database server.");
    }
    return data.positions || [];
  },

  savePosition: async (pos: Position): Promise<Position> => {
    const res = await fetch(`/api/user/${pos.userId}/positions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(pos)
    });

    const data = await res.json();
    if (!data.success) {
      throw new Error(data.message || "Failed to sync transaction positions in database storage.");
    }

    return pos;
  },

  deletePosition: async (posId: string): Promise<void> => {
    const cached = localStorage.getItem("apex_terminal_session");
    let userId = "default";
    if (cached) {
      try {
        userId = JSON.parse(cached).uid;
      } catch {}
    }

    const res = await fetch(`/api/user/${userId}/positions/${posId}`, {
      method: "DELETE"
    });

    const data = await res.json();
    if (!data.success) {
      throw new Error(data.message || "Could not delete position entry from cloud storage.");
    }
  },

  // --- 4. CLOUD SYSTEM AUDITING LOGS ---
  getLogs: async (userId: string): Promise<SystemLog[]> => {
    const res = await fetch(`/api/user/${userId}/logs`);
    const data = await res.json();
    if (!data.success) {
      throw new Error(data.message || "Could not retrieve operational logs from database.");
    }
    return data.logs || [];
  },

  addLog: async (userId: string, message: string, type: SystemLog["type"], botId?: string, botName?: string): Promise<SystemLog> => {
    const newLog: SystemLog = {
      id: "log_" + Math.random().toString(36).substring(2, 9),
      userId,
      botId,
      botName,
      message,
      type,
      timestamp: new Date().toISOString(),
    };

    const res = await fetch(`/api/user/${userId}/logs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newLog)
    });

    const data = await res.json();
    if (!data.success) {
      throw new Error(data.message || "Could not write system logs to cloud.");
    }

    return newLog;
  },

  clearLogs: async (userId: string): Promise<void> => {
    const res = await fetch(`/api/user/${userId}/logs/clear`, {
      method: "POST"
    });

    const data = await res.json();
    if (!data.success) {
      throw new Error(data.message || "Could not clear persistent system logs.");
    }
  },

  clearTradeHistory: async (userId: string): Promise<void> => {
    const res = await fetch(`/api/user/${userId}/positions/clear`, {
      method: "POST"
    });

    const data = await res.json();
    if (!data.success) {
      throw new Error(data.message || "Could not clear persistent trade history.");
    }
  }
};
