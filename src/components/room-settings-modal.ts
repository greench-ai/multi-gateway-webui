import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { connectionManager } from '../core/connection-manager';
import { roomsManager } from '../stores/rooms-manager';
import type { Room } from '../core/types';

@customElement('room-settings-modal')
export class RoomSettingsModal extends LitElement {
  static styles = css`
    :host {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.7);
      z-index: 2000;
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

    h3 { margin: 0 0 16px; font-size: 16px; color: #fff; }

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

    .members {
      display: flex;
      flex-direction: column;
      gap: 6px;
      max-height: 200px;
      overflow-y: auto;
      background: #1a1a24;
      border: 1px solid #2a2a3a;
      border-radius: 6px;
      padding: 8px;
    }
    .member { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-radius: 4px; }
    .member:hover { background: #14141c; }

    .row { display: flex; gap: 8px; align-items: center; margin-top: 12px; }
    .row label { margin: 0; flex: 1; text-transform: none; letter-spacing: 0; color: #9ca3af; font-size: 13px; }

    .actions {
      display: flex;
      justify-content: space-between;
      margin-top: 24px;
    }
    .right { display: flex; gap: 8px; }
    .left { display: flex; gap: 8px; }

    button {
      padding: 8px 16px;
      border: none;
      border-radius: 6px;
      font-size: 14px;
      cursor: pointer;
    }
    .cancel { background: transparent; color: #9ca3af; border: 1px solid #2a2a3a; }
    .save { background: #6366f1; color: #fff; }
    .save:disabled { opacity: 0.5; cursor: not-allowed; }
    .danger { background: #ef4444; color: #fff; }
    .archive { background: #f59e0b; color: #14141c; }
  `;

  @property({ attribute: false }) room!: Room;

  @state() private name = '';
  @state() private description = '';
  @state() private members = new Set<string>();
  @state() private shareReplies = false;
  @state() private dirty = false;

  updated(changed: Map<string, unknown>): void {
    if (changed.has('room') && this.room) {
      this.name = this.room.name;
      this.description = this.room.description ?? '';
      this.members = new Set(this.room.members.map((m) => m.agentId));
      this.shareReplies = this.room.shareRepliesWithMembers;
      this.dirty = false;
    }
  }

  private toggle(agentId: string, e: Event): void {
    e.stopPropagation();
    const next = new Set(this.members);
    if (next.has(agentId)) next.delete(agentId); else next.add(agentId);
    this.members = next;
    this.dirty = true;
  }

  private async handleSave(): Promise<void> {
    await roomsManager.updateRoom(this.room.id, {
      name: this.name.trim() || this.room.name,
      description: this.description.trim() || undefined,
      shareRepliesWithMembers: this.shareReplies,
    });
    await roomsManager.setMembers(this.room.id, Array.from(this.members));
    this.dispatchEvent(new CustomEvent('close', { bubbles: true, composed: true }));
  }

  private async handleArchiveToggle(): Promise<void> {
    await roomsManager.updateRoom(this.room.id, { archived: !this.room.archived });
    this.dispatchEvent(new CustomEvent('close', { bubbles: true, composed: true }));
  }

  private async handlePinToggle(): Promise<void> {
    await roomsManager.updateRoom(this.room.id, { pinned: !this.room.pinned });
    // Refresh the local copy so the checkbox state reflects
    const updated = roomsManager.getRoom(this.room.id);
    if (updated) (this as unknown as { room: Room }).room = updated;
  }

  private async handleDelete(): Promise<void> {
    if (!confirm(`Delete room "${this.room.name}"? This removes all messages.`)) return;
    await roomsManager.deleteRoom(this.room.id);
    this.dispatchEvent(new CustomEvent('close', { bubbles: true, composed: true }));
  }

  render() {
    if (!this.room) return html``;
    const allAgents = Array.from(connectionManager.getAllStates().values()).map((s) => s.config);
    return html`
      <div class="modal" @click=${(e: Event) => e.stopPropagation()}>
        <h3>Room Settings</h3>

        <label>Name</label>
        <input
          type="text"
          .value=${this.name}
          @input=${(e: InputEvent) => { this.name = (e.target as HTMLInputElement).value; this.dirty = true; }}
        />

        <label>Description</label>
        <textarea
          rows="2"
          .value=${this.description}
          @input=${(e: InputEvent) => { this.description = (e.target as HTMLTextAreaElement).value; this.dirty = true; }}
        ></textarea>

        <label>Members</label>
        <div class="members">
          ${allAgents.map(
            (g) => html`
              <label class="member">
                <input
                  type="checkbox"
                  .checked=${this.members.has(g.id)}
                  @change=${(e: Event) => this.toggle(g.id, e)}
                />
                <span>${g.name} <span style="color:#6b7280;font-size:12px;">${g.id}</span></span>
              </label>
            `
          )}
        </div>

        <div class="row">
          <input
            type="checkbox"
            id="pin"
            .checked=${this.room.pinned}
            @change=${() => this.handlePinToggle()}
          />
          <label for="pin">Pin to top</label>
        </div>

        <div class="row">
          <input
            type="checkbox"
            id="share"
            .checked=${this.shareReplies}
            @change=${(e: Event) => { this.shareReplies = (e.target as HTMLInputElement).checked; this.dirty = true; }}
          />
          <label for="share">Share replies with members</label>
        </div>

        <div class="actions">
          <div class="left">
            <button class="danger" @click=${() => this.handleDelete()}>Delete</button>
            <button class="archive" @click=${() => this.handleArchiveToggle()}>
              ${this.room.archived ? 'Unarchive' : 'Archive'}
            </button>
          </div>
          <div class="right">
            <button class="cancel" @click=${() => this.dispatchEvent(new CustomEvent('close', { bubbles: true, composed: true }))}>Cancel</button>
            <button class="save" ?disabled=${!this.dirty} @click=${() => this.handleSave()}>Save</button>
          </div>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'room-settings-modal': RoomSettingsModal;
  }
}
