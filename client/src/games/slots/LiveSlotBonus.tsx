import {
  type LiveSlotBonus as Bonus,
  type ClientMessage,
  isBetALotState,
  SLOT_TICKET_COST,
} from '@dice/shared';
import { useEffect, useRef, useState } from 'react';
import { useApp } from '../../state/context';
import SlotMachine from './SlotMachine';
import './live-slots.css';

type Command = Extract<ClientMessage, { type: 'betalot:slotsAction' }>;

export default function LiveSlotBonus() {
  const { state } = useApp();
  const game = state.snapshot?.game;
  if (!isBetALotState(game) || !game.slots?.active) return null;
  return <LiveMachine key={game.slots.active.id} bonus={game.slots.active} />;
}

function LiveMachine({ bonus }: { bonus: Bonus }) {
  const { state, send } = useApp();
  const dialog = useRef<HTMLDialogElement>(null);
  const [now, setNow] = useState(Date.now);
  const [pendingRevision, setPendingRevision] = useState<number | null>(null);
  const player = state.snapshot?.players.find((p) => p.id === bonus.playerId);
  const mine = state.me?.playerId === bonus.playerId;
  const connected = state.connection === 'open';
  const pending = pendingRevision === bonus.revision;
  const secondsLeft = Math.max(0, Math.ceil((bonus.expiresAt - now) / 1000));

  useEffect(() => {
    if (!dialog.current?.open) dialog.current?.showModal();
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!pending) return;
    // A new snapshot releases the controls immediately; allow retry if no reply arrives.
    const timer = window.setTimeout(() => setPendingRevision(null), 1500);
    return () => window.clearTimeout(timer);
  }, [pending]);

  function action(
    payload:
      | { action: 'spin' | 'collect' | 'continue' }
      | { action: 'lock'; index: number; locked: boolean },
  ) {
    if (!mine || !connected || pending) return;
    if (
      send({
        type: 'betalot:slotsAction',
        bonusId: bonus.id,
        revision: bonus.revision,
        ...payload,
      } satisfies Command)
    ) {
      setPendingRevision(bonus.revision);
    }
  }

  return (
    <dialog
      ref={dialog}
      className="slots-live-dialog"
      aria-labelledby="slots-live-title"
      onCancel={(event) => event.preventDefault()}
    >
      <div className="slots-live-heading">
        <div>
          <strong id="slots-live-title">
            {mine ? 'Your' : `${player?.name ?? 'Player'}’s`} slot bonus · {SLOT_TICKET_COST}{' '}
            tickets
          </strong>
          <span>
            {mine
              ? 'Match a target to win chips from your opponent.'
              : 'Watching live · the ticket owner controls the reels.'}
          </span>
        </div>
        <span>
          {connected
            ? `${secondsLeft}s ${bonus.round.phase === 'complete' ? 'until return' : 'to decide'}`
            : 'Reconnecting…'}
        </span>
      </div>
      <SlotMachine
        round={bonus.round}
        practice={false}
        disabled={!mine || !connected || pending}
        footer={
          <>
            {bonus.fireMultiplier === 2 && 'Fire ×2 included. '}
            Prizes shown include the {bonus.payoutLimit}-chip opponent limit. After 60 seconds
            without a decision, the current hand is collected.
          </>
        }
        onSpin={() => action({ action: 'spin' })}
        onLock={(index) => action({ action: 'lock', index, locked: !bonus.round.locked[index] })}
        onCollect={() => action({ action: 'collect' })}
        onNext={() => action({ action: 'continue' })}
      />
    </dialog>
  );
}
