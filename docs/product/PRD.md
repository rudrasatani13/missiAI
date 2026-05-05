# missiAI - Product Scope

## Overview
missiAI is a live voice AI companion. Users can have real-time voice conversations with Gemini AI, with theme support and minimal settings.

## Architecture
- **Frontend**: Next.js 15 (React, TypeScript)
- **Auth**: Clerk
- **Storage**: Cloudflare KV (`MISSI_MEMORY`)
- **Deployment**: OpenNext Cloudflare + custom worker entry
- **AI**: Gemini via Vertex AI (chat, STT, TTS, Gemini Live)

## Features

- **Live Voice**: Real-time voice conversations with Gemini Live, STT, TTS, and voice UI
- **Theme Support**: Dark, light, and system theme options
- **Settings**: Voice toggle, theme selection, analytics opt-in
- **Guest Chat**: Limited guest access (5 messages per 24 hours)
- **Authentication**: Clerk-based auth for full access

## Backlog / Future
- Voice activity detection improvements
- Additional voice languages
- Voice activity visualization
