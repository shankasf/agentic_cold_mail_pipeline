# Agentic Cold Mail Pipeline

A production-ready admin dashboard for generating personalized cold emails using OpenAI's Multi-Agent SDK. The system ingests business data from various file formats, extracts entities, and generates demo-booking emails with compliance checks.

---

## 🔄 Application Workflow

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           AGENTIC COLD MAIL PIPELINE                            │
└─────────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────────────┐
│  PHASE 1: DATA INGESTION                                                         │
└──────────────────────────────────────────────────────────────────────────────────┘

     ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐
     │  CSV    │    │  XLSX   │    │   PDF   │    │   TXT   │
     └────┬────┘    └────┬────┘    └────┬────┘    └────┬────┘
          │              │              │              │
          └──────────────┴──────────────┴──────────────┘
                                  │
                                  ▼
                    ┌─────────────────────────┐
                    │     FILE PARSER         │
                    │  (Chunk & Deduplicate)  │
                    └───────────┬─────────────┘
                                │
                                ▼
                    ┌─────────────────────────┐
                    │    PARSED CHUNKS        │
                    │  (Stored in Database)   │
                    └───────────┬─────────────┘
                                │
┌───────────────────────────────┴──────────────────────────────────────────────────┐
│  PHASE 2: AI MULTI-AGENT PIPELINE                                                │
└──────────────────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
          ┌─────────────────────────────────────────────────┐
          │            🤖 AGENT 1: ENTITY RESOLVER          │
          │  ─────────────────────────────────────────────  │
          │  • Extracts businesses from text chunks         │
          │  • Identifies contacts (emails, names, roles)   │
          │  • Creates evidence links to source chunks      │
          │  • Assigns confidence scores (0-100)            │
          └────────────────────┬────────────────────────────┘
                               │
                               ▼
          ┌─────────────────────────────────────────────────┐
          │           🤖 AGENT 2: BUSINESS ANALYZER         │
          │  ─────────────────────────────────────────────  │
          │  • Analyzes each business's context             │
          │  • Selects top 3 personalization facts          │
          │  • Infers pain points from industry data        │
          │  • Matches with industry playbooks              │
          └────────────────────┬────────────────────────────┘
                               │
                               ▼
          ┌─────────────────────────────────────────────────┐
          │            🤖 AGENT 3: EMAIL WRITER             │
          │  ─────────────────────────────────────────────  │
          │  • Generates personalized cold email            │
          │  • Enforces 70-110 word limit                   │
          │  • Includes single Calendly CTA link            │
          │  • Uses only evidence-backed facts              │
          └────────────────────┬────────────────────────────┘
                               │
                               ▼
          ┌─────────────────────────────────────────────────┐
          │          🤖 AGENT 4: COMPLIANCE CHECKER         │
          │  ─────────────────────────────────────────────  │
          │  • Scans for spam trigger words                 │
          │  • Validates word count & link structure        │
          │  • Checks footer format compliance              │
          │  • Calculates deliverability score (0-100)      │
          └────────────────────┬────────────────────────────┘
                               │
                               ▼
          ┌─────────────────────────────────────────────────┐
          │            🤖 AGENT 5: GATEKEEPER               │
          │  ─────────────────────────────────────────────  │
          │  • Reviews confidence & deliverability scores   │
          │  • Makes final decision:                        │
          │    → APPROVED (scores ≥ 70%)                    │
          │    → NEEDS_REVIEW (scores < 70%)                │
          │    → DRAFT (incomplete data)                    │
          └────────────────────┬────────────────────────────┘
                               │
┌──────────────────────────────┴───────────────────────────────────────────────────┐
│  PHASE 3: HUMAN REVIEW & APPROVAL                                                │
└──────────────────────────────────────────────────────────────────────────────────┘
                               │
                               ▼
          ┌─────────────────────────────────────────────────┐
          │              📊 ADMIN DASHBOARD                 │
          │  ─────────────────────────────────────────────  │
          │  • View all generated emails                    │
          │  • Filter by status, industry, scores           │
          │  • Edit subject/body with live re-scoring       │
          │  • View source evidence for each fact           │
          │  • Approve or reject emails                     │
          └────────────────────┬────────────────────────────┘
                               │
                ┌──────────────┴──────────────┐
                ▼                             ▼
     ┌──────────────────┐          ┌──────────────────┐
     │    ✅ APPROVED   │          │   📝 EXPORTED    │
     └────────┬─────────┘          └────────┬─────────┘
              │                             │
              ▼                             ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│  PHASE 4: DELIVERY                                                               │
└──────────────────────────────────────────────────────────────────────────────────┘
              │                             │
              ▼                             ▼
     ┌──────────────────┐          ┌──────────────────┐
     │   📧 AWS SES     │          │   📄 CSV/PDF     │
     │   SMTP Send      │          │   Export Files   │
     │  (100/day cap)   │          │                  │
     └────────┬─────────┘          └──────────────────┘
              │
              ▼
     ┌──────────────────┐
     │  📬 WEBHOOK      │
     │  Bounce/Complaint│
     │  Handling        │
     └──────────────────┘
```

---

## 📊 Data Flow Diagram

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Frontend  │────▶│  Next.js    │────▶│  PostgreSQL │
│  (React UI) │◀────│  API Routes │◀────│  (Prisma)   │
└─────────────┘     └──────┬──────┘     └─────────────┘
                          │
                          │ HTTP
                          ▼
                   ┌─────────────┐
                   │  AI Service │
                   │  (FastAPI)  │
                   └──────┬──────┘
                          │
                          │ OpenAI API
                          ▼
                   ┌─────────────┐
                   │   OpenAI    │
                   │  GPT-4o     │
                   └─────────────┘

┌─────────────┐     ┌─────────────┐
│   BullMQ    │────▶│    Redis    │
│   Workers   │◀────│   (Queue)   │
└─────────────┘     └─────────────┘
```

---

## 🎯 Email Status Lifecycle

```
    ┌──────────┐
    │  DRAFT   │ ─── Initial state after generation
    └────┬─────┘
         │
         ▼
┌────────────────┐
│  NEEDS_REVIEW  │ ─── Low confidence/deliverability score
└────────┬───────┘
         │ (Admin reviews & edits)
         ▼
   ┌───────────┐
   │ APPROVED  │ ─── Ready for sending
   └─────┬─────┘
         │
    ┌────┴────┐
    ▼         ▼
┌───────┐ ┌──────────┐
│ SENT  │ │ EXPORTED │
└───┬───┘ └──────────┘
    │
    ▼
┌─────────────────────┐
│ BOUNCED / COMPLAINT │ ─── Via SES webhook
└─────────────────────┘
```

---

## Features

### Multi-Agent AI Pipeline
7 specialized agents using OpenAI Agents SDK:
- **Entity Resolver**: Extracts businesses, contacts, and evidence from data
- **Business Analyzer**: Analyzes businesses and selects personalization facts
- **Email Writer**: Generates 70-110 word cold emails
- **Compliance Checker**: Validates deliverability and spam compliance
- **Gatekeeper**: Makes final approval decisions
- **Column Mapper**: AI-powered CSV/Excel column detection and mapping
- **Template Generator**: Generates email templates from uploaded documents

### Two Email Pipelines
1. **Agentic Pipeline**: Full multi-agent generation with personalization
2. **Template Pipeline**: Fast bulk emails using predefined templates with variable substitution

### Campaign & Lead Management
- **Campaign Management**: Create, organize, and track email campaigns
- **Lead Management**: Import leads via CSV, manage lead lifecycle, bulk actions
- **AI-Powered Lead Enrichment**: Enrich lead data using AI prompts
- **Lead Tagging**: Organize leads with custom tags for segmentation

### Multi-Identity Email Sending
- **SES Identity Management**: Configure multiple sender identities/inboxes
- **Round-Robin Distribution**: Evenly distribute emails across all SES identities
- **Protected Identities**: Mark certain identities as protected (reply-only)
- **Per-Identity Daily Limits**: Configure daily sending caps per identity
- **Approve & Send Now**: Instantly approve and send AI-generated follow-ups with even distribution

### Real-Time AI Generation
- **SSE Streaming**: Server-Sent Events for real-time email generation progress
- **Live Progress Modal**: Visual progress indicators during AI email generation
- **Redis Pub/Sub**: Real-time progress updates between API and frontend

### Performance Optimizations
- **Database Indexes**: 20+ indexes for fast queries on businesses, contacts, emails, and events
- **Redis Caching**: Analytics cached for 5 minutes (90% DB load reduction)
- **SWR Data Fetching**: Request deduplication and stale-while-revalidate pattern
- **HTTP Cache Headers**: Browser-level caching on all major endpoints

### Comprehensive Logging & Error Handling
- **Structured Logging**: Request-scoped logging with correlation IDs
- **Prisma Error Mapping**: User-friendly error messages for database errors
- **API Handler Wrapper**: Consistent error handling across all API routes

### Core Features
- **File Ingestion**: Supports TXT, CSV, XLSX, JSON, TSV, and PDF files
- **Smart Column Mapping**: AI detects and maps columns automatically (with fallback to synonyms)
- **Evidence-First Design**: All personalization is traceable to source data
- **Admin Dashboard**: Upload files, review emails, approve, export, and send
- **Email Threading**: Track conversations and follow-up emails
- **Unified Inbox (Unibox)**: View all inbound/outbound emails in one place
- **AWS SES Integration**: SMTP-based email sending with bounce/complaint handling
- **Background Workers**: BullMQ-powered job processing
- **Role-Based Access**: Admin and Sales Rep roles with appropriate permissions

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | Next.js 14, React 18, TypeScript 5, Tailwind CSS |
| **Data Fetching** | SWR (stale-while-revalidate) |
| **Backend** | Next.js API Routes + Python FastAPI |
| **Database** | PostgreSQL with Prisma ORM (20+ indexes) |
| **Caching** | Redis (analytics, session, pub/sub) |
| **Queue** | BullMQ + Redis |
| **AI** | OpenAI Agents SDK (Python) |
| **Email** | AWS SES SMTP + Multi-Identity Support |
| **Auth** | JWT (jose) + bcrypt |
| **Testing** | Vitest + Testing Library |
| **CI/CD** | GitHub Actions (lint, typecheck, test, deploy) |
| **Infrastructure** | Kubernetes (K3s), Traefik Ingress, Docker |

## Project Structure

```
email_marketing/
├── .env                      # Environment variables
├── .github/                  # CI/CD workflows
│   └── workflows/
│       ├── ci.yml            # Lint, typecheck, test
│       └── cd.yml            # Build and deploy
├── frontend/                 # Next.js application
│   ├── package.json
│   ├── Dockerfile            # Production Docker image
│   ├── prisma/
│   │   ├── schema.prisma     # Database schema with indexes
│   │   └── migrations/       # Database migrations
│   └── src/
│       ├── app/
│       │   ├── api/          # API routes
│       │   │   ├── campaigns/    # Campaign management
│       │   │   ├── leads/        # Lead management
│       │   │   ├── identities/   # SES identity management
│       │   │   └── emails/       # Email operations
│       │   │       ├── queue-distributed/  # Even distribution
│       │   │       ├── follow-up/          # AI follow-ups
│       │   │       └── threads/            # Email threads
│       │   ├── dashboard/    # Dashboard pages
│       │   │   ├── campaigns/    # Campaign views
│       │   │   ├── leads/        # Lead management UI
│       │   │   ├── identities/   # SES identity UI
│       │   │   └── unibox/       # Unified inbox
│       │   └── login/        # Auth pages
│       ├── components/       # React components
│       │   └── leads/        # Lead-specific components
│       │       ├── EmailGenerationModal.tsx  # AI generation modal
│       │       ├── BulkActionsMenu.tsx       # Bulk operations
│       │       └── LeadDetailPanel.tsx       # Lead details
│       └── lib/
│           ├── prisma.ts     # Database client
│           ├── redis.ts      # Redis + pub/sub for SSE
│           ├── swr.ts        # SWR hooks for data fetching
│           ├── queue.ts      # BullMQ job queues
│           ├── worker.ts     # Background worker
│           ├── email-sender.ts   # Email distribution logic
│           ├── ses.ts        # AWS SES integration
│           ├── api-utils.ts  # API handler wrapper
│           ├── errors.ts     # Error handling utilities
│           ├── logger.ts     # Structured logging
│           └── auth-utils.ts # Auth utilities
└── ai-service/               # Python AI service
    ├── requirements.txt
    ├── main.py               # FastAPI server
    ├── pipeline.py           # Multi-agent orchestration
    ├── config.py             # Configuration management
    ├── schemas.py            # Pydantic models
    └── email_agents/         # AI Agents
        ├── entity_resolver.py
        ├── business_analyzer.py
        ├── email_writer.py
        ├── compliance_checker.py
        ├── gatekeeper.py
        ├── column_mapper.py      # CSV column mapping
        └── template_generator.py # Template generation
```

## Quick Start

### Prerequisites

- Node.js 18+
- Python 3.9+
- PostgreSQL 14+
- Redis 6+

### 1. Clone and Install

```bash
cd email_marketing

# Install frontend dependencies
cd frontend
npm install

# Install AI service dependencies
cd ../ai-service
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 2. Configure Environment

Edit the `.env` file in the root directory:

```env
# Database
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/email_marketing"

# Redis
REDIS_URL="redis://localhost:6379"

# OpenAI
OPENAI_API_KEY="sk-your-openai-api-key-here"

# AWS SES SMTP
SMTP_HOST="email-smtp.us-east-1.amazonaws.com"
SMTP_PORT=587
SMTP_USER="your-smtp-user"
SMTP_PASS="your-smtp-password"
SMTP_FROM="hello@callsphere.tech"

# App Configuration
CALENDLY_URL="https://calendly.com/sagar-callsphere/new-meeting"
BUSINESS_ADDRESS="27 Orchard Pl, New York, NY 12601"
SENDER_NAME="CallSphere"
```

### 3. Setup Database

```bash
cd frontend
npx prisma generate
npx prisma db push
```

### 4. Start Services

In separate terminals:

```bash
# Terminal 1: Start Redis (if not running)
redis-server

# Terminal 2: Start AI Service
cd ai-service
source venv/bin/activate
python main.py

# Terminal 3: Start Next.js
cd frontend
npm run dev

# Terminal 4: Start Background Worker
cd frontend
npm run worker
```

### 5. Access Dashboard

Open http://localhost:3000 in your browser.

## Usage

### 1. Upload Files

Navigate to **Uploads** and upload business data files (CSV, XLSX, TXT, PDF).

### 2. Generate Emails

After files are parsed, click "Generate Emails" to run the AI pipeline.

### 3. Review Emails

In the **Emails** page:
- Filter by status (Draft, Needs Review, Approved)
- Click on an email to view details and edit
- Review evidence and spam flags
- Approve emails that meet thresholds

### 4. Export

Export emails as CSV or PDF from the **Exports** page.

### 5. Send

Approved emails can be sent via the Send API (respects 100/day cap).

## API Endpoints

### Frontend API (Next.js)

#### Core Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/uploads` | POST | Upload a file |
| `/api/uploads/[id]/generate` | POST | Generate emails from upload |
| `/api/emails` | GET | List email drafts |
| `/api/emails/[id]` | PATCH | Update email draft |
| `/api/emails/[id]/approve` | POST | Approve email |
| `/api/emails/send` | POST | Queue emails for sending |
| `/api/exports/csv` | GET | Export as CSV |
| `/api/exports/pdf/[id]` | GET | Export single email as PDF |
| `/api/analytics` | GET | Dashboard analytics |
| `/api/webhooks/ses-firehose` | POST | SES events webhook (Kinesis Firehose) |
| `/api/webhooks/ses-inbound` | POST | Inbound email webhook (Lambda S3 trigger) |
| `/api/attachments/[id]` | GET | Download email attachment |

#### Campaign & Lead Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/campaigns` | GET/POST | List/create campaigns |
| `/api/campaigns/[id]` | GET/PATCH/DELETE | Campaign CRUD |
| `/api/campaigns/[id]/leads` | GET | Get leads for campaign |
| `/api/campaigns/[id]/leads/generate-emails` | POST | Generate emails for leads |
| `/api/leads` | GET/POST | List/create leads |
| `/api/leads/[id]` | GET/PATCH/DELETE | Lead CRUD |
| `/api/leads/import` | POST | Bulk import leads from CSV |
| `/api/leads/bulk-update` | PATCH | Bulk update lead fields |

#### SES Identity & Distribution Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/identities` | GET/POST | List/create SES identities |
| `/api/identities/[id]` | PATCH/DELETE | Update/delete identity |
| `/api/emails/queue-distributed` | POST | Queue emails with even distribution |
| `/api/emails/queue-distributed` | GET | Get quota status for all identities |

#### Real-Time & Streaming Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/emails/follow-up/ai-generate` | POST | Generate AI follow-up emails |
| `/api/emails/follow-up/ai-generate/progress` | GET | SSE stream for generation progress |
| `/api/emails/threads` | GET | Get email threads by business |

### AI Service API (FastAPI)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/config` | GET | Get AI service config |
| `/generate` | POST | Run multi-agent pipeline |
| `/recheck-compliance` | POST | Recheck email compliance |
| `/map-columns` | POST | AI-powered CSV column mapping |
| `/generate-templates` | POST | Generate email templates from documents |

## Email Generation Rules

- **Word Count**: 70-110 words
- **Link**: Exactly one Calendly link
- **CTA**: Must include "book a demo"
- **No Unsubscribe**: Cold email, no unsubscribe text
- **Footer**: Company name + address only
- **Personalization**: Only facts supported by evidence

## Thresholds

- **Confidence Threshold**: 70% (emails below need review)
- **Deliverability Threshold**: 70% (required for approval)
- **Daily Sending Cap**: 100 emails/day

## CI/CD Pipeline

The project uses GitHub Actions for continuous integration and deployment.

### Pipeline Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           CI/CD PIPELINE                                     │
└─────────────────────────────────────────────────────────────────────────────┘

  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
  │   Push to   │────▶│     CI      │────▶│     CD      │────▶│   Deploy    │
  │    main     │     │  (Checks)   │     │   (Build)   │     │   (K3s)     │
  └─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
                            │
                            ▼
                   ┌─────────────────┐
                   │  • ESLint       │
                   │  • TypeScript   │
                   │  • Vitest       │
                   └─────────────────┘
```

### CI Workflow (`.github/workflows/ci.yml`)

Runs on every push to `main` branch:

| Step | Description |
|------|-------------|
| **Checkout** | Clone repository |
| **Setup Node.js** | Install Node.js 20 |
| **Install Dependencies** | `npm ci` with cached node_modules |
| **ESLint** | Lint code with `npm run lint` |
| **TypeScript** | Type check with `npx tsc --noEmit` |
| **Vitest** | Run unit tests with `npm test` |

### CD Workflow (`.github/workflows/cd.yml`)

Runs after CI passes:

| Step | Description |
|------|-------------|
| **Build Docker Image** | Build production Next.js image |
| **Push to Registry** | Push to container registry |
| **Deploy to K3s** | Rolling update deployment |
| **Health Check** | Verify deployment is healthy |

### Workflow Files

```yaml
# .github/workflows/ci.yml
name: CI
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  lint-and-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: frontend/package-lock.json
      - run: npm ci
        working-directory: frontend
      - run: npm run lint
        working-directory: frontend
      - run: npx tsc --noEmit
        working-directory: frontend
      - run: npm test
        working-directory: frontend
```

### Branch Protection

The `main` branch is protected with:
- Required CI checks to pass
- No direct pushes (PR required for team workflows)
- Auto-deploy on merge to main

---

## Production Deployment

### Kubernetes (K3s)

The application is deployed on Kubernetes with the following components:

```
┌─────────────────────────────────────────────────────────────┐
│                    email-marketing namespace                 │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │  frontend   │  │ ai-service  │  │   worker    │         │
│  │  (Next.js)  │  │  (FastAPI)  │  │  (BullMQ)   │         │
│  └──────┬──────┘  └──────┬──────┘  └─────────────┘         │
│         │                │                                   │
│         └────────┬───────┘                                   │
│                  ▼                                           │
│  ┌─────────────────────────────────────────────────┐       │
│  │              Traefik Ingress                     │       │
│  │         marketing.callsphere.tech                │       │
│  └─────────────────────────────────────────────────┘       │
│                                                             │
│  ┌─────────────┐  ┌─────────────┐                          │
│  │  PostgreSQL │  │    Redis    │                          │
│  └─────────────┘  └─────────────┘                          │
└─────────────────────────────────────────────────────────────┘
```

### Environment Variables

Ensure all production values are set:

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection (with `?connection_limit=20`) |
| `REDIS_URL` | Redis URL for caching and queues |
| `OPENAI_API_KEY` | OpenAI API key |
| `SMTP_HOST` | AWS SES SMTP endpoint |
| `SMTP_USER` | SES SMTP username |
| `SMTP_PASS` | SES SMTP password |
| `JWT_SECRET` | Secret for JWT token signing |

### Database Connection Pooling

Configure connection pooling in `DATABASE_URL`:
```
postgresql://user:pass@host:5432/db?connection_limit=20&pool_timeout=10
```

### Build

```bash
cd frontend
npm run build
npm start
```

## AWS SES Event Tracking with Kinesis Data Firehose

The application uses **AWS Kinesis Data Firehose** to receive and process SES email events (opens, clicks, bounces, complaints, deliveries) in real-time.

### Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      SES EVENT TRACKING FLOW                                 │
└─────────────────────────────────────────────────────────────────────────────┘

   ┌─────────────┐     ┌─────────────────┐     ┌──────────────────┐
   │   AWS SES   │────▶│  Configuration  │────▶│ Kinesis Firehose │
   │  (Sending)  │     │      Set        │     │    (Stream)      │
   └─────────────┘     └─────────────────┘     └────────┬─────────┘
                                                        │
                              ┌──────────────────────────┘
                              │ HTTP Endpoint Destination
                              ▼
                       ┌─────────────────────────────────┐
                       │  /api/webhooks/ses-firehose     │
                       │  (Next.js API Route)            │
                       └───────────────┬─────────────────┘
                                       │
                                       ▼
                       ┌─────────────────────────────────┐
                       │       Event Processing          │
                       │  • Update email status          │
                       │  • Track opens/clicks           │
                       │  • Handle bounces/complaints    │
                       │  • Add to suppression list      │
                       └───────────────┬─────────────────┘
                                       │
                                       ▼
                       ┌─────────────────────────────────┐
                       │         PostgreSQL              │
                       │   (email_events table)          │
                       └─────────────────────────────────┘
```

### Why Firehose Instead of SNS?

| Feature | SNS | Firehose |
|---------|-----|----------|
| **Batching** | No (1 event per request) | Yes (multiple events per request) |
| **Retry Logic** | Limited | Built-in with configurable duration |
| **Buffering** | None | Buffer by size (5 MiB) and time (60s) |
| **Dead Letter Queue** | Manual setup | Automatic S3 backup on failure |
| **Cost** | Per-message | Per-GB ingested |

### Firehose Configuration

**Stream Settings:**
- **Destination**: HTTP Endpoint
- **Endpoint URL**: `https://marketing.callsphere.tech/api/webhooks/ses-firehose`
- **Buffer Size**: 5 MiB
- **Buffer Interval**: 60 seconds
- **Retry Duration**: 300 seconds (5 minutes)

**SES Configuration Set:**
All emails are sent with a Configuration Set that publishes events to Firehose:
- Event Types: `SEND`, `DELIVERY`, `OPEN`, `CLICK`, `BOUNCE`, `COMPLAINT`, `REJECT`, `DELIVERY_DELAY`

### Webhook Endpoint

**File**: `frontend/src/app/api/webhooks/ses-firehose/route.ts`

```typescript
// Firehose sends batched, base64-encoded records
interface FirehoseRequest {
  requestId: string;      // Must echo back in response
  timestamp: number;
  records: Array<{
    data: string;         // Base64-encoded JSON
  }>;
}

// Response format required by Firehose
{
  requestId: "echoed-request-id",
  timestamp: 1234567890
}
```

### Events Processed

| Event Type | Action |
|------------|--------|
| `Send` | Log send confirmation |
| `Delivery` | Mark email as delivered, update metrics |
| `Open` | Track open event, update open count |
| `Click` | Track clicked link, update click count |
| `Bounce` | Mark as bounced, add to suppression list |
| `Complaint` | Mark as complaint, add to suppression list |
| `Reject` | Log rejection reason |
| `DeliveryDelay` | Log delay, track for monitoring |

### Authentication (Optional)

Set `FIREHOSE_ACCESS_KEY` environment variable to enable access key validation:

```env
FIREHOSE_ACCESS_KEY=your-secret-key
```

In Firehose, configure the access key in the HTTP endpoint settings.

### Monitoring

Check Firehose delivery status in AWS Console:
- **Destination error logs**: Shows failed deliveries with error messages
- **CloudWatch metrics**: Monitor `DeliveryToHttpEndpoint.Success` and `DeliveryToHttpEndpoint.Failures`

### Troubleshooting

| Error | Cause | Solution |
|-------|-------|----------|
| `502 Bad Gateway` | App crashed or restarting | Check pod logs, ensure app is healthy |
| `Invalid content-type` | Missing JSON header | Ensure endpoint returns `application/json` |
| `Access key invalid` | Wrong access key | Verify `FIREHOSE_ACCESS_KEY` matches |

---

## Inbound Email Processing with Lambda

The application processes inbound emails (replies) using **AWS Lambda** triggered by S3 events.

### Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      INBOUND EMAIL FLOW                                      │
└─────────────────────────────────────────────────────────────────────────────┘

   ┌─────────────┐     ┌─────────────────┐     ┌──────────────────┐
   │   AWS SES   │────▶│       S3        │────▶│     Lambda       │
   │  (Receive)  │     │  (Store Email)  │     │  (S3 Trigger)    │
   └─────────────┘     └─────────────────┘     └────────┬─────────┘
                                                        │
                              ┌──────────────────────────┘
                              │ HTTPS POST with X-Lambda-Secret
                              ▼
                       ┌─────────────────────────────────┐
                       │  /api/webhooks/ses-inbound      │
                       │  (Next.js API Route)            │
                       └───────────────┬─────────────────┘
                                       │
                                       ▼
                       ┌─────────────────────────────────┐
                       │       Email Processing          │
                       │  • Fetch raw email from S3      │
                       │  • Parse with mailparser        │
                       │  • Extract attachments          │
                       │  • Link to original thread      │
                       │  • Store in database            │
                       └───────────────┬─────────────────┘
                                       │
                                       ▼
                       ┌─────────────────────────────────┐
                       │   PostgreSQL + S3 Attachments   │
                       └─────────────────────────────────┘
```

### Lambda Function

**File**: `lambda/ses-inbound-trigger/index.js`

The Lambda function:
1. Receives S3 event when new email arrives
2. Extracts bucket name and object key
3. Sends HTTPS POST to webhook with `X-Lambda-Secret` header
4. Retries on failure (Lambda built-in retry)

### AWS Setup

**1. Create Lambda IAM Role:**
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"],
      "Resource": "arn:aws:logs:*:*:*"
    },
    {
      "Effect": "Allow",
      "Action": ["s3:GetObject"],
      "Resource": "arn:aws:s3:::callsphere-inbound-emails/*"
    }
  ]
}
```

**2. Create Lambda Function:**
```bash
aws lambda create-function \
  --function-name ses-inbound-email-trigger \
  --runtime nodejs20.x \
  --handler index.handler \
  --role arn:aws:iam::ACCOUNT_ID:role/lambda-ses-inbound-role \
  --timeout 30 \
  --memory-size 128 \
  --environment "Variables={WEBHOOK_HOST=marketing.callsphere.tech,LAMBDA_SECRET=your-secret}"
```

**3. Add S3 Trigger:**
```bash
aws lambda add-permission \
  --function-name ses-inbound-email-trigger \
  --statement-id s3-trigger \
  --action lambda:InvokeFunction \
  --principal s3.amazonaws.com \
  --source-arn arn:aws:s3:::callsphere-inbound-emails

aws s3api put-bucket-notification-configuration \
  --bucket callsphere-inbound-emails \
  --notification-configuration '{
    "LambdaFunctionConfigurations": [{
      "LambdaFunctionArn": "arn:aws:lambda:us-east-1:ACCOUNT_ID:function:ses-inbound-email-trigger",
      "Events": ["s3:ObjectCreated:*"],
      "Filter": {"Key": {"FilterRules": [{"Name": "prefix", "Value": "inbound/"}]}}
    }]
  }'
```

### Environment Variables

```env
# Add to .env
LAMBDA_INBOUND_SECRET=<generate-32-char-random-string>
```

### Webhook Endpoint

**File**: `frontend/src/app/api/webhooks/ses-inbound/route.ts`

```typescript
// Lambda sends this payload
interface LambdaS3Event {
  bucket: string;      // S3 bucket name
  key: string;         // S3 object key
  eventTime: string;   // ISO timestamp
}

// Requires X-Lambda-Secret header for authentication
```

### Processing Steps

1. **Authentication**: Validates `X-Lambda-Secret` header
2. **Fetch Email**: Downloads raw email from S3
3. **Parse**: Uses mailparser to extract headers, body, attachments
4. **Thread Detection**: Links reply to original sent email via In-Reply-To header
5. **Attachments**: Stores attachments in S3 with database references
6. **Database**: Creates `InboundEmail` record with all metadata

---

## Testing

```bash
# Frontend tests
cd frontend
npm test

# AI service tests
cd ai-service
pytest
```

## Security Notes

- Never commit `.env` files
- Use environment variables for all secrets
- SMTP credentials should have minimal permissions
- Enable AWS SES bounce/complaint notifications

## Recent Updates

### v2.0 (February 2026)

- **Campaign & Lead Management**: Full campaign lifecycle with lead import/export
- **Multi-Identity Email Distribution**: Round-robin distribution across SES identities
- **"Approve & Send Now" Feature**: Instantly send AI-generated follow-up emails
- **Real-Time SSE Progress**: Live updates during AI email generation
- **Unified Inbox (Unibox)**: View all email threads in one place
- **Enhanced Error Handling**: Structured logging with request correlation IDs
- **CI/CD Pipeline**: Automated linting, type checking, testing, and deployment
- **Docker Support**: Production-ready Dockerfile for containerized deployment

### v1.0 (Initial Release)

- Multi-agent AI pipeline for email generation
- Admin dashboard with approval workflow
- AWS SES integration with bounce handling
- File ingestion (CSV, XLSX, PDF, TXT)
- Evidence-first personalization

---

## License

Proprietary - CallSphere

---

Built with OpenAI Agents SDK, Next.js 14, and FastAPI | Deployed on Kubernetes (K3s) | CI/CD via GitHub Actions
