/** Tiny send-function registry so the store can emit network messages without
 *  importing the WebSocket module (avoids an import cycle: net → store → net). */
export const net = {
  send: null as null | ((o: unknown) => void),
};
