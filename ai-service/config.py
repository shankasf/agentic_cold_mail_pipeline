import os
from dotenv import load_dotenv

# Load environment from root .env (optional, env vars may be set directly)
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'), override=False)

# OpenAI Configuration
OPENAI_API_KEY = os.getenv('OPENAI_API_KEY', '')
OPENAI_MODEL = os.getenv('OPENAI_MODEL', 'gpt-4o')

# API Configuration
API_HOST = os.getenv('AI_SERVICE_HOST', '0.0.0.0')
API_PORT = int(os.getenv('AI_SERVICE_PORT', '8001'))
FRONTEND_URL = os.getenv('FRONTEND_URL', 'http://localhost:3000')

# Sender Configuration
SENDER_NAME = os.getenv('SENDER_NAME', 'Sagar Shankaran')
SENDER_TITLE = os.getenv('SENDER_TITLE', 'Founder & CEO')
COMPANY_NAME = os.getenv('COMPANY_NAME', 'CallSphere LLC')
SENDER_EMAIL = os.getenv('SMTP_FROM', 'sagar@callsphere.tech')
BUSINESS_ADDRESS = os.getenv('BUSINESS_ADDRESS', '27 Orchard Pl, New York, NY 12601')
CALENDLY_URL = os.getenv('CALENDLY_URL', 'https://calendly.com/sagar-callsphere/new-meeting')

# Thresholds
CONFIDENCE_THRESHOLD = int(os.getenv('CONFIDENCE_THRESHOLD', '70'))
DELIVERABILITY_THRESHOLD = int(os.getenv('DELIVERABILITY_THRESHOLD', '70'))
MAX_WORDS = int(os.getenv('MAX_WORDS', '110'))
MIN_WORDS = int(os.getenv('MIN_WORDS', '70'))
