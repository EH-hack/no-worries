# No Worries - AI Agent for Group Planning

## Project Overview
**Type**: Hackathon POC
**Purpose**: AI agent for group planning integrated with Luffa (blockchain-enabled messaging service)
**Hosting**: Railway
**Status**: Starting from scratch

## What is Luffa?
- Blockchain-enabled messaging platform built on Endless blockchain (Move programming language)
- End-to-end encrypted messaging
- Supports channels, groups, and supergroups
- Has bot/mini-program capabilities
- Can integrate with OpenClaw for AI agent deployment
- Acts as the **frontend** for this project (users interact via Luffa groups)

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     LUFFA (Frontend)                        │
│              Users message in groups/channels               │
└────────────────────┬────────────────────────────────────────┘
                     │
                     │ Webhook/Polling
                     ↓
┌─────────────────────────────────────────────────────────────┐
│              RAILWAY-HOSTED BACKEND                         │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  HTTP Server (Express/FastAPI)                      │   │
│  │  - Receives messages from Luffa                     │   │
│  │  - Routes to AI Agent                               │   │
│  │  - Sends responses back                             │   │
│  └────────────┬────────────────────────────────────────┘   │
│               │                                             │
│  ┌────────────▼────────────────────────────────────────┐   │
│  │  AI Agent (Group Planning Logic)                    │   │
│  │  - Natural language understanding                   │   │
│  │  - Planning features (scheduling, voting, etc)      │   │
│  │  - Context management                               │   │
│  └────────────┬────────────────────────────────────────┘   │
│               │                                             │
│  ┌────────────▼────────────────────────────────────────┐   │
│  │  JSON File Storage (POC/Hackathon)                  │   │
│  │  - conversations.json                               │   │
│  │  - plans.json                                       │   │
│  │  - users.json                                       │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## Data Flow

1. **User sends message in Luffa group** → "Let's plan dinner for Friday"
2. **Luffa forwards to Railway** → HTTP POST to webhook endpoint
3. **Server receives & parses** → Extract message, user, group context
4. **Load context from JSON** → Read conversations.json, plans.json
5. **AI Agent processes** → Generate response based on group planning needs
6. **Update JSON storage** → Save new message, update plan state
7. **Send response to Luffa** → API call back to Luffa
8. **User sees AI response** → "Great! I'll help coordinate. What time works for everyone?"

## Technology Stack (TBD - To be decided with developer)

### Backend Options:
- **Python + FastAPI** (recommended for AI integration)
  - Lightweight, async, easy Railway deployment
  - Good AI/ML library ecosystem
- **Node.js + Express** (alternative)
  - Fast, simple, JSON-native

### AI Integration:
- Anthropic Claude API (or OpenAI)
- LangChain (optional, for more complex agents)

### Storage:
- JSON files (POC phase)
- Future: SQLite → PostgreSQL

## Core Features (POC Scope)

1. **Event Scheduling**
   - Parse date/time from natural language
   - Collect availability from group members
   - Find common time slots

2. **Decision Making**
   - Voting on options (e.g., restaurant, activity)
   - Track responses
   - Announce results

3. **Task Coordination**
   - Create task lists for group activities
   - Assign responsibilities
   - Track completion

4. **Context Awareness**
   - Remember ongoing plans per group
   - Track user preferences
   - Maintain conversation history

## Luffa Integration Notes

### What We Know:
- Luffa supports bot/mini-program development
- Can integrate with AI agents (OpenClaw mentioned)
- End-to-end encrypted (important for design)

### What We Need:
- [ ] Luffa API documentation (from hackathon organizers)
- [ ] Bot creation process
- [ ] Webhook setup OR polling mechanism
- [ ] Authentication/API keys
- [ ] Message format specification
- [ ] How to send messages back to groups

### Integration Method (TBD):
- **Option A**: Webhook (Luffa pushes messages to our Railway endpoint)
- **Option B**: Polling (our agent periodically checks Luffa for new messages)
- **Option C**: Bot API (native Luffa bot account)

## Railway Deployment

Railway provides:
- Simple deployment from Git
- Environment variables for secrets
- Auto-scaling
- HTTPS endpoints
- Good for hackathon speed

## JSON Storage Schema (Draft)

### conversations.json
```json
{
  "group_id_123": {
    "messages": [
      {
        "id": "msg_001",
        "user_id": "user_456",
        "username": "Alice",
        "text": "Let's plan dinner",
        "timestamp": "2026-03-20T20:00:00Z"
      }
    ],
    "context": {
      "active_plans": ["plan_789"],
      "last_activity": "2026-03-20T20:00:00Z"
    }
  }
}
```

### plans.json
```json
{
  "plan_789": {
    "group_id": "group_id_123",
    "type": "event_scheduling",
    "title": "Friday Dinner",
    "status": "collecting_responses",
    "created_at": "2026-03-20T20:00:00Z",
    "data": {
      "event_time": null,
      "location": null,
      "attendees": [],
      "responses": {}
    }
  }
}
```

### users.json
```json
{
  "user_456": {
    "username": "Alice",
    "preferences": {
      "timezone": "America/New_York",
      "dietary_restrictions": []
    },
    "groups": ["group_id_123"]
  }
}
```

## Development Phases

### Phase 1: Basic Setup ✓
- [x] Create CLAUDE.md
- [ ] Set up project structure
- [ ] Initialize Git repo with first commit

### Phase 2: Core Backend
- [ ] Create HTTP server with health check endpoint
- [ ] Implement JSON storage layer
- [ ] Test local server

### Phase 3: AI Agent
- [ ] Integrate AI API (Claude/OpenAI)
- [ ] Implement group planning logic
- [ ] Test with mock messages

### Phase 4: Luffa Integration
- [ ] Get Luffa API credentials
- [ ] Implement message receiving
- [ ] Implement message sending
- [ ] End-to-end test

### Phase 5: Polish & Deploy
- [ ] Deploy to Railway
- [ ] Test with real Luffa group
- [ ] Fix bugs, improve responses
- [ ] Prepare demo

## Questions to Resolve

1. **Luffa API Access**: How do we get developer credentials?
2. **Message Format**: What's the exact structure of Luffa messages?
3. **AI Provider**: Claude vs OpenAI vs other?
4. **Language**: Python vs Node.js?
5. **Deployment**: Railway config needs?

## Notes & Learnings

- Luffa is relatively new/emerging platform (limited public docs)
- Endless blockchain uses Move language (like Sui/Aptos)
- Privacy-focused (E2EE) - can't read message content on blockchain
- Hackathon likely provides special developer access/docs

---

**Last Updated**: 2026-03-20
**Next Steps**: Set up project structure and choose tech stack
