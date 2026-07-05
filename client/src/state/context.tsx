import type { ClientMessage } from '@dice/shared';
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
} from 'react';
import type { WsClient } from '../ws/client';
import { getWsClient } from '../ws/singleton';
import { loadName, saveIdentity } from './persist';
import { type AppAction, type AppState, initialState, reducer } from './store';

interface AppContextValue {
  state: AppState;
  dispatch: (action: AppAction) => void;
  /** Send a protocol message; returns false if the socket isn't open. */
  send: (msg: ClientMessage) => boolean;
  ws: WsClient;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children, client }: { children: ReactNode; client?: WsClient }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const ws = client ?? getWsClient();

  // Sync socket status before paint so automation doesn't see a stale "closed".
  useLayoutEffect(() => {
    dispatch({ type: 'connection-status', status: ws.getStatus() });
  }, [ws]);

  useEffect(() => {
    const offMessage = ws.onMessage((message) => dispatch({ type: 'server-message', message }));
    const offStatus = ws.onStatus((status) => dispatch({ type: 'connection-status', status }));
    if (ws.getStatus() === 'closed') ws.connect();
    return () => {
      offMessage();
      offStatus();
    };
  }, [ws]);

  // Persist identity and keep the reconnect-rejoin message current.
  useEffect(() => {
    if (state.roomId && state.me) {
      saveIdentity(state.roomId, {
        ...state.me,
        playerName: playerNameFromSnapshot(state) ?? loadName() ?? 'Player',
      });
      ws.setRejoin({
        type: 'room:join',
        roomId: state.roomId,
        playerName: playerNameFromSnapshot(state) ?? 'Player',
        rejoinToken: state.me.rejoinToken,
      });
    } else {
      ws.setRejoin(null);
    }
  }, [ws, state.roomId, state.me, state.snapshot]);

  const value = useMemo<AppContextValue>(
    () => ({ state, dispatch, send: (msg) => ws.send(msg), ws }),
    [state, ws],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

function playerNameFromSnapshot(state: AppState): string | null {
  if (!state.snapshot || !state.me) return null;
  return state.snapshot.players.find((p) => p.id === state.me!.playerId)?.name ?? null;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>');
  return ctx;
}
