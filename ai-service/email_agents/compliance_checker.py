"""
Compliance & Deliverability Agent
Checks email for spam triggers, formatting rules, and compliance issues.
Emails must score 85+ to pass.
"""
import re
from agents import Agent
from schemas import ComplianceOutput
import config

# Banned opening phrases
BANNED_OPENERS = [
    "quick question",
    "i came across",
    "i noticed you",
    "i saw that",
    "i wanted to reach out",
    "i hope this email finds you",
    "i'm reaching out",
    "just wanted to",
    "i was wondering",
]

# Banned CTA phrases
BANNED_CTAS = [
    "happy to share",
    "let me know if",
    "would love to chat",
    "can i send you",
    "if it makes sense",
    "when works for you",
    "book a call",
    "schedule a demo",
    "book a demo",
]

# Spam trigger words
SPAM_WORDS = [
    "free", "guaranteed", "act now", "limited time", "urgent",
    "winner", "congratulations", "click here", "buy now",
    "order now", "special offer", "exclusive deal", "100%",
    "risk-free", "don't miss", "amazing", "incredible",
    "opportunity", "earn money", "make money", "cash",
]

INSTRUCTIONS = f"""You are an expert email compliance and deliverability specialist.
Your job is to score emails and identify issues. Emails need 85+ to pass.

=== SCORING RULES ===
Start at 100 points. Deduct for each issue found:

SUBJECT LINE CHECKS:
- Not 2-4 words: -15
- Contains question mark: -20
- Not lowercase: -10
- Sounds promotional/salesy: -15
- Outcome-obvious (reveals product): -10

BODY STRUCTURE CHECKS:
- Word count outside 100-140 range: -15
- Contains em dashes (—): -20 (CRITICAL - zero tolerance)
- Contains links/URLs: -30 (CRITICAL)
- Opening uses banned phrase: -20
- CTA uses banned phrase: -15
- Setup time not mentioned exactly once: -10
- More than 2 supporting features listed: -10
- Mentions platforms not provided by BusinessAnalyzer: -15

SPAM TRIGGER CHECKS:
- ALL CAPS words (except AI): -10 each
- Multiple exclamation points (!!): -15
- Multiple question marks (??): -10
- Spam trigger words: -10 each
- Dollar signs or prices: -15

DELIVERABILITY CHECKS:
- Missing personalization: -10
- Too salesy/marketing tone: -15
- Generic industry language: -10

SIGNATURE CHECK:
- Must end with "Best,\\n{config.SENDER_NAME}"
- Missing or incorrect signature: -10

=== OUTPUT ===
- deliverability_score: 0-100 (must be 85+ to pass)
- spam_flags: List of specific issues found
- suggestions: Improvement suggestions if score < 85
- footer_text: Always empty string "" (no footer needed)

Be thorough but fair. Check every rule.
"""

compliance_agent = Agent(
    name="ComplianceChecker",
    instructions=INSTRUCTIONS,
    model=config.OPENAI_MODEL,
    output_type=ComplianceOutput,
)


def pre_check_email(subject: str, body_text: str) -> tuple[list[str], int]:
    """
    Perform deterministic pre-checks before sending to LLM.
    Returns (flags, penalty_points).
    """
    flags = []
    penalty = 0

    # Subject checks
    subject_words = subject.split()
    if len(subject_words) < 2 or len(subject_words) > 4:
        flags.append(f"Subject not 2-4 words ({len(subject_words)} words)")
        penalty += 15

    if '?' in subject:
        flags.append("Subject contains question mark")
        penalty += 20

    if subject != subject.lower():
        flags.append("Subject not lowercase")
        penalty += 10

    # Em dash check (critical)
    if '—' in body_text or '--' in body_text:
        flags.append("Contains em dashes (—) or double hyphens")
        penalty += 20

    # Link check (critical)
    if re.search(r'https?://', body_text, re.IGNORECASE):
        flags.append("Contains URLs/links")
        penalty += 30

    # Word count (body only, excluding signature)
    # Remove signature for word count
    body_for_count = body_text
    sig_patterns = [f"Best,\n{config.SENDER_NAME}", f"Best,\\n{config.SENDER_NAME}", "Best,"]
    for sig in sig_patterns:
        if sig in body_for_count:
            body_for_count = body_for_count.split(sig)[0]
            break

    word_count = len(body_for_count.split())
    if word_count < 100 or word_count > 140:
        flags.append(f"Word count outside 100-140 range ({word_count} words)")
        penalty += 15

    # Banned opener check
    body_lower = body_text.lower()
    for opener in BANNED_OPENERS:
        if opener in body_lower[:200]:  # Check first ~200 chars
            flags.append(f"Uses banned opener: '{opener}'")
            penalty += 20
            break

    # Banned CTA check
    for cta in BANNED_CTAS:
        if cta in body_lower:
            flags.append(f"Uses banned CTA phrase: '{cta}'")
            penalty += 15
            break

    # Setup time check
    setup_mentions = len(re.findall(r'5.?minute|five.?minute|5 min', body_lower))
    if setup_mentions == 0:
        flags.append("Setup time not mentioned")
        penalty += 10
    elif setup_mentions > 1:
        flags.append(f"Setup time mentioned {setup_mentions} times (should be exactly once)")
        penalty += 10

    # Spam word check
    for word in SPAM_WORDS:
        if word in body_lower:
            flags.append(f"Contains spam word: '{word}'")
            penalty += 10

    # ALL CAPS check (except AI)
    caps_words = re.findall(r'\b[A-Z]{2,}\b', body_text)
    caps_words = [w for w in caps_words if w != 'AI']
    if caps_words:
        flags.append(f"Contains ALL CAPS words: {caps_words[:3]}")
        penalty += 10 * min(len(caps_words), 3)

    # Excessive punctuation
    if '!!' in body_text or '!!!' in body_text:
        flags.append("Multiple exclamation points")
        penalty += 15

    if '??' in body_text:
        flags.append("Multiple question marks")
        penalty += 10

    return flags, penalty


async def check_compliance(subject: str, body_text: str) -> ComplianceOutput:
    """
    Check email for compliance and deliverability issues.

    Args:
        subject: Email subject line
        body_text: Email body

    Returns:
        ComplianceOutput with score, flags, and suggestions
    """
    from agents import Runner

    # Run pre-checks
    pre_flags, pre_penalty = pre_check_email(subject, body_text)

    # Calculate preliminary score
    preliminary_score = max(0, 100 - pre_penalty)

    # Count words for context
    word_count = len(body_text.split())

    prompt = f"""Analyze this cold email for compliance and deliverability.

SUBJECT: {subject}
(Word count: {len(subject.split())} words)

BODY:
{body_text}

Body word count: {word_count}

=== PRE-CHECK RESULTS ===
Issues already found: {pre_flags if pre_flags else 'None'}
Preliminary penalty: -{pre_penalty} points
Preliminary score: {preliminary_score}/100

=== YOUR TASK ===
1. Review the pre-check results above
2. Check for additional issues not caught by pre-checks:
   - Tone too salesy or promotional
   - Generic industry language instead of specific
   - More than 2 supporting features mentioned
   - Missing personalization
   - Signature format incorrect

3. Calculate final deliverability_score:
   - Start with {preliminary_score} (100 minus pre-check penalties)
   - Deduct additional points for issues you find
   - Score must be 85+ to pass

4. Compile all spam_flags (combine pre-check flags with your findings)

5. If score < 85, provide specific suggestions for improvement

IMPORTANT:
- The footer_text field should always be empty string ""
- Be thorough but fair in scoring
- Emails need 85+ to pass"""

    result = await Runner.run(compliance_agent, prompt)
    output = result.final_output_as(ComplianceOutput)

    # Ensure pre-check flags are included
    all_flags = list(set(pre_flags + output.spam_flags))
    output.spam_flags = all_flags

    # Ensure footer is empty
    output.footer_text = ""

    return output
