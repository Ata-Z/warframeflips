import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { Link, Navigate, NavLink, Route, Routes, useLocation } from "react-router-dom";
import Flips from "./pages/Flips";
import Spread from "./pages/Spread";
import Sets from "./pages/Sets";
import Arcanes from "./pages/Arcanes";
import Notifier from "./pages/Notifier";
import Forums from "./pages/Forums";
import Thread from "./pages/Thread";
import LoginDialog from "./pages/Login";
import { supabase } from "./supabase";
import "./App.css";

export default function App() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const { pathname } = useLocation();

  useEffect(() => setMenuOpen(false), [pathname]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setUser(data.session?.user ?? null));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session) setLoginOpen(false);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const meta = user?.user_metadata ?? {};
  const displayName = meta.custom_claims?.global_name || meta.full_name || meta.name || user?.email;

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <Link to="/" className="wordmark">Warframe Flips</Link>
          <button type="button" className="menu-btn" aria-label="Menu" aria-expanded={menuOpen}
            aria-controls="site-nav" onClick={() => setMenuOpen((o) => !o)}>
            <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
              {menuOpen
                ? <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                : <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />}
            </svg>
          </button>
          <div id="site-nav" className={`site-nav${menuOpen ? " open" : ""}`}>
            <nav className="tabs">
              <NavLink to="/" end>Mod flips</NavLink>
              <NavLink to="/sets">Sets vs parts</NavLink>
              <NavLink to="/arcanes">Arcanes</NavLink>
              <NavLink to="/analytics">Analytics</NavLink>
              <NavLink to="/notifier">Notifier</NavLink>
              <NavLink to="/forums">Forums</NavLink>
            </nav>
            {user ? (
              <button type="button" className="account-btn" title="Sign out"
                onClick={() => { setMenuOpen(false); supabase.auth.signOut(); }}>
                <span className="account-user">
                  {meta.avatar_url && <img className="account-avatar" src={meta.avatar_url} alt="" />}
                  {displayName} · Sign out
                </span>
              </button>
            ) : (
              <button type="button" className="account-btn"
                onClick={() => { setMenuOpen(false); setLoginOpen(true); }}>
                Log in / Sign up
              </button>
            )}
          </div>
        </div>
      </header>
      <Routes>
        <Route path="/" element={<Flips />} />
        <Route path="/sets" element={<Sets />} />
        <Route path="/arcanes" element={<Arcanes />} />
        <Route path="/notifier" element={<Notifier />} />
        <Route path="/analytics" element={<Spread />} />
        <Route path="/spread" element={<Navigate to="/analytics" replace />} />
        <Route path="/forums" element={<Forums user={user} onLogin={() => setLoginOpen(true)} />} />
        <Route path="/forums/:id" element={<Thread user={user} onLogin={() => setLoginOpen(true)} />} />
      </Routes>
      <LoginDialog open={loginOpen} onClose={() => setLoginOpen(false)} />
    </>
  );
}
