import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { connectionManager } from '../core/connection-manager';
import { roomsManager } from '../stores/rooms-manager';

@customElement('room-create-modal')
export class RoomCreateModal extends LitElement {
  static styles = css`
    :host {
      display: block;
      position: fixed;
      inset: 0;
      z-index: 2000;
      background: rgba(0, 0, 0, 0.7);
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .modal {
      background: #14141c;
      border: 1px solid #2a2a3a;
      border-radius: 12px;
      padding: 24px;
      width: 480px;
      max-width: 90vw;
      max-height: 85vh;
      overflow-y: auto;
      color: #e0e0e8;
    }

    h3 {
      margin: 0 0 16px;
      font-size: 16px;
      color: #fff;
    }

    label {
      display: block;
      font-size: 12px;
      color: #6b7280;
      margin: 12px 0 4px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    input[type="text"], textarea {
      width: 100%;
      padding: 10px 12px;
      background: #1a1a24;
      border: 1px solid #2a2a3a;
      border-radius: 6px;
      color: #e0e0e8;
      font-size: 14px;
      outline: none;
      box-sizing: border-box;
      font-family: inherit;
    }
    input[type="text"]:focus, textarea:focus { border-color: #6366f1; }

    .members {
      display: flex;
      flex-direction: column;
      gap: 6px;
      max-height: 240px;
      overflow-y: auto;
      background: #1a1a24;
      border: 1px solid #2a2a3a;
      border-radius: 6px;
      padding: 8px;
    }

    .member {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 8px;
      border-radius: 4px;
    }
    .member:hover { background: #14141c; }

    .toggle {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 12px;
      font-size: 13px;
      color: #9ca3af;
    }

    .actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 20px;
    }

    button {
      padding: 8px 16px;
      border: none;
      border-radius: 6px;
      font-size: 14px;
      cursor: pointer;
    }
    .cancel { background: transparent; color: #9ca3af; border: 1px solid #2a2a3a; }
    .cancel:hover { background: #1e1e2a; }
    .create { background: #6366f1; color: #fff; }
    .create:hover { background: #4f46e5; }
    .create:disabled { opacity: 0.5; cursor: not-allowed; }
  `;

  @state() private name = '';
  @state() private description = '';
  @state() private selected = new Set<string>();
  @state() private shareReplies = false;
  @state() private creating = false;
  @state() private error = '';

  private toggle(agentId: string, e: Event): void {
    e.stopPropagation();
    const next = new Set(this.selected);
    if (next.has(agentId)) next.delete(agentId); else next.add(agentId);
    this.selected = next;
  }

  private async handleCreate(): Promise<void> {
    const name = this.name.trim();
    if (!name || this.selected.size === 0) return;
    this.creating = true;
    try {
      const room = await roomsManager.createRoom({
        name,
        description: this.description.trim() || undefined,
        members: Array.from(this.selected),
        shareRepliesWithMembers: this.shareReplies,
      });
      this.dispatchEvent(new CustomEvent('created', { detail: { id: room.id }, bubbles: true, composed: true }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.error = msg;
      console.error('[room-create-modal] create failed', e);
    } finally {
      this.creating = false;
    }
  }

  render() {
    const allAgents = Array.from(connectionManager.getAllStates().values()).map((s) => s.config);
    return html`
      <div class="modal" @click=${(e: Event) => e.stopPropagation()}>
        <h3>New Room</h3>

        <label>Name</label>
        <input
          type="text"
          placeholder="e.g. HubClaw build"
          .value=${this.name}
          @input=${(e: InputEvent) => (this.name = (e.target as HTMLInputElement).value)}
        />

        <label>Description (optional)</label>
        <textarea
          rows="2"
          placeholder="What is this room for?"
          .value=${this.description}
          @input=${(e: InputEvent) => (this.description = (e.target as HTMLTextAreaElement).value)}
        ></textarea>

        <label>Members</label>
        <div class="members">
          ${allAgents.length === 0
            ? html`<div style="padding:8px;font-size:13px;color:#6b7280;">No gateways connected. Connect gateways first.</div>`
            : allAgents.map(
                (g) => html`
                  <label class="member">
                    <input
                      type="checkbox"
                      .checked=${this.selected.has(g.id)}
                      @change=${(e: Event) => this.toggle(g.id, e)}
                    />
                    <span>${g.name} <span style="color:#6b7280;font-size:12px;">${g.id}</span></span>
                  </label>
                `
              )}
        </div>

        <label class="toggle">
          <input
            type="checkbox"
            .checked=${this.shareReplies}
            @change=${(e: Event) => (this.shareReplies = (e.target as HTMLInputElement).checked)}
          />
          Share replies with members (each agent sees the others' replies as prior context)
        </label>

        ${this.error
          ? html`<div style="background:#7f1d1d;color:#fecaca;padding:10px 12px;border-radius:6px;font-size:13px;margin-top:16px;font-family:monospace;">⚠ ${this.error}</div>`
          : ''}

        <div class="actions">
          <button class="cancel" @click=${() => this.dispatchEvent(new CustomEvent('close', { bubbles: true, composed: true }))}>Cancel</button>
          <button class="create" ?disabled=${!this.name.trim() || this.selected.size === 0 || this.creating} @click=${() => this.handleCreate()}>
            ${this.creating ? 'Creating…' : `Create Room (${this.selected.size} selected)`}
          </button>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'room-create-modal': RoomCreateModal;
  }
}
