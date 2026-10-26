import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "../supabase";
import { Author, type ForumProps } from "./Forums";
import { timeAgo } from "../ui";
import type { Post as PostRow, ThreadDetail } from "../types";

const AUTHOR = "author:profiles(username, avatar_url)";

function Post({ post, canDelete, onDelete }: { post: PostRow; canDelete: boolean; onDelete: () => void }) {
  return (
    <article className="forum-post">
      <header className="forum-meta">
        <Author profile={post.author} />
        <time dateTime={post.created_at} title={new Date(post.created_at).toLocaleString()}>
          {timeAgo(post.created_at)}
        </time>
        {canDelete && (
          <button type="button" className="forum-delete" onClick={onDelete}>Delete</button>
        )}
      </header>
      <p className="forum-body">{post.body}</p>
    </article>
  );
}

export default function Thread({ user, onLogin }: ForumProps) {
  const { id } = useParams() as { id: string };
  const navigate = useNavigate();
  const [thread, setThread] = useState<ThreadDetail | null>(null);
  const [posts, setPosts] = useState<PostRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    let live = true;
    Promise.all([
      supabase.from("threads").select(`id, title, body, author_id, created_at, ${AUTHOR}`).eq("id", id)
        .maybeSingle<ThreadDetail>(),
      supabase.from("posts").select(`id, body, author_id, created_at, ${AUTHOR}`).eq("thread_id", id).order("created_at")
        .overrideTypes<PostRow[], { merge: false }>(),
    ]).then(([t, p]) => {
      if (!live) return;
      if (t.error || p.error) return setError((t.error || p.error)!.message);
      if (!t.data) return setError("This thread doesn't exist or was deleted.");
      setThread(t.data);
      setPosts(p.data);
    });
    return () => { live = false; };
  }, [id]);

  async function onReply(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPosting(true);
    const { data, error } = await supabase
      .from("posts")
      .insert({ thread_id: Number(id), body: reply.trim() })
      .select(`id, body, author_id, created_at, ${AUTHOR}`)
      .single<PostRow>();
    setPosting(false);
    if (error) return setError(error.message);
    setPosts((ps) => [...ps, data]);
    setReply("");
  }

  async function deleteThread() {
    if (!confirm("Delete this thread and all its replies?")) return;
    const { error } = await supabase.from("threads").delete().eq("id", id);
    if (error) return setError(error.message);
    navigate("/forums");
  }

  async function deletePost(postId: number) {
    if (!confirm("Delete this reply?")) return;
    const { error } = await supabase.from("posts").delete().eq("id", postId);
    if (error) return setError(error.message);
    setPosts((ps) => ps.filter((p) => p.id !== postId));
  }

  return (
    <main>
      <Link to="/forums" className="forum-back">← All threads</Link>

      {error && <p className="note" role="alert">{error}</p>}
      {!thread && !error && <p className="note">Loading…</p>}

      {thread && (
        <>
          <h1 className="forum-thread-title">{thread.title}</h1>
          <Post post={thread} canDelete={user?.id === thread.author_id} onDelete={deleteThread} />

          <h2 className="forum-replies-head">
            {posts.length} {posts.length === 1 ? "reply" : "replies"}
          </h2>
          {posts.map((p) => (
            <Post key={p.id} post={p} canDelete={user?.id === p.author_id} onDelete={() => deletePost(p.id)} />
          ))}

          {user ? (
            <form className="auth-form forum-compose" onSubmit={onReply}>
              <label>
                Reply
                <textarea rows={4} value={reply} onChange={(e) => setReply(e.target.value)} maxLength={10000} required />
              </label>
              <div className="forum-actions">
                <button type="submit" className="primary-btn" disabled={posting}>{posting ? "Posting…" : "Post reply"}</button>
              </div>
            </form>
          ) : (
            <p className="note">
              <button type="button" className="forum-link-btn" onClick={onLogin}>Log in with Discord</button> to reply.
            </p>
          )}
        </>
      )}
    </main>
  );
}
