# HubClaw Multi-Gateway — First Run Guide

The WebUI is live at **http://localhost:18790/**. The 9-agent fleet is
pre-seeded. You should see 9 orange "pairing-required" cards on first
load. Here's exactly what to do.

## What you'll see

9 cards, each with:
- Agent name (Kojiro, Fuma, Sasuke, Akuma, Gohan, Naruto, Goten, Akira, Goku)
- Public gateway URL
- An orange command box with the exact `ssh … GreenchClaw devices approve <id>` command

## The flow (per gateway, ~10 seconds each)

1. Click the 📋 button next to the command to copy it
2. Paste into a terminal on **aspire** (since aspire is the hub)
3. Run it. It SSHes to the gateway host and approves the pending pairing
4. Click the card in the WebUI to re-select it — it'll auto-retry
   (or close+reopen the WebUI tab)

Once approved, the device persists in the gateway's pairing list, so you
only do this once per (WebUI, gateway) pair. If you clear your browser's
IndexedDB (`hubclaw-crypto`), the device key regenerates and you'll need
to re-approve.

## Expected outcome per host

| # | Agent | Host | SSH target | One-time approve command template |
|---|-------|------|------------|-----------------------------------|
| 1 | Kojiro | greench WSL2 | `greench@100.123.148.94` | `ssh greench@100.123.148.94 '/home/greench/bin/GreenchClaw devices list \| grep -B1 "pending" \| head'` |
| 2 | Fuma | greench WSL2 | same host, different agent | (same) |
| 3 | Sasuke | greench-1 | `greench@100.82.67.48` | `ssh greench@100.82.67.48 '/home/greench/bin/GreenchClaw devices list \| grep "Pending"'` |
| 4 | Akuma | acer | `greench@100.124.148.81` | (same pattern) |
| 5 | Gohan | acer | same host | (same pattern) |
| 6 | Naruto | aspire | `greench@localhost` | `GreenchClaw devices list` |
| 7 | Goten | aspire | same host | (same pattern) |
| 8 | Akira | storage | `greench@100.114.208.83` | (same pattern) |
| 9 | Goku | storage | same host | (same pattern) |

The WebUI's copy button will give you the **exact** command with the
request-id filled in.

## After all 9 are approved

You should see all 9 cards turn green with `connected` status. Then I
can:
- Add a chat panel that talks to **any** of the 9 agents
- Add rooms (grouped chats that ping multiple agents at once)
- Wire it up to the Brainclaw hub on `acebrain.greench-ai.net:3002`
  for cross-agent coordination

## Sativabox

3 agents skipped for now (Sativa, Indica, FirstNexus). When you want
them in, the gateway infrastructure on sativabox needs to come up
first.

## Stopping the WebUI

```bash
pkill -f "vite preview"
```
