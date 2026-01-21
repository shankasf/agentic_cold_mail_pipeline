import os
from dotenv import load_dotenv

# Load environment from .env file (check multiple locations for container/local dev compatibility)
env_paths = [
    '/config/.env',  # Mounted from parent directory in container
    os.path.join(os.path.dirname(__file__), '..', '.env'),  # Local dev
]
for path in env_paths:
    if os.path.exists(path):
        load_dotenv(path, override=False)
        break

# OpenAI Configuration
OPENAI_API_KEY = os.getenv('OPENAI_API_KEY')
OPENAI_MODEL = os.getenv('OPENAI_MODEL')

# API Configuration
API_HOST = os.getenv('AI_SERVICE_HOST')
API_PORT = int(os.getenv('AI_SERVICE_PORT'))
FRONTEND_URL = os.getenv('FRONTEND_URL')

# Sender Configuration
SENDER_NAME = os.getenv('SENDER_NAME')
SENDER_TITLE = os.getenv('SENDER_TITLE')
COMPANY_NAME = os.getenv('COMPANY_NAME')
SENDER_EMAIL = os.getenv('SMTP_FROM')
BUSINESS_ADDRESS = os.getenv('BUSINESS_ADDRESS')
CALENDLY_URL = os.getenv('CALENDLY_URL')

# Thresholds
CONFIDENCE_THRESHOLD = int(os.getenv('CONFIDENCE_THRESHOLD'))
DELIVERABILITY_THRESHOLD = int(os.getenv('DELIVERABILITY_THRESHOLD'))
MAX_WORDS = int(os.getenv('MAX_WORDS'))
MIN_WORDS = int(os.getenv('MIN_WORDS'))
