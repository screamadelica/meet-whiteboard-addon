export type BoardMessage = {
  action: string;
  senderId: string;
  messageId: string;
  targetClientId?: string;
  [key: string]: unknown;
};

export function createClientId() {
  return globalThis.crypto?.randomUUID?.() ?? `client-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function createBoardMessage(senderId: string, message: Record<string, unknown>): BoardMessage {
  return {
    ...message,
    senderId,
    messageId: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
  } as BoardMessage;
}

export function normalizeBoardMessage(message: Record<string, unknown>, senderId: string): BoardMessage | null {
  if (typeof message.action !== 'string') return null;
  if (typeof message.senderId === 'string' && typeof message.messageId === 'string') {
    return message as BoardMessage;
  }
  return createBoardMessage(senderId, message);
}

export class MessageDeduplicator {
  private ids = new Set<string>();
  private order: string[] = [];
  private capacity: number;

  constructor(capacity = 2000) {
    this.capacity = capacity;
  }

  accept(messageId: string) {
    if (this.ids.has(messageId)) return false;
    this.ids.add(messageId);
    this.order.push(messageId);
    if (this.order.length > this.capacity) {
      const expiredId = this.order.shift();
      if (expiredId) this.ids.delete(expiredId);
    }
    return true;
  }
}
