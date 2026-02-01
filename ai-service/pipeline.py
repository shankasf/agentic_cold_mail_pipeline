"""
Multi-Agent Pipeline Orchestrator
Coordinates all agents to generate emails from parsed chunks.
Auto-regenerates emails that fail compliance (score < 85).

Features:
- Circuit breaker protection for OpenAI API
- Parallel execution of independent agents
- Comprehensive logging and tracing
"""
import asyncio
import time
from typing import Any, Callable, Awaitable, Optional
from schemas import EmailGenerationResult
from email_agents import (
    resolve_entities,
    analyze_business,
    write_email,
    check_compliance,
    make_decision,
)
from agent_wrappers import (
    safe_resolve_entities,
    safe_analyze_business,
    safe_write_email,
    safe_check_compliance,
    safe_make_decision,
    is_openai_healthy,
)
from circuit_breaker import CircuitBreakerError
import config
from agent_logger import logger

# Compliance threshold - emails must score 85+ to pass
COMPLIANCE_THRESHOLD = 85
MAX_REGENERATION_ATTEMPTS = 3

# Parallel execution configuration
PARALLEL_BATCH_SIZE = 5  # Process up to 5 businesses in parallel


def compute_confidence_score(facts_used: list[dict], entity_confidence: int) -> int:
    """
    Compute overall confidence score.
    70% from average fact confidence, 30% from entity resolution confidence.
    """
    if not facts_used:
        return int(entity_confidence * 0.3)

    avg_fact_confidence = sum(f['confidence'] for f in facts_used) / len(facts_used)
    return int(avg_fact_confidence * 0.7 + entity_confidence * 0.3)


async def run_pipeline(
    chunks: list[dict],
    industry_playbooks: dict[str, dict] | None = None,
    progress_callback: Callable[[str], Awaitable[None]] | None = None,
    use_circuit_breaker: bool = True,
    parallel_execution: bool = True,
) -> dict[str, Any]:
    """
    Run the full email generation pipeline.

    Args:
        chunks: List of parsed chunks with {id, chunkIndex, textContent, sourceMeta}
        industry_playbooks: Optional dict mapping industry -> playbook
        progress_callback: Optional async callback for progress updates
        use_circuit_breaker: Whether to use circuit breaker for API calls
        parallel_execution: Whether to process businesses in parallel

    Returns:
        Dictionary with:
        - businesses: List of extracted businesses
        - contacts: List of extracted contacts
        - evidence: List of extracted evidence
        - emails: List of generated email results
        - errors: List of any errors encountered
    """
    industry_playbooks = industry_playbooks or {}
    results = {
        'businesses': [],
        'contacts': [],
        'evidence': [],
        'emails': [],
        'errors': [],
    }

    pipeline_start = time.time()
    logger.pipeline_start("email_generation", chunks=len(chunks))

    async def report_progress(msg: str):
        print(msg)
        if progress_callback:
            await progress_callback(msg)

    try:
        # Step 1: Entity Resolution
        await report_progress("🔍 Agent 1/5: EntityResolver - Extracting businesses & contacts...")

        entity_start = time.time()
        if use_circuit_breaker:
            entity_result = await safe_resolve_entities(chunks)
        else:
            entity_result = await resolve_entities(chunks)
        entity_duration = int((time.time() - entity_start) * 1000)

        logger.agent_complete("EntityResolver", duration_ms=entity_duration,
                            businesses=len(entity_result.businesses),
                            contacts=len(entity_result.contacts))

        results['businesses'] = [b.model_dump() for b in entity_result.businesses]
        results['contacts'] = [c.model_dump() for c in entity_result.contacts]
        results['evidence'] = [e.model_dump() for e in entity_result.evidence]

        await report_progress(f"✅ Found {len(results['businesses'])} businesses, {len(results['contacts'])} contacts")

        # Create mappings for easy lookup
        business_map = {b.temp_business_key: b for b in entity_result.businesses}
        chunk_map = {c['id']: c for c in chunks}

        # Group evidence and contacts by business
        business_evidence = {}
        business_contacts = {}

        for contact in entity_result.contacts:
            key = contact.temp_business_key
            if key not in business_contacts:
                business_contacts[key] = []
            business_contacts[key].append(contact)

        for evidence in entity_result.evidence:
            key = evidence.temp_business_key
            if key not in business_evidence:
                business_evidence[key] = []
            business_evidence[key].append(evidence)

        # Process businesses (potentially in parallel)
        total_businesses = len(business_map)
        business_items = list(business_map.items())

        if parallel_execution and total_businesses > 1:
            # Process in batches for parallel execution
            await report_progress(f"⚡ Parallel mode: Processing {total_businesses} businesses in batches of {PARALLEL_BATCH_SIZE}")

            for batch_start in range(0, len(business_items), PARALLEL_BATCH_SIZE):
                batch_end = min(batch_start + PARALLEL_BATCH_SIZE, len(business_items))
                batch = business_items[batch_start:batch_end]

                # Process batch in parallel
                batch_tasks = []
                for idx, (biz_key, business) in enumerate(batch, batch_start + 1):
                    contacts = business_contacts.get(biz_key, [])
                    evidence = business_evidence.get(biz_key, [])
                    industry = business.industry_guess or ''
                    playbook = industry_playbooks.get(industry.lower())
                    relevant_chunk_ids = {e.chunk_id for e in evidence}
                    relevant_chunks = [chunk_map[cid] for cid in relevant_chunk_ids if cid in chunk_map]

                    task = process_business(
                        business=business,
                        contacts=contacts,
                        evidence=evidence,
                        relevant_chunks=relevant_chunks,
                        playbook=playbook,
                        business_idx=idx,
                        total_businesses=total_businesses,
                        progress_callback=report_progress,
                        use_circuit_breaker=use_circuit_breaker,
                    )
                    batch_tasks.append(task)

                batch_results = await asyncio.gather(*batch_tasks, return_exceptions=True)

                # Collect results
                for result in batch_results:
                    if isinstance(result, Exception):
                        error_msg = f"Batch processing error: {str(result)}"
                        await report_progress(f"❌ {error_msg}")
                        results['errors'].append(error_msg)
                    elif result:
                        results['emails'].extend(result.get('emails', []))
                        results['errors'].extend(result.get('errors', []))
        else:
            # Sequential processing
            for business_idx, (biz_key, business) in enumerate(business_items, 1):
                contacts = business_contacts.get(biz_key, [])
                evidence = business_evidence.get(biz_key, [])

                if not contacts:
                    await report_progress(f"⏭️ Skipping business {business_idx}/{total_businesses}: '{business.canonical_name}' (no contacts)")
                    continue

                industry = business.industry_guess or ''
                playbook = industry_playbooks.get(industry.lower())
                relevant_chunk_ids = {e.chunk_id for e in evidence}
                relevant_chunks = [chunk_map[cid] for cid in relevant_chunk_ids if cid in chunk_map]

                result = await process_business(
                    business=business,
                    contacts=contacts,
                    evidence=evidence,
                    relevant_chunks=relevant_chunks,
                    playbook=playbook,
                    business_idx=business_idx,
                    total_businesses=total_businesses,
                    progress_callback=report_progress,
                    use_circuit_breaker=use_circuit_breaker,
                )

                if result:
                    results['emails'].extend(result.get('emails', []))
                    results['errors'].extend(result.get('errors', []))

    except CircuitBreakerError as e:
        error_msg = f"Circuit breaker open: {str(e)}"
        await report_progress(f"⚠️ {error_msg}")
        results['errors'].append(error_msg)

    except Exception as e:
        error_msg = f"Pipeline error: {str(e)}"
        await report_progress(f"❌ {error_msg}")
        results['errors'].append(error_msg)

    pipeline_duration = int((time.time() - pipeline_start) * 1000)
    logger.pipeline_complete("email_generation", duration_ms=pipeline_duration,
                            emails_generated=len(results['emails']),
                            errors=len(results['errors']))

    await report_progress(f"🏁 Pipeline complete: {len(results['emails'])} emails generated, {len(results['errors'])} errors")
    return results


async def process_business(
    business,
    contacts: list,
    evidence: list,
    relevant_chunks: list,
    playbook: Optional[dict],
    business_idx: int,
    total_businesses: int,
    progress_callback: Callable[[str], Awaitable[None]],
    use_circuit_breaker: bool = True,
) -> dict:
    """
    Process a single business and generate emails for all its contacts.

    Returns:
        Dict with 'emails' and 'errors' lists
    """
    result = {'emails': [], 'errors': []}

    if not contacts:
        return result

    async def report_progress(msg: str):
        if progress_callback:
            await progress_callback(msg)

    try:
        # Step 2: Analyze business
        await report_progress(f"📊 Agent 2/5: BusinessAnalyzer - Analyzing '{business.canonical_name}' ({business_idx}/{total_businesses})")

        analyze_start = time.time()
        if use_circuit_breaker:
            analysis = await safe_analyze_business(
                business=business.model_dump(),
                evidence=[e.model_dump() for e in evidence],
                chunks=relevant_chunks,
                industry_playbook=playbook,
            )
        else:
            analysis = await analyze_business(
                business=business.model_dump(),
                evidence=[e.model_dump() for e in evidence],
                chunks=relevant_chunks,
                industry_playbook=playbook,
            )
        analyze_duration = int((time.time() - analyze_start) * 1000)
        logger.agent_complete("BusinessAnalyzer", duration_ms=analyze_duration,
                            facts_found=len(analysis.facts_used))

        # Process each contact
        total_contacts = len(contacts)
        for contact_idx, contact in enumerate(contacts, 1):
            try:
                email_result = await process_contact(
                    business=business,
                    contact=contact,
                    analysis=analysis,
                    playbook=playbook,
                    contact_idx=contact_idx,
                    total_contacts=total_contacts,
                    progress_callback=progress_callback,
                    use_circuit_breaker=use_circuit_breaker,
                )
                if email_result:
                    result['emails'].append(email_result)
                    await report_progress(f"✅ Email #{len(result['emails'])} generated for {contact.email}")

            except CircuitBreakerError as e:
                error_msg = f"Circuit breaker open for contact {contact.email}: {str(e)}"
                await report_progress(f"⚠️ {error_msg}")
                result['errors'].append(error_msg)

            except Exception as e:
                error_msg = f"Error processing contact {contact.email}: {str(e)}"
                await report_progress(f"❌ {error_msg}")
                result['errors'].append(error_msg)

    except CircuitBreakerError as e:
        error_msg = f"Circuit breaker open for business {business.canonical_name}: {str(e)}"
        result['errors'].append(error_msg)

    except Exception as e:
        error_msg = f"Error processing business {business.canonical_name}: {str(e)}"
        result['errors'].append(error_msg)

    return result


async def process_contact(
    business,
    contact,
    analysis,
    playbook: Optional[dict],
    contact_idx: int,
    total_contacts: int,
    progress_callback: Callable[[str], Awaitable[None]],
    use_circuit_breaker: bool = True,
) -> Optional[dict]:
    """
    Process a single contact and generate an email.
    Includes auto-regeneration on compliance failure.

    Returns:
        Email result dict or None
    """
    async def report_progress(msg: str):
        if progress_callback:
            await progress_callback(msg)

    # Compute entity confidence (average of business and contact)
    entity_confidence = (business.confidence + contact.confidence) // 2

    # Email generation with auto-regeneration on compliance failure
    email = None
    compliance = None
    attempt = 0

    while attempt < MAX_REGENERATION_ATTEMPTS:
        attempt += 1

        # Step 3: Write email
        if attempt == 1:
            await report_progress(f"✍️ Agent 3/5: EmailWriter - Writing email for {contact.email} ({contact_idx}/{total_contacts})")
        else:
            await report_progress(f"🔄 Regenerating email (attempt {attempt}/{MAX_REGENERATION_ATTEMPTS})...")

        write_start = time.time()
        if use_circuit_breaker:
            email = await safe_write_email(
                business=business.model_dump(),
                contact=contact.model_dump(),
                facts_used=[f.model_dump() for f in analysis.facts_used],
                pain_point=analysis.inferred_pain_point,
                industry_playbook=playbook,
            )
        else:
            email = await write_email(
                business=business.model_dump(),
                contact=contact.model_dump(),
                facts_used=[f.model_dump() for f in analysis.facts_used],
                pain_point=analysis.inferred_pain_point,
                industry_playbook=playbook,
            )
        write_duration = int((time.time() - write_start) * 1000)
        logger.agent_complete("EmailWriter", duration_ms=write_duration,
                            subject_preview=email.subject[:50] if email else None)

        # Step 4: Check compliance
        await report_progress(f"🛡️ Agent 4/5: ComplianceChecker - Checking spam & compliance...")

        compliance_start = time.time()
        if use_circuit_breaker:
            compliance = await safe_check_compliance(
                subject=email.subject,
                body_text=email.body_text,
            )
        else:
            compliance = await check_compliance(
                subject=email.subject,
                body_text=email.body_text,
            )
        compliance_duration = int((time.time() - compliance_start) * 1000)
        logger.agent_complete("ComplianceChecker", duration_ms=compliance_duration,
                            score=compliance.deliverability_score,
                            spam_flags=len(compliance.spam_flags))

        # Check if email passes compliance threshold
        if compliance.deliverability_score >= COMPLIANCE_THRESHOLD:
            await report_progress(f"✅ Email passed compliance (score: {compliance.deliverability_score})")
            break
        else:
            await report_progress(f"⚠️ Email failed compliance (score: {compliance.deliverability_score}/{COMPLIANCE_THRESHOLD}). Issues: {compliance.spam_flags[:3]}")

            if attempt >= MAX_REGENERATION_ATTEMPTS:
                await report_progress(f"❌ Max regeneration attempts reached. Using best attempt.")

    # Compute confidence score
    confidence_score = compute_confidence_score(
        [f.model_dump() for f in analysis.facts_used],
        entity_confidence,
    )

    # Step 5: Gatekeeper decision
    await report_progress(f"🚦 Agent 5/5: Gatekeeper - Making final decision...")

    gatekeeper_start = time.time()
    if use_circuit_breaker:
        decision = await safe_make_decision(
            confidence_score=confidence_score,
            deliverability_score=compliance.deliverability_score,
            spam_flags=compliance.spam_flags,
            analyzer_needs_review=analysis.needs_review,
        )
    else:
        decision = await make_decision(
            confidence_score=confidence_score,
            deliverability_score=compliance.deliverability_score,
            spam_flags=compliance.spam_flags,
            analyzer_needs_review=analysis.needs_review,
        )
    gatekeeper_duration = int((time.time() - gatekeeper_start) * 1000)
    logger.agent_complete("Gatekeeper", duration_ms=gatekeeper_duration,
                        decision=decision.final_status)

    # Build result
    email_result = EmailGenerationResult(
        business_id=business.temp_business_key,  # Will be replaced with real ID
        contact_id=contact.email,  # Will be replaced with real ID
        subject=email.subject,
        body_text=email.body_text,
        footer_text=compliance.footer_text,
        personalization_tokens={
            'facts_used': [f.model_dump() for f in analysis.facts_used],
            'pain_point': analysis.inferred_pain_point,
            'industry': business.industry_guess,
            'regeneration_attempts': attempt,
        },
        confidence_score=confidence_score,
        deliverability_score=compliance.deliverability_score,
        spam_flags=compliance.spam_flags,
        status=decision.final_status,
    )

    return email_result.model_dump()


async def recheck_compliance(subject: str, body_text: str, use_circuit_breaker: bool = True) -> dict:
    """
    Re-run compliance check on an edited email.
    Used when admin edits an email and needs updated scores.
    """
    if use_circuit_breaker:
        compliance = await safe_check_compliance(subject, body_text)
    else:
        compliance = await check_compliance(subject, body_text)
    return compliance.model_dump()


async def generate_email_for_contact(
    business: dict,
    contact: dict,
    evidence: list[dict] | None = None,
    industry_playbook: dict | None = None,
    use_circuit_breaker: bool = True,
) -> dict:
    """
    Generate a single email for an existing business/contact pair.
    Skips entity extraction and goes directly to email writing.
    Uses ALL available data including customData fields for AI personalization.

    Args:
        business: Business data {id, canonical_name, website, industry_guess, location, customData, enrichmentData}
        contact: Contact data {id, email, name, role, phone, linkedinUrl, customData}
        evidence: Optional list of evidence/facts about the business
        industry_playbook: Optional industry-specific playbook
        use_circuit_breaker: Whether to use circuit breaker for API calls

    Returns:
        Dictionary with email data or error
    """
    start_time = time.time()
    contact_email = contact.get('email', 'unknown')
    business_name = business.get('canonical_name', business.get('canonicalName', 'Unknown'))

    logger.pipeline_start("email_generation", contact=contact_email, business=business_name)

    try:
        # Build facts from evidence
        facts_used = []
        if evidence:
            for ev in evidence:
                facts_used.append({
                    'type': ev.get('evidenceType', ev.get('type', 'OTHER')),
                    'value': ev.get('extractedValue', ev.get('value', '')),
                    'chunk_id': ev.get('id', ''),
                    'confidence': ev.get('confidence', 80),
                })

        # If no evidence, create basic fact from business info
        if not facts_used:
            if business.get('industry_guess') or business.get('industryGuess'):
                facts_used.append({
                    'type': 'INDUSTRY',
                    'value': business.get('industry_guess') or business.get('industryGuess'),
                    'chunk_id': '',
                    'confidence': 70,
                })
            if business.get('location'):
                facts_used.append({
                    'type': 'LOCATION',
                    'value': business['location'],
                    'chunk_id': '',
                    'confidence': 70,
                })
            # Always add company name as a fact
            facts_used.append({
                'type': 'OTHER',
                'value': f"Company: {business.get('canonical_name', business.get('canonicalName', 'Unknown'))}",
                'chunk_id': '',
                'confidence': 100,
            })

        # Normalize business data for email writer
        normalized_business = {
            'canonical_name': business.get('canonical_name', business.get('canonicalName', '')),
            'website': business.get('website'),
            'industry_guess': business.get('industry_guess', business.get('industryGuess')),
            'location': business.get('location'),
        }

        # Normalize contact data
        normalized_contact = {
            'email': contact.get('email', ''),
            'name': contact.get('name'),
            'role': contact.get('role'),
            'phone': contact.get('phone'),
            'linkedinUrl': contact.get('linkedinUrl') or contact.get('linkedin_url'),
        }

        # Extract custom data fields for AI to scan
        custom_business_data = business.get('customData') or business.get('custom_data') or {}
        custom_contact_data = contact.get('customData') or contact.get('custom_data') or {}

        # Also include enrichment data if available
        enrichment_data = business.get('enrichmentData') or business.get('enrichment_data') or {}
        if enrichment_data:
            custom_business_data = {**custom_business_data, **enrichment_data}

        # Email generation with auto-regeneration on compliance failure
        email = None
        compliance = None
        attempt = 0

        while attempt < MAX_REGENERATION_ATTEMPTS:
            attempt += 1

            # Write email with ALL available data
            logger.agent_start("EmailWriter", task=f"Writing email for {contact_email}", attempt=attempt)
            write_start = time.time()

            if use_circuit_breaker:
                email = await safe_write_email(
                    business=normalized_business,
                    contact=normalized_contact,
                    facts_used=facts_used,
                    pain_point=None,
                    industry_playbook=industry_playbook,
                    custom_business_data=custom_business_data,
                    custom_contact_data=custom_contact_data,
                )
            else:
                email = await write_email(
                    business=normalized_business,
                    contact=normalized_contact,
                    facts_used=facts_used,
                    pain_point=None,
                    industry_playbook=industry_playbook,
                    custom_business_data=custom_business_data,
                    custom_contact_data=custom_contact_data,
                )

            logger.agent_complete("EmailWriter", duration_ms=int((time.time() - write_start) * 1000),
                                  subject_preview=email.subject[:50] if email else None)

            # Check compliance
            logger.agent_start("ComplianceChecker", task=f"Checking compliance for {contact_email}")
            compliance_start = time.time()

            if use_circuit_breaker:
                compliance = await safe_check_compliance(
                    subject=email.subject,
                    body_text=email.body_text,
                )
            else:
                compliance = await check_compliance(
                    subject=email.subject,
                    body_text=email.body_text,
                )

            logger.agent_complete("ComplianceChecker", duration_ms=int((time.time() - compliance_start) * 1000),
                                  score=compliance.deliverability_score, spam_flags=len(compliance.spam_flags))

            # Check if email passes compliance threshold
            if compliance.deliverability_score >= COMPLIANCE_THRESHOLD:
                logger.info(f"Email passed compliance", agent="ComplianceChecker",
                           score=compliance.deliverability_score, threshold=COMPLIANCE_THRESHOLD)
                break
            else:
                logger.warn(f"Email failed compliance, regenerating...", agent="ComplianceChecker",
                           score=compliance.deliverability_score, attempt=attempt, max_attempts=MAX_REGENERATION_ATTEMPTS)
                if attempt >= MAX_REGENERATION_ATTEMPTS:
                    logger.warn(f"Max regeneration attempts reached", agent="EmailWriter", final_score=compliance.deliverability_score)
                    break

        # Compute confidence score (boost if we have custom data)
        custom_data_boost = 5 if (custom_business_data or custom_contact_data) else 0
        avg_fact_confidence = sum(f['confidence'] for f in facts_used) / len(facts_used) if facts_used else 70
        confidence_score = int(avg_fact_confidence * 0.8 + 20 + custom_data_boost)  # Base 20 for existing verified contact

        # Gatekeeper decision
        logger.agent_start("Gatekeeper", task="Making final decision")

        if use_circuit_breaker:
            decision = await safe_make_decision(
                confidence_score=confidence_score,
                deliverability_score=compliance.deliverability_score,
                spam_flags=compliance.spam_flags,
                analyzer_needs_review=False,
            )
        else:
            decision = await make_decision(
                confidence_score=confidence_score,
                deliverability_score=compliance.deliverability_score,
                spam_flags=compliance.spam_flags,
                analyzer_needs_review=False,
            )
        logger.agent_complete("Gatekeeper", decision=decision.final_status)

        total_duration = int((time.time() - start_time) * 1000)
        logger.pipeline_complete("email_generation", duration_ms=total_duration,
                                contact=contact_email, decision=decision.final_status,
                                confidence=confidence_score, deliverability=compliance.deliverability_score)

        return {
            'success': True,
            'business_id': business.get('id', ''),
            'contact_id': contact.get('id', contact.get('email', '')),
            'subject': email.subject,
            'body_text': email.body_text,
            'footer_text': compliance.footer_text,
            'personalization_tokens': {
                'facts_used': facts_used,
                'industry': normalized_business.get('industry_guess'),
                'regeneration_attempts': attempt,
                'custom_data_used': bool(custom_business_data or custom_contact_data),
            },
            'confidence_score': confidence_score,
            'deliverability_score': compliance.deliverability_score,
            'spam_flags': compliance.spam_flags,
            'status': decision.final_status,
        }

    except CircuitBreakerError as e:
        logger.error(f"Circuit breaker open: {str(e)}", contact=contact_email, business=business_name)
        return {
            'success': False,
            'error': f"Service temporarily unavailable: {str(e)}",
            'business_id': business.get('id', ''),
            'contact_id': contact.get('id', contact.get('email', '')),
        }

    except Exception as e:
        logger.error(f"Email generation failed: {str(e)}", contact=contact_email, business=business_name)
        return {
            'success': False,
            'error': str(e),
            'business_id': business.get('id', ''),
            'contact_id': contact.get('id', contact.get('email', '')),
        }


async def generate_follow_up_email(
    business: dict,
    contact: dict,
    previous_email: dict,
    industry_playbook: dict | None = None,
    use_circuit_breaker: bool = True,
) -> dict:
    """
    Generate a follow-up email based on a previous email.
    Skips email validation - designed for follow-ups to existing contacts.
    Uses ALL available data including customData for better personalization.

    Args:
        business: Business data {id, canonical_name, website, industry_guess, location, customData}
        contact: Contact data {id, email, name, role, customData}
        previous_email: Previous email {subject, bodyText}
        industry_playbook: Optional industry-specific playbook
        use_circuit_breaker: Whether to use circuit breaker for API calls

    Returns:
        Dictionary with email data or error
    """
    try:
        # Normalize business data
        normalized_business = {
            'canonical_name': business.get('canonical_name', business.get('canonicalName', '')),
            'website': business.get('website'),
            'industry_guess': business.get('industry_guess', business.get('industryGuess')),
            'location': business.get('location'),
        }

        # Normalize contact data
        normalized_contact = {
            'email': contact.get('email', ''),
            'name': contact.get('name'),
            'role': contact.get('role'),
            'phone': contact.get('phone'),
            'linkedinUrl': contact.get('linkedinUrl') or contact.get('linkedin_url'),
        }

        # Extract custom data fields for AI to scan
        custom_business_data = business.get('customData') or business.get('custom_data') or {}
        custom_contact_data = contact.get('customData') or contact.get('custom_data') or {}

        # Also include enrichment data if available
        enrichment_data = business.get('enrichmentData') or business.get('enrichment_data') or {}
        if enrichment_data:
            custom_business_data = {**custom_business_data, **enrichment_data}

        # Build context facts from previous email
        facts_used = [
            {
                'type': 'FOLLOW_UP_CONTEXT',
                'value': f"Previous subject: {previous_email.get('subject', '')}",
                'chunk_id': '',
                'confidence': 100,
            },
            {
                'type': 'OTHER',
                'value': f"Company: {normalized_business.get('canonical_name', 'Unknown')}",
                'chunk_id': '',
                'confidence': 100,
            },
        ]

        if normalized_business.get('industry_guess'):
            facts_used.append({
                'type': 'INDUSTRY',
                'value': normalized_business['industry_guess'],
                'chunk_id': '',
                'confidence': 80,
            })

        # Generate follow-up email with modified pain point for follow-up context
        follow_up_context = f"This is a follow-up to a previous email with subject: '{previous_email.get('subject', '')}'. Create a brief, friendly follow-up that references the previous outreach."

        # Email generation with auto-regeneration on compliance failure
        email = None
        compliance = None
        attempt = 0

        while attempt < MAX_REGENERATION_ATTEMPTS:
            attempt += 1

            # Write follow-up email with ALL available data
            if use_circuit_breaker:
                email = await safe_write_email(
                    business=normalized_business,
                    contact=normalized_contact,
                    facts_used=facts_used,
                    pain_point=follow_up_context,
                    industry_playbook=industry_playbook,
                    custom_business_data=custom_business_data,
                    custom_contact_data=custom_contact_data,
                )
            else:
                email = await write_email(
                    business=normalized_business,
                    contact=normalized_contact,
                    facts_used=facts_used,
                    pain_point=follow_up_context,
                    industry_playbook=industry_playbook,
                    custom_business_data=custom_business_data,
                    custom_contact_data=custom_contact_data,
                )

            # Check compliance (no email validation for follow-ups)
            if use_circuit_breaker:
                compliance = await safe_check_compliance(
                    subject=email.subject,
                    body_text=email.body_text,
                )
            else:
                compliance = await check_compliance(
                    subject=email.subject,
                    body_text=email.body_text,
                )

            # Check if email passes compliance threshold
            if compliance.deliverability_score >= COMPLIANCE_THRESHOLD:
                break
            elif attempt >= MAX_REGENERATION_ATTEMPTS:
                # Use best attempt even if it failed
                break

        # Compute confidence score (higher base for follow-ups, boost if we have custom data)
        custom_data_boost = 5 if (custom_business_data or custom_contact_data) else 0
        avg_fact_confidence = sum(f['confidence'] for f in facts_used) / len(facts_used) if facts_used else 80
        confidence_score = int(avg_fact_confidence * 0.7 + 30 + custom_data_boost)  # Higher base (30) for follow-up

        # Gatekeeper decision
        if use_circuit_breaker:
            decision = await safe_make_decision(
                confidence_score=confidence_score,
                deliverability_score=compliance.deliverability_score,
                spam_flags=compliance.spam_flags,
                analyzer_needs_review=False,
            )
        else:
            decision = await make_decision(
                confidence_score=confidence_score,
                deliverability_score=compliance.deliverability_score,
                spam_flags=compliance.spam_flags,
                analyzer_needs_review=False,
            )

        return {
            'success': True,
            'business_id': business.get('id', ''),
            'contact_id': contact.get('id', contact.get('email', '')),
            'subject': email.subject,
            'body_text': email.body_text,
            'footer_text': compliance.footer_text,
            'personalization_tokens': {
                'facts_used': facts_used,
                'industry': normalized_business.get('industry_guess'),
                'regeneration_attempts': attempt,
                'is_follow_up': True,
                'previous_subject': previous_email.get('subject', ''),
                'custom_data_used': bool(custom_business_data or custom_contact_data),
            },
            'confidence_score': confidence_score,
            'deliverability_score': compliance.deliverability_score,
            'spam_flags': compliance.spam_flags,
            'status': decision.final_status,
        }

    except CircuitBreakerError as e:
        return {
            'success': False,
            'error': f"Service temporarily unavailable: {str(e)}",
            'business_id': business.get('id', ''),
            'contact_id': contact.get('id', contact.get('email', '')),
        }

    except Exception as e:
        return {
            'success': False,
            'error': str(e),
            'business_id': business.get('id', ''),
            'contact_id': contact.get('id', contact.get('email', '')),
        }
