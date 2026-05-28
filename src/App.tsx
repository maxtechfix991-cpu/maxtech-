import { useState, useEffect } from "react";
import Auth from "./components/Auth";
import MainTerminal from "./components/MainTerminal";
import { UserProfile } from "./types";

export default function App() {
  const [user, setUser] = useState<UserProfile | null>(null);

  // Load existing session on initial mount for ease of use
  useEffect(() => {
    const cached = localStorage.getItem("apex_terminal_session");
    if (cached) {
      try {
        setUser(JSON.parse(cached));
      } catch {
        localStorage.removeItem("apex_terminal_session");
      }
    }
  }, []);

  const handleAuthSuccess = (profile: UserProfile) => {
    setUser(profile);
    localStorage.setItem("apex_terminal_session", JSON.stringify(profile));
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem("apex_terminal_session");
  };

  return (
    <main className="min-h-screen bg-[#0B0E11] selection:bg-emerald-500/30 text-[#EAECEF]">
      {!user ? (
        <Auth onAuthSuccess={handleAuthSuccess} />
      ) : (
        <MainTerminal user={user} onLogout={handleLogout} />
      )}
    </main>
  );
}
