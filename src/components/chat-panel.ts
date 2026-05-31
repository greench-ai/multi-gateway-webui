import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { connectionManager } from '../core/connection-manager';

interface Message {
  id: string;
  role: string;
  content: string;
  timestamp: number;
}

@customElement('chat-panel')
export class ChatPanel extends LitElement {
  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      flex: 1;
      overflow: hidden;
    }

    .messages {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .messages::-webkit-scrollbar {
      width: 6px;
    }

    .messages::-webkit-scrollbar-thumb {
      background: #2a2a3a;
      border-radius: 3px;
    }

    .message {
      max-width: 80%;
      padding: 10px 14px;
      border-radius: 12px;
      font-size: 14px;
      line-height: 1.5;
      white-space: pre-wrap;
      word-break: break-word;
    }

    .message.user {
      align-self: flex-end;
      background: #6366f1;
      color: #fff;
      border-bottom-right-radius: 4px;
    }

    .message.assistant {
      align-self: flex-start;
      background: #1e1e2a;
      color: #e0e0e8;
      border-bottom-left-radius: 4px;
    }

    .message.system {
      align-self: center;
      background: transparent;
      color: #6b7280;
      font-size: 12px;
      border: 1px dashed #2a2a3a;
    }

    .message.tool {
      align-self: flex-start;
      background: #1a1a24;
      color: #9ca3af;
      border-bottom-left-radius: 4px;
      font-size: 13px;
      font-family: monospace;
    }

    .timestamp {
      font-size: 10px;
      color: #4b5563;
      margin-top: 4px;
      text-align: right;
    }

    .empty {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #4b5563;
      font-size: 14px;
    }

    .input-area {
      display: flex;
      gap: 8px;
      padding: 16px;
      border-top: 1px solid #2a2a3a;
      background: #14141c;
    }

    .input-area input {
      flex: 1;
      padding: 12px 16px;
      background: #1a1a24;
      border: 1px solid #2a2a3a;
      border-radius: 8px;
      color: #e0e0e8;
      font-size: 14px;
      outline: none;
    }

    .input-area input:focus {
      border-color: #6366f1;
    }

    .input-area input::placeholder {
      color: #4b5563;
    }

    .send-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 44px;
      height: 44px;
      background: #6366f1;
      border: none;
      border-radius: 8px;
      color: #fff;
      cursor: pointer;
      flex-shrink: 0;
    }

    .send-btn:hover {
      background: #4f46e5;
    }

    .send-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .loading {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 16px;
      color: #6b7280;
      font-size: 13px;
    }

    .loading-dots {
      display: flex;
      gap: 4px;
    }

    .loading-dots span {
      width: 6px;
      height: 6px;
      background: #6b7280;
      border-radius: 50%;
      animation: bounce 1.4s infinite ease-in-out;
    }

    .loading-dots span:nth-child(1) { animation-delay: -0.32s; }
    .loading-dots span:nth-child(2) { animation-delay: -0.16s; }

    @keyframes bounce {
      0%, 80%, 100% { transform: scale(0); }
      40% { transform: scale(1); }
    }
  `;

  @property({ type: String }) gatewayId!: string;
  @property({ type: String }) sessionKey!: string;

  @state() private messages: Message[] = [];
  @state() private input = '';
  @state() private sending = false;

  private chatBound = false;

  updated(changedProps: Map<string, unknown>): void {
    if (changedProps.has('gatewayId') || changedProps.has('sessionKey')) {
      this.loadHistory();
      this.subscribeToEvents();
    }
  }

  private subscribeToEvents(): void {
    if (this.chatBound) return;
    connectionManager.on('chat-message', (id, sessionKey, message) => {
      if (id !== this.gatewayId || sessionKey !== this.sessionKey) return;
      this.handleNewMessage(message as Message);
    });
    this.chatBound = true;
  }

  async loadHistory(): Promise<void> {
    const client = connectionManager.getClient(this.gatewayId);
    if (!client) return;

    try {
      const history = (await client.getChatHistory(this.sessionKey)) as Message[];
      this.messages = history.map((m) => ({
        id: String(m.id ?? Math.random()),
        role: String(m.role ?? 'assistant'),
        content: String(m.content ?? ''),
        timestamp: Number(m.timestamp ?? Date.now()),
      }));
    } catch (e) {
      console.error('[ChatPanel] Failed to load history:', e);
    }
  }

  private handleNewMessage(message: Message): void {
    // Avoid duplicates
    if (!this.messages.find((m) => m.id === message.id)) {
      this.messages = [...this.messages, message];
    }
  }

  async handleSend(): Promise<void> {
    if (!this.input.trim() || this.sending) return;

    const text = this.input.trim();
    this.input = '';
    this.sending = true;

    // Optimistic add
    const optimisticMsg: Message = {
      id: 'optimistic-' + Date.now(),
      role: 'user',
      content: text,
      timestamp: Date.now(),
    };
    this.messages = [...this.messages, optimisticMsg];

    const client = connectionManager.getClient(this.gatewayId);
    if (!client) {
      this.sending = false;
      return;
    }

    try {
      await client.sendMessage(this.sessionKey, text);
    } catch (e) {
      console.error('[ChatPanel] Send failed:', e);
    } finally {
      this.sending = false;
    }
  }

  private handleKeydown(e: KeyboardEvent): void {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      this.handleSend();
    }
  }

  private formatTime(ts: number): string {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  render() {
    return html`
      <div class="messages">
        ${this.messages.length === 0
          ? html`<div class="empty">No messages yet. Start the conversation!</div>`
          : this.messages.map(
              (m) => html`
                <div class="message ${m.role}">
                  ${m.content}
                  <div class="timestamp">${this.formatTime(m.timestamp)}</div>
                </div>
              `
            )}
        ${this.sending
          ? html`
              <div class="message assistant">
                <div class="loading">
                  <div class="loading-dots"><span></span><span></span><span></span></div>
                  Thinking...
                </div>
              </div>
            `
          : ''}
      </div>

      <div class="input-area">
        <input
          type="text"
          placeholder="Type a message..."
          .value=${this.input}
          @input=${(e: InputEvent) => (this.input = (e.target as HTMLInputElement).value)}
          @keydown=${this.handleKeydown}
        />
        <button class="send-btn" ?disabled=${!this.input.trim() || this.sending} @click=${this.handleSend}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="22" y1="2" x2="11" y2="13"></line>
            <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
          </svg>
        </button>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'chat-panel': ChatPanel;
  }
}
