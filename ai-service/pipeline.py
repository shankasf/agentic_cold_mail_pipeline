"""
Multi-Agent Pipeline Orchestrator
Coordinates all agents to generate emails from parsed chunks.
"""
import asyncio
from typing import Any, Callable, Awaitable
from schemas import EmailGenerationResult
from email_agents import (
    resolve_entities,
    analyze_business,
    write_email,
    check_compliance,
    make_decision,
)
import config


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
    progress_callback: Callable[[str], Awaitable[None]] | None = None
) -> dict[str, Any]:
    """
    Run the full email generation pipeline.

    Args:
        chunks: List of parsed chunks with {id, chunkIndex, textContent, sourceMeta}
        industry_playbooks: Optional dict mapping industry -> playbook
        progress_callback: Optional async callback for progress updates

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

    async def report_progress(msg: str):
        print(msg)
        if progress_callback:
            await progress_callback(msg)

    try:
        # Step 1: Entity Resolution
        await report_progress("🔍 Agent 1/5: EntityResolver - Extracting businesses & contacts...")
        entity_result = await resolve_entities(chunks)

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

        # Step 2-5: Process each business-contact pair
        total_businesses = len(business_map)
        business_idx = 0

        for biz_key, business in business_map.items():
            business_idx += 1
            contacts = business_contacts.get(biz_key, [])
            evidence = business_evidence.get(biz_key, [])

            if not contacts:
                await report_progress(f"⏭️ Skipping business {business_idx}/{total_businesses}: '{business.canonical_name}' (no contacts)")
                continue

            # Get industry playbook if available
            industry = business.industry_guess or ''
            playbook = industry_playbooks.get(industry.lower())

            # Get relevant chunks for this business
            relevant_chunk_ids = {e.chunk_id for e in evidence}
            relevant_chunks = [chunk_map[cid] for cid in relevant_chunk_ids if cid in chunk_map]

            try:
                # Step 2: Analyze business
                await report_progress(f"📊 Agent 2/5: BusinessAnalyzer - Analyzing '{business.canonical_name}' ({business_idx}/{total_businesses})")
                analysis = await analyze_business(
                    business=business.model_dump(),
                    evidence=[e.model_dump() for e in evidence],
                    chunks=relevant_chunks,
                    industry_playbook=playbook,
                )

                # Process each contact
                total_contacts = len(contacts)
                for contact_idx, contact in enumerate(contacts, 1):
                    try:
                        # Compute entity confidence (average of business and contact)
                        entity_confidence = (business.confidence + contact.confidence) // 2

                        # Step 3: Write email
                        await report_progress(f"✍️ Agent 3/5: EmailWriter - Writing email for {contact.email} ({contact_idx}/{total_contacts})")
                        email = await write_email(
                            business=business.model_dump(),
                            contact=contact.model_dump(),
                            facts_used=[f.model_dump() for f in analysis.facts_used],
                            pain_point=analysis.inferred_pain_point,
                            industry_playbook=playbook,
                        )

                        # Step 4: Check compliance
                        await report_progress(f"🛡️ Agent 4/5: ComplianceChecker - Checking spam & compliance...")
                        compliance = await check_compliance(
                            subject=email.subject,
                            body_text=email.body_text,
                        )

                        # Compute confidence score
                        confidence_score = compute_confidence_score(
                            [f.model_dump() for f in analysis.facts_used],
                            entity_confidence,
                        )

                        # Step 5: Gatekeeper decision
                        await report_progress(f"🚦 Agent 5/5: Gatekeeper - Making final decision...")
                        decision = await make_decision(
                            confidence_score=confidence_score,
                            deliverability_score=compliance.deliverability_score,
                            spam_flags=compliance.spam_flags,
                            analyzer_needs_review=analysis.needs_review,
                        )

                        # Build result
                        email_result = EmailGenerationResult(
                            business_id=biz_key,  # Will be replaced with real ID
                            contact_id=contact.email,  # Will be replaced with real ID
                            subject=email.subject,
                            body_text=email.body_text,
                            footer_text=compliance.footer_text,
                            personalization_tokens={
                                'facts_used': [f.model_dump() for f in analysis.facts_used],
                                'pain_point': analysis.inferred_pain_point,
                                'industry': business.industry_guess,
                            },
                            confidence_score=confidence_score,
                            deliverability_score=compliance.deliverability_score,
                            spam_flags=compliance.spam_flags,
                            status=decision.final_status,
                        )

                        results['emails'].append(email_result.model_dump())
                        await report_progress(f"✅ Email #{len(results['emails'])} generated: score={confidence_score}, status={decision.final_status}")

                    except Exception as e:
                        error_msg = f"Error processing contact {contact.email}: {str(e)}"
                        await report_progress(f"❌ {error_msg}")
                        results['errors'].append(error_msg)

            except Exception as e:
                error_msg = f"Error processing business {business.canonical_name}: {str(e)}"
                await report_progress(f"❌ {error_msg}")
                results['errors'].append(error_msg)

    except Exception as e:
        error_msg = f"Pipeline error: {str(e)}"
        await report_progress(f"❌ {error_msg}")
        results['errors'].append(error_msg)

    await report_progress(f"🏁 Pipeline complete: {len(results['emails'])} emails generated, {len(results['errors'])} errors")
    return results


async def recheck_compliance(subject: str, body_text: str) -> dict:
    """
    Re-run compliance check on an edited email.
    Used when admin edits an email and needs updated scores.
    """
    compliance = await check_compliance(subject, body_text)
    return compliance.model_dump()
