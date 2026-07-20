import { type FormEvent, type UIEvent, useEffect, useRef, useState } from 'react';
import { useApp } from '../state/context';

const CHAT_MAX_LENGTH = 500;

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/**
 * Collapsible room chat (Phase 10.2): right-side panel on desktop, bottom
 * sheet on mobile (CSS). Autoscrolls while pinned to the bottom and shows an
 * unread badge while collapsed. Game activity lives in ActivityLogPanel.
 */
export default function ChatPanel() {
  const { state, send } = useApp();
  const chat = state.chat;

  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  /** Sticks to the bottom unless the user scrolled up. */
  const pinnedRef = useRef(true);
  const [seenCount, setSeenCount] = useState(0);

  const unread = open ? 0 : chat.length - seenCount;

  useEffect(() => {
    if (open) setSeenCount(chat.length);
  }, [open, chat.length]);

  // Autoscroll on new messages (and on open) while pinned to the bottom.
  useEffect(() => {
    const list = listRef.current;
    if (open && list && pinnedRef.current) list.scrollTop = list.scrollHeight;
  }, [open, chat.length]);

  const onScroll = (e: UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    pinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 32;
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    if (send({ type: 'chat:send', text: trimmed })) {
      setText('');
      pinnedRef.current = true;
    }
  };

  if (!open) {
    return (
      <button type="button" className="chat-toggle" onClick={() => setOpen(true)}>
        Chat
        {unread > 0 && <span className="chat-unread">{unread > 99 ? '99+' : unread}</span>}
      </button>
    );
  }

  return (
    <aside className="chat-panel">
      <header className="chat-header">
        <h3>Chat</h3>
        <button
          type="button"
          className="chat-collapse"
          aria-label="Collapse chat"
          onClick={() => setOpen(false)}
        >
          ×
        </button>
      </header>

      <div className="chat-list" ref={listRef} onScroll={onScroll}>
        {chat.length === 0 && <p className="muted chat-empty">No messages yet.</p>}
        {chat.map((entry, i) => (
          <p key={`${entry.ts}-${entry.playerId}-${i}`} className="chat-line">
            <span className="chat-meta">
              <span className="chat-name">{entry.playerName}</span>
              {entry.chipsAtSend !== null && (
                <span className="chat-chips">
                  {entry.chipsAtSend} chip{entry.chipsAtSend === 1 ? '' : 's'}
                </span>
              )}
              <span className="chat-time">{formatTime(entry.ts)}</span>
            </span>
            <span className="chat-text">{entry.text}</span>
          </p>
        ))}
      </div>

      <form className="chat-form" onSubmit={submit}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={CHAT_MAX_LENGTH}
          placeholder="Say something…"
          aria-label="Chat message"
        />
        <button type="submit" disabled={!text.trim() || state.connection !== 'open'}>
          Send
        </button>
      </form>
    </aside>
  );
}
