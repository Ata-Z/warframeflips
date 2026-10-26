import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { User } from "@supabase/supabase-js";
import { supabase } from "../supabase";
import { timeAgo } from "../ui";
import type { Profile, ThreadSummary } from "../types";

const PAGE_SIZE = 25;

function fetchPage(offset: number) {
  return supabase
    .from("threads")
    .select("id, title, reply_count, created_at, last_post_at, author:profiles(username, avatar_url)")
    .order("last_post_at", { ascending: false })
    .range(offset, offset + PAGE_SIZE) // one extra row tells us if there's another page
    .overrideTypes<ThreadSummary[], { merge: false }>();
}

export interface ForumProps {
  user: User | null;
  onLogin: () => void;
}

export function Author({ profile }: { profile: Profile | null }) {
  return (
    <span className="forum-author">
      {profile?.avatar_url
        ? <img className="account-avatar" src={profile.avatar_url} alt="" />
        : <span className="account-avatar forum-avatar-blank" aria-hidden="true" />}
      {profile?.username ?? "Deleted user"}
    </span>
  );
}

export default function Forums({ user, onLogin }: ForumProps) {
  const navigate = useNavigate();
  const [threads, setThreads] = useState<ThreadSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [composing, setComposing] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [posting, setPosting] = useState(false);

  function load(offset: number) {
    return fetchPage(offset).then(({ data, error }) => {
      if (error) return setError(error.message);
      setHasMore(data.length > PAGE_SIZE);
      const page = data.slice(0, PAGE_SIZE);
      setThreads((prev) => (offset && prev ? [...prev, ...page] : page));
    });
  }

  useEffect(() => { load(0); }, []);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPosting(true);
    const { data, error } = await supabase
      .from("threads")
      .insert({ title: title.trim(), body: body.trim() })
      .select("id")
      .single();
    setPosting(false);
    if (error) return setError(error.message);
    navigate(`/forums/${data.id}`);
  }

  return (
    <main>
      <div className="forum-head">
        <div>
          <h1>Forums</h1>
          <p className="lede">Share flips, trading strategies, and market finds with other players.</p>
        </div>
        {!composing && (
          <button type="button" className="new-thread-btn" onClick={() => (user ? setComposing(true) : onLogin())}>
            <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
            New thread
          </button>
        )}
      </div>

      {composing && (
        <form className="auth-form forum-compose" onSubmit={onSubmit}>
          <label>
            Title
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)}
              minLength={3} maxLength={120} required />
          </label>
          <label>
            Post
            <textarea rows={6} value={body} onChange={(e) => setBody(e.target.value)} maxLength={10000} required />
          </label>
          <div className="forum-actions">
            <button type="button" className="account-btn" onClick={() => setComposing(false)}>Cancel</button>
            <button type="submit" className="primary-btn" disabled={posting}>{posting ? "Posting…" : "Post thread"}</button>
          </div>
        </form>
      )}

      {error && <p className="note" role="alert">{error}</p>}

      {threads === null && !error && <p className="note">Loading…</p>}
      {threads?.length === 0 && <p className="note">No threads yet. Start the first one!</p>}

      {threads && threads.length > 0 && (
        <ul className="forum-list">
          {threads.map((t) => (
            <li key={t.id}>
              <Link to={`/forums/${t.id}`} className="forum-title">{t.title}</Link>
              <div className="forum-meta">
                <Author profile={t.author} />
                <span>{t.reply_count} {t.reply_count === 1 ? "reply" : "replies"}</span>
                <span>active {timeAgo(t.last_post_at)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}

      {hasMore && (
        <button type="button" className="account-btn forum-more" onClick={() => load(threads?.length ?? 0)}>
          Load more
        </button>
      )}
    </main>
  );
}
