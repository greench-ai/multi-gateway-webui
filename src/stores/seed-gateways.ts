// seed-gateways.ts - 9-agent fleet pre-seed
// Source: /home/greench/shared/knowledge/architecture/Machines Gateways and tokens.txt
// URLs match the format the user uses to connect (no /ws path) — see how
// Greench connects to Naruto: wss://naruto.greench.net + token.
import type { StoredGateway } from '../core/types';

export const SEED_GATEWAYS: StoredGateway[] = [
  {
    id: 'kojiro',
    name: 'Kojiro ⚡',
    gatewayUrl: 'wss://kojiro.greench-ai.net',
    token: '0a0d736957c67d1e03c332d3343d535d837e4cf676e80e21',
    agentId: 'main',  // BUGFIX 2026-06-03: most lab gateways use 'main' as the GreenchClaw agent id, not the gateway id
    sshUser: 'greench',
    sshHost: '100.123.148.94',
  },
  {
    id: 'fuma',
    name: 'Fuma 🔬',
    gatewayUrl: 'wss://fuma.greench-ai.net',
    token: '96dd977faaf33a995fa4c5b7a190db6b77f0c86b106abac7',
    agentId: 'main',  // BUGFIX 2026-06-03: most lab gateways use 'main' as the GreenchClaw agent id, not the gateway id
    sshUser: 'greench',
    sshHost: '100.123.148.94',
  },
  {
    id: 'sasuke',
    name: 'Sasuke ⚔️',
    gatewayUrl: 'wss://sasuke.greench-ai.net',
    token: '23f972a75606878b665fdd7dd776832c19899be92dfcd190',
    agentId: 'main',  // BUGFIX 2026-06-03: most lab gateways use 'main' as the GreenchClaw agent id, not the gateway id
    sshUser: 'greench',
    sshHost: '100.82.67.48',
  },
  {
    id: 'akuma',
    name: 'Akuma 🔮',
    gatewayUrl: 'wss://akuma.greench-ai.net',
    token: 'c464044ba92f2936ecc61c426733fc6ca1267b84607da99f',
    agentId: 'main',  // BUGFIX 2026-06-03: most lab gateways use 'main' as the GreenchClaw agent id, not the gateway id
    sshUser: 'greench',
    sshHost: '100.124.148.81',
  },
  {
    id: 'gohan',
    name: 'Gohan 🧠',
    gatewayUrl: 'wss://gohan.greench-ai.net',
    token: '8ea210d4aabd7bb20b35c4d2ee61c2f0a8e479033f2fa1a1',
    agentId: 'main',  // BUGFIX 2026-06-03: most lab gateways use 'main' as the GreenchClaw agent id, not the gateway id
    sshUser: 'greench',
    sshHost: '100.124.148.81',
  },
  {
    id: 'naruto',
    name: 'Naruto 🍥',
    gatewayUrl: 'wss://naruto.greench.net',
    token: '19686130016fc2b01f175b0252ef1a63c8259d36211b645c',
    agentId: 'main',  // BUGFIX 2026-06-03: most lab gateways use 'main' as the GreenchClaw agent id, not the gateway id
    sshUser: 'greench',
    sshHost: 'localhost',
  },
  {
    id: 'goten',
    name: 'Goten 🐉',
    gatewayUrl: 'wss://goten.greench-ai.net',
    token: 'd5e695a2c8f91c0303a9d639edc9be29e2ad551b561a0724',
    agentId: 'main',  // BUGFIX 2026-06-03: most lab gateways use 'main' as the GreenchClaw agent id, not the gateway id
    sshUser: 'greench',
    sshHost: 'localhost',
  },
  {
    id: 'akira',
    name: 'Akira 🎨',
    gatewayUrl: 'wss://akira.greench-ai.net',
    token: '7606609f469d1090bb8fd992975a5dc398b3728299be7dde',
    agentId: 'main',  // BUGFIX 2026-06-03: most lab gateways use 'main' as the GreenchClaw agent id, not the gateway id
    sshUser: 'greench',
    sshHost: '100.114.208.83',
  },
  {
    id: 'goku',
    name: 'Goku 🐲',
    gatewayUrl: 'wss://goku.greench-ai.net',
    token: 'ca5c937e3b804e83111ab32dc15025006390debc5d3fc918',
    agentId: 'main',  // BUGFIX 2026-06-03: most lab gateways use 'main' as the GreenchClaw agent id, not the gateway id
    sshUser: 'greench',
    sshHost: '100.114.208.83',
  },
  // Sativabox agents (sativa, indica, firstnexus) — intentionally omitted
  // for now. User's call to skip sativabox until GreenchClaw is installed there.
];
