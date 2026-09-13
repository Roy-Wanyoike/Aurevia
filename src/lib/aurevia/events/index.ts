// ---------------------------------------------------------------------------
// Aurevia Events — consolidated re-exports.
//
// Import from here so callers don't need to know the file layout:
//   import { EVENT_TYPES, emitEvent } from "@/lib/aurevia/events";
// ---------------------------------------------------------------------------

export {
  EVENT_TYPES,
  EVENT_SCHEMA_VERSION,
  type EventType,
  type AureviaEvent,
} from "./types";

export { emitEvent, emitEvents } from "./emitter";
