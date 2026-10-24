import { useEffect, useRef, useState } from "react";
import { supabase } from "../supabase";

export default function LoginDialog({ open, onClose }) {
  const ref = useRef(null);
  const [mode, setMode] = useState("login");
  const [submitted, setSubmitted] = useState(false);
  const [oauthError, setOauthError] = useState(null);
  const signup = mode === "signup";

  useEffect(() => {
    const dialog = ref.current;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
    if (!open) { setSubmitted(false); setOauthError(null); }
  }, [open]);

  function switchTo(next) {
    setMode(next);
    setSubmitted(false);
  }

  async function signInWithDiscord() {
    setOauthError(null);
    // redirects to Discord; Supabase brings the user back here with a session
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "discord",
      options: { redirectTo: window.location.href },
    });
    if (error) setOauthError(error.message);
  }

  function onSubmit(e) {
    e.preventDefault();
    setSubmitted(true); // no backend yet
  }

  return (
    // onClose fires on Esc; a click on the backdrop lands on the dialog element itself
    <dialog ref={ref} className="auth-dialog" aria-labelledby="auth-title" onClose={onClose}
      onClick={(e) => { if (e.target === ref.current) onClose(); }}>
      <div className="auth-card">
        <button type="button" className="close-btn" aria-label="Close" onClick={onClose}>
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>

        <div className="seg" role="group" aria-label="Account">
          <button type="button" aria-pressed={!signup} onClick={() => switchTo("login")}>Log in</button>
          <button type="button" aria-pressed={signup} onClick={() => switchTo("signup")}>Sign up</button>
        </div>

        <h2 id="auth-title">{signup ? "Create an account" : "Welcome back"}</h2>

        <button type="button" className="discord-btn" onClick={signInWithDiscord}>
          <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
            <path fill="currentColor" d="M20.32 4.37a19.8 19.8 0 0 0-4.89-1.52.07.07 0 0 0-.08.04c-.21.38-.44.87-.61 1.25a18.27 18.27 0 0 0-5.49 0 12.64 12.64 0 0 0-.62-1.25.08.08 0 0 0-.08-.04 19.74 19.74 0 0 0-4.89 1.52.07.07 0 0 0-.03.03C.53 9.05-.32 13.58.1 18.06a.08.08 0 0 0 .03.06 19.9 19.9 0 0 0 5.99 3.03.08.08 0 0 0 .08-.03c.46-.63.87-1.3 1.23-1.99a.08.08 0 0 0-.04-.11 13.1 13.1 0 0 1-1.87-.89.08.08 0 0 1-.01-.13l.37-.29a.07.07 0 0 1 .08-.01c3.93 1.79 8.18 1.79 12.06 0a.07.07 0 0 1 .08.01l.37.29a.08.08 0 0 1-.01.13c-.6.35-1.22.65-1.87.89a.08.08 0 0 0-.04.11c.36.7.78 1.36 1.23 1.99a.08.08 0 0 0 .08.03 19.84 19.84 0 0 0 6-3.03.08.08 0 0 0 .03-.06c.5-5.18-.84-9.67-3.55-13.66a.06.06 0 0 0-.03-.03ZM8.02 15.33c-1.18 0-2.16-1.08-2.16-2.42 0-1.33.96-2.42 2.16-2.42 1.21 0 2.18 1.1 2.16 2.42 0 1.34-.96 2.42-2.16 2.42Zm7.97 0c-1.18 0-2.15-1.08-2.15-2.42 0-1.33.95-2.42 2.15-2.42 1.21 0 2.18 1.1 2.16 2.42 0 1.34-.95 2.42-2.16 2.42Z" />
          </svg>
          Continue with Discord
        </button>
        {oauthError && <p className="note auth-note" role="alert">{oauthError}</p>}

        <div className="auth-divider"><span>or</span></div>

        <form className="auth-form" onSubmit={onSubmit}>
          {signup && (
            <label>
              Username
              <input type="text" autoComplete="username" required />
            </label>
          )}
          <label>
            Email
            <input type="email" autoComplete="email" required />
          </label>
          <label>
            Password
            <input type="password" autoComplete={signup ? "new-password" : "current-password"} required />
          </label>
          <button type="submit" className="primary-btn">{signup ? "Sign up" : "Log in"}</button>
        </form>

        {submitted && <p className="note auth-note" role="status">Normal accounts aren't live yet. Discord logins work though!</p>}
      </div>
    </dialog>
  );
}
