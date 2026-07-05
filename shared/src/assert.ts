/**
 * Exhaustiveness guards for discriminated unions. Put one in the `default` of
 * every switch over a shared union (ClientMessage, ServerMessage, EngineEvent,
 * RoomEvent): adding a variant then makes the unhandled switch a compile error
 * instead of a silent skip. See docs/CODING_GUIDELINES.md.
 */

/**
 * For trusted internal unions (server-side events): an unhandled variant is a
 * bug, so fail loudly if it is ever reached at runtime.
 */
export function assertNever(value: never, context = 'unexpected variant'): never {
  throw new Error(`${context}: ${JSON.stringify(value)}`);
}

/**
 * For wire data (client-side handling of ServerMessage): the compile-time
 * check is identical, but unknown runtime values are tolerated — a newer
 * server must never crash an older client.
 */
export function assertUnreachable(_value: never): void {}
