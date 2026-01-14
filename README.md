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

- **Multi-Agent AI Pipeline**: 5 specialized agents using OpenAI Agents SDK
  - Entity Resolver: Extracts businesses, contacts, and evidence from data
  - Business Analyzer: Analyzes businesses and selects personalization facts
  - Email Writer: Generates 70-110 word cold emails
  - Compliance Checker: Validates deliverability and spam compliance
  - Gatekeeper: Makes final approval decisions

- **File Ingestion**: Supports TXT, CSV, XLSX, and PDF files
- **Evidence-First Design**: All personalization is traceable to source data
- **Admin Dashboard**: Upload files, review emails, approve, export, and send
- **AWS SES Integration**: SMTP-based email sending with bounce/complaint handling
- **Background Workers**: BullMQ-powered job processing

## Tech Stack

- **Frontend**: Next.js 14 (App Router), React, TypeScript, Tailwind CSS
- **Backend**: Next.js API Routes + Python FastAPI (AI Service)
- **Database**: PostgreSQL with Prisma ORM
- **Queue**: BullMQ + Redis
- **AI**: OpenAI Agents SDK (Python)
- **Email**: AWS SES SMTP

## Project Structure

```
email_marketing/
├── .env                    # Environment variables (single file)
├── .gitignore
├── README.md
├── frontend/               # Next.js application
│   ├── package.json
│   ├── prisma/
│   │   └── schema.prisma   # Database schema
│   └── src/
│       ├── app/            # Next.js app router pages
│       ├── components/     # React components
│       └── lib/            # Utilities, parsers, queue
└── ai-service/             # Python AI service
    ├── requirements.txt
    ├── main.py             # FastAPI server
    ├── pipeline.py         # Multi-agent orchestration
    └── agents/             # OpenAI Agents SDK agents
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
| `/api/webhooks/ses` | POST | SES bounce/complaint webhook |

### AI Service API (FastAPI)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/config` | GET | Get AI service config |
| `/generate` | POST | Run multi-agent pipeline |
| `/recheck-compliance` | POST | Recheck email compliance |

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

## Production Deployment

### Environment Variables

Ensure all production values are set in `.env`:

- `DATABASE_URL`: Production PostgreSQL connection string
- `REDIS_URL`: Production Redis URL
- `OPENAI_API_KEY`: Production API key
- `SMTP_*`: AWS SES production credentials

### Build

```bash
cd frontend
npm run build
npm start
```

### Docker (Optional)

Create a `docker-compose.yml` for containerized deployment.

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

## License

Proprietary - CallSphere

---

Built with OpenAI Agents SDK and Next.js
