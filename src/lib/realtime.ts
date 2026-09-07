// Single EventSource shared by the whole app, replacing Firestore's onSnapshot.
// Components subscribe to named events; a reconnect fires 'reconnect' so they can
// refetch, since events emitted while the stream was down are not replayed.

export type RealtimeEvent =
  | 'message.created'
  | 'message.updated'
  | 'message.deleted'
  | 'message.restored'
  | 'messages.restored'
  | 'message.reaction'
  | 'messages.read'
  | 'chat.created'
  | 'chat.updated'
  | 'chat.removed'
  | 'presence.changed'
  | 'profile.updated'
  | 'reconnect';

type Handler = (payload: any) => void;

const EVENT_NAMES: RealtimeEvent[] = [
  'message.created',
  'message.updated',
  'message.deleted',
  'message.restored',
  'messages.restored',
  'message.reaction',
  'messages.read',
  'chat.created',
  'chat.updated',
  'chat.removed',
  'presence.changed',
  'profile.updated',
];

const handlers = new Map<RealtimeEvent, Set<Handler>>();
let source: EventSource | null = null;
let hadOpenConnection = false;

function dispatch(event: RealtimeEvent, payload: any) {
  const set = handlers.get(event);
  if (!set) return;
  for (const handler of set) {
    try {
      handler(payload);
    } catch (err) {
      console.error(`Realtime handler failed for ${event}:`, err);
    }
  }
}

function connect() {
  if (source) return;

  const token = localStorage.getItem('session_token');
  const eventUrl = token ? `/api/events?token=${encodeURIComponent(token)}` : '/api/events';
  source = new EventSource(eventUrl, { withCredentials: true });

  source.onopen = () => {
    // A reopen means the stream dropped and came back, so listeners must resync.
    if (hadOpenConnection) dispatch('reconnect', null);
    hadOpenConnection = true;
  };

  for (const name of EVENT_NAMES) {
    source.addEventListener(name, (e) => {
      try {
        dispatch(name, JSON.parse((e as MessageEvent).data));
      } catch (err) {
        console.error(`Malformed realtime payload for ${name}:`, err);
      }
    });
  }
}

export function subscribe(event: RealtimeEvent, handler: Handler): () => void {
  let set = handlers.get(event);
  if (!set) {
    set = new Set();
    handlers.set(event, set);
  }
  set.add(handler);

  connect();

  return () => {
    set!.delete(handler);
  };
}

export function disconnectRealtime() {
  source?.close();
  source = null;
  hadOpenConnection = false;
  handlers.clear();
}
