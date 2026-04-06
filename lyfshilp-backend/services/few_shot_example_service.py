"""
Few-shot Example Service
Stores reusable drafting examples in PostgreSQL and renders them into AI prompts.
"""

from __future__ import annotations

from typing import List

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.models import FewShotExample, Stakeholder

DEFAULT_FEW_SHOT_EXAMPLES: list[dict[str, object]] = [
    {
        "doc_type": "whatsapp",
        "stakeholder": Stakeholder.PARENT,
        "title": "Parent fee reminder with deadline and revised fee warning",
        "input_context": (
            "Purpose: fee follow-up for a long-pending final installment.\n"
            "Tone: respectful but firm.\n"
            "Key details: mention repeated outreach attempts, dues pending for Ms. Tishya, "
            "request payment by 10 March 2026, and explain that if payment carries into the "
            "next financial year starting 28 March 2026, the revised quarterly fee of "
            "Rs 37,701 will apply instead of Rs 33,000."
        ),
        "output_text": (
            "Dear Parent,\n\n"
            "We have reached out to you multiple times but have not been able to connect. "
            "The final installment of Ms. Tishya's fee has been pending for a long time now. "
            "We request you to clear the dues at the earliest by 10th March 2026.\n\n"
            "Please note that if the payment carries forward to the next financial year "
            "(starting 28th March 2026), the revised quarterly fee (Rs 150,804 / 4 = Rs 37,701) "
            "will be applicable instead of the current fee of Rs 33,000.\n\n"
            "Thanks,\n"
            "Accounts Team,\n"
            "Lyfshilp Academy Pvt. Ltd."
        ),
        "sort_order": 10,
    },
    {
        "doc_type": "whatsapp",
        "stakeholder": Stakeholder.PARENT,
        "title": "Parent counselling follow-up after institute visit",
        "input_context": (
            "Purpose: follow up after a parent visited the institute for Board and CUET preparation.\n"
            "Tone: warm, professional, and low-pressure.\n"
            "Key details: reference the 7 March visit, mention the parent planned to come back "
            "with her husband, and ask for a convenient time for a detailed counselling session."
        ),
        "output_text": (
            "Good Morning Ma'am,\n\n"
            "You had visited our institute, Lyfshilp Academy, on 7th March regarding your "
            "daughter's Board & CUET preparation. I just wanted to check in to see if you had "
            "a chance to decide when you might like to come for the detailed counselling session, "
            "as you had mentioned you would come along with your husband.\n\n"
            "Please feel free to let me know a convenient time for you. We would be happy to "
            "schedule the session accordingly.\n\n"
            "Best,\n"
            "Lyfshilp Academy"
        ),
        "sort_order": 20,
    },
    {
        "doc_type": "whatsapp",
        "stakeholder": Stakeholder.PARENT,
        "title": "Parent trust-building announcement about founder recognition",
        "input_context": (
            "Purpose: share a founder achievement update that strengthens credibility and trust.\n"
            "Tone: proud, credible, and concise.\n"
            "Key details: mention Sharad Raj Utsav being selected for the Stanford Seed "
            "Transformation Program South Asia cohort and connect that achievement back to "
            "the student experience at Lyfshilp Academy."
        ),
        "output_text": (
            "Sharad Raj Utsav, Founder and CEO of Agility AI and Lyfshilp Academy, has been "
            "selected for the Stanford Seed Transformation Program, South Asia cohort - a curated "
            "group of 100 high-potential entrepreneurs chosen by Stanford to grow, scale, and lead "
            "with impact.\n\n"
            "The same frameworks and thinking that shape this program are woven into every program "
            "of Lyfshilp Academy that our students experience.\n\n"
            "We are grateful for your support and trust in us.\n\n"
            "Best,\n"
            "Lyfshilp Academy"
        ),
        "sort_order": 30,
    },
    {
        "doc_type": "whatsapp",
        "stakeholder": Stakeholder.STUDENT,
        "title": "Student update on syllabus timeline and admissions deadline",
        "input_context": (
            "Purpose: address student concerns, share process clarity, and create urgency for admissions.\n"
            "Tone: clear, structured, and direct.\n"
            "Key details: explain that the complete syllabus flow and year timeline will be shared "
            "on 1 April during class, instruct students to plan leaves accordingly, mention admissions "
            "for Classes 9, 11, and 12, and urge seat booking by 31 March because classes start on 1 April "
            "with no repeat batches."
        ),
        "output_text": (
            "Dear Students,\n\n"
            "As per the concerns raised by some students, and with the new academic session beginning "
            "on 1st April, we will be sharing the complete syllabus flow along with a detailed timeline "
            "for the year for each class. This will help you clearly understand your completion targets "
            "in advance.\n\n"
            "Please ensure that you follow the timeline strictly and plan your leaves/holidays/study plans "
            "accordingly. All details will be shared on 1st April during your class.\n\n"
            "Admissions are open for Classes 9, 11, and 12. We urge you to book your seat by 31st March, "
            "as classes will commence from 1st April and there will be no repeat batches in order to "
            "maintain the academic schedule.\n\n"
            "In case of any further concerns that you may have, you can schedule a call with me directly.\n\n"
            "Regards,\n"
            "Shreya Sinha\n"
            "Co Founder, Lyfshilp Academy\n"
            "https://www.linkedin.com/in/shreya-sinha2802/"
        ),
        "sort_order": 40,
    },
    {
        "doc_type": "whatsapp",
        "stakeholder": Stakeholder.STUDENT,
        "title": "Student motivation note for new academic year start",
        "input_context": (
            "Purpose: motivate students at the start of the academic year.\n"
            "Tone: encouraging, aspirational, and mentor-like.\n"
            "Key details: reference CLAT, IPMAT, and CUET goals, encourage consistency and reaching out "
            "to mentors when stuck, and mention that classes begin on 4 April at 10:00 AM."
        ),
        "output_text": (
            "Dear Students,\n\n"
            "As you step into this new academic year, take a moment to set a strong intention to make "
            "this your best year yet.\n\n"
            "You are on an important journey towards your dream college through CLAT, IPMAT and CUET. "
            "Make it count by pushing your limits, staying consistent, and giving your best every single day.\n\n"
            "Remember, growth happens when you challenge yourself. Don't hesitate to reach out to your mentors "
            "whenever you feel stuck. We are here to support you.\n\n"
            "Classes will begin on 4th April at 10:00 AM.\n\n"
            "Let's work together to unlock your full potential and make this year truly worthwhile.\n\n"
            "Best wishes,\n"
            "Shreya Sinha\n"
            "Co Founder, Lyfshilp Academy\n"
            "https://www.linkedin.com/in/shreya-sinha2802/"
        ),
        "sort_order": 50,
    },
    {
        "doc_type": "whatsapp",
        "stakeholder": Stakeholder.PRINCIPAL,
        "title": "Principal outreach for school-based FutureX bundled summer initiative",
        "input_context": (
            "Purpose: introduce the FutureX summer initiative to a school principal.\n"
            "Tone: respectful, insight-led, and concise.\n"
            "Key details: explain that students who use AI effectively can build personalised prep systems "
            "for exams like JEE, NEET, and CLAT, cite Harvard Business School and MIT Sloan research on "
            "AI-assisted learning, mention Stanford Seed South Asia recognition, present the bundled "
            "three-part school initiative, and stress zero infrastructure cost and zero faculty burden."
        ),
        "output_text": (
            "Dear Principal Sir,\n\n"
            "We are reaching out to share an initiative that is genuinely the need of the hour.\n\n"
            "Students who use AI effectively no longer need to depend solely on coaching institutes. "
            "They can build their own personalised, high-quality training programs - for IIT-JEE, NEET, "
            "CLAT, and beyond. Harvard Business School and MIT Sloan research shows AI-assisted learning "
            "significantly improves retention and output quality and our program is built exactly around this.\n\n"
            "Stanford Seed | Graduate School of Business has shortlisted 100 startups from South Asia for "
            "Scale and Lyfshilp Academy is proudly among them.\n\n"
            "Our Summer program for FutureX is a bundled 3-part initiative delivered at your school:\n\n"
            "1. Teacher AI Workshop - equipping educators to integrate AI into daily teaching\n"
            "2. Student AI Awareness Session - building responsible AI habits from day one\n"
            "3. 10-Session Summer Deep-Dive - students build their own personalised exam prep system using AI, "
            "mapped to JEE, NEET, CLAT & more\n\n"
            "All three parts are offered together, zero infrastructure cost, zero burden on faculty.\n\n"
            "Happy to connect at your convenience.\n\n"
            "Warm regards,\n"
            "Bhawna Khorwal\n"
            "Lyfshilp Academy\n"
            "+91 70421 49608"
        ),
        "sort_order": 60,
    },
    {
        "doc_type": "whatsapp",
        "stakeholder": Stakeholder.PRINCIPAL,
        "title": "Principal referral outreach with social proof from peer schools",
        "input_context": (
            "Purpose: principal outreach through a warm referral.\n"
            "Tone: respectful, credible, and direct.\n"
            "Key details: mention the referral from Kuriakose Sir of St. Thomas School, explain the AI-driven "
            "student prep proposition, cite Harvard research, mention Stanford Seed recognition, outline the "
            "three-part program, and add social proof from DPS and Mt. Carmel conversations."
        ),
        "output_text": (
            "Dear Principal Sir,\n\n"
            "Kuriakose Sir, Principal of St. Thomas School, Indirapuram, shared your contact and felt your "
            "school would benefit from what we are building.\n\n"
            "Students who use AI effectively no longer need to depend solely on coaching institutes. They can "
            "build their own personalised, high-quality training programs for IIT-JEE, NEET, CLAT, and beyond. "
            "Harvard Business School research shows AI-assisted learning significantly improves retention and "
            "output quality - and our program is built exactly around this.\n\n"
            "Stanford Seed | Graduate School of Business has shortlisted 100 startups from South Asia - "
            "Lyfshilp Academy is proudly among them.\n\n"
            "The program is a bundled 3-part initiative:\n\n"
            "1. Teacher AI Workshop - equipping educators to integrate AI into daily teaching\n"
            "2. Student AI Awareness Session - building responsible AI habits from day one\n"
            "3. 10-Session Summer Deep-Dive - students build their own personalised exam prep system using AI, "
            "mapped to JEE, NEET, CLAT & more\n\n"
            "All three parts are offered together, zero infrastructure cost, zero burden on faculty.\n\n"
            "We are already in advanced discussions with DPS Mathura Road, DPS Gurugram, DPS Faridabad & DPS "
            "Dehradun and many more. Mt. Carmel School, Dwarka has been onboard.\n\n"
            "Would love to connect briefly.\n\n"
            "Warm regards,\n"
            "Bhawna Khorwal\n"
            "Lyfshilp Academy\n"
            "+91 70421 49608"
        ),
        "sort_order": 70,
    },
    {
        "doc_type": "whatsapp",
        "stakeholder": Stakeholder.PARENT,
        "title": "Parent programme launch message for school-specific FutureX AI Scholar cohort",
        "input_context": (
            "Purpose: invite parents from a partner school to the FutureX AI Scholar Programme.\n"
            "Tone: exciting, trust-building, and conversion-oriented.\n"
            "Key details: lead with the 40% AI productivity claim from Harvard research, mention Stanford Seed, "
            "IIIT Allahabad, and DPIIT credibility, explain the 10-session programme outcome, highlight prizes, "
            "state the Rs 2,999 plus GST fee, create scarcity, and include the mentor and application link."
        ),
        "output_text": (
            "What if your child could study 40% more efficiently using AI?\n\n"
            "Harvard research shows AI can boost productivity by 40%+ when used correctly.\n\n"
            "This summer, Lyfshilp Academy (Shortlisted among Top 100 South Asia Startups - Stanford Seed "
            "Graduate School of Business | IIIT Allahabad | DPIIT) brings the FutureX AI Scholar Programme for "
            "students of St. Thomas School, Indirapuram.\n\n"
            "Students will learn to build their own AI-powered study system for JEE, NEET, CLAT, CA Foundation "
            "and beyond.\n\n"
            "In just 10 live sessions, your child will:\n"
            "- Build AI apps (no coding required, open to all streams)\n"
            "- Create a personalised AI Tutor\n"
            "- Plan smarter, test better, and improve faster\n"
            "- Track progress with performance dashboards\n\n"
            "Top 20 students across India will pitch to IIT/IIM professors, founders and senior leaders.\n"
            "Prizes worth Rs 85,000.\n\n"
            "Fee: Rs 2,999 + GST (one-time)\n\n"
            "Limited seats. First batch almost full.\n\n"
            "Program Mentor: Mr. Sharadd Raaj Utsav\n"
            "https://www.linkedin.com/in/sharadrajutsav/\n\n"
            "Apply here:\n"
            "https://docs.google.com/forms/d/e/1FAIpQLSfiu85YnO8dRTOS0voCEjZNX4Z3zFqCECmj7qzd-c8d7DeZAw/viewform?usp=header\n\n"
            "Warm Regards,\n"
            "Bhawna Khorwal\n"
            "Head - School Alliance\n"
            "+91 70421 49608"
        ),
        "sort_order": 80,
    },
    {
        "doc_type": "whatsapp",
        "stakeholder": Stakeholder.PARENT,
        "title": "Parent selection announcement for FutureX Fellowship with seat booking CTA",
        "input_context": (
            "Purpose: inform parents that their child has been selected for a premium fellowship program.\n"
            "Tone: celebratory, premium, and reassuring.\n"
            "Key details: mention selection of 48 out of 1,260 applicants, explain what the fellowship covers, "
            "highlight mentors and final venture pitch outcome, state seat booking deadline of 5 April, mention "
            "orientation on 11 April from 10 AM to 12 PM, and include the Rs 10,000 booking link."
        ),
        "output_text": (
            "Dear Parent,\n\n"
            "We are delighted to share some wonderful news, your child has been selected for the International "
            "FutureX Fellowship Program.\n\n"
            "Out of 1,260 applicants from across India, only 48 students have been shortlisted into two cohorts "
            "of 24 each. Your child is one of them. This was not a random selection, our team identified real "
            "potential in them to build a venture with the right guidance and mentorship.\n\n"
            "What is FutureX Fellowship?\n"
            "It is a structured entrepreneurship and future-skills program where your child will be guided to "
            "build their own venture alongside a curriculum covering:\n"
            "- AI & Future Tech\n"
            "- Finance & Wealth Skills\n"
            "- Digital Marketing & Branding\n"
            "- Business Communication\n\n"
            "Who will guide them?\n"
            "Mentors from across the globe: Founders, Professors, and Industry Experts will work with your child "
            "one-on-one whenever they face a roadblock. Sessions will primarily be conducted online.\n\n"
            "What's the outcome?\n"
            "At the end of the program, students get to pitch their venture to a panel of Incubators and VCs for "
            "potential funding. Beyond the program, they remain part of an elite FutureX Fellows community for life "
            "- a network of driven young minds from across India.\n\n"
            "Key Dates to Note:\n"
            "Seat Booking Deadline: 5th April\n"
            "Orientation Session: 11th April, 10 AM - 12 PM (with Sharadd Sir who will himself lead the program for "
            "the selected cohort) https://www.linkedin.com/in/sharadrajutsav/\n\n"
            "Seat Booking Amount: Rs 10,000 (part of the overall program fee). Please ensure this is done before "
            "5th April, as seats not confirmed will be offered to the waiting list. You can use the following link "
            "to book your seat.\n"
            "https://rzp.io/rzp/futureX\n\n"
            "This is a meaningful opportunity for your child to develop entrepreneurial thinking and real-world "
            "skills and build venture at an early stage. We would love to have them be part of this journey.\n\n"
            "Feel free to reach out if you have any questions. We are happy to speak with you directly.\n\n"
            "Warm regards,\n"
            "Riya Sharma\n"
            "FutureX Fellowship Team\n\n"
            "Lyfshilp Academy Pvt. Ltd.\n"
            "Stanford Seed - Shortlisted among Top 100 promising Startups in South Asia | IIIT Allahabad Incubated "
            "| DPIIT Recognized\n"
            "https://www.lyfshilp.com/"
        ),
        "sort_order": 90,
    },
    {
        "doc_type": "whatsapp",
        "stakeholder": Stakeholder.STUDENT,
        "title": "Student class schedule note with reassurance and homework reminder",
        "input_context": (
            "Purpose: notify the group that there is no class today while maintaining trust in the academic plan.\n"
            "Tone: clear, reassuring, and instructional.\n"
            "Key details: say there is no domain class today, ask students to follow the group schedule, explain "
            "that the pacing is intentionally slower at the start to build foundations, remind them to practice and "
            "complete homework, and mention the first English oral test tomorrow."
        ),
        "output_text": (
            "Dear Parents & Students,\n\n"
            "This is to inform you that there is no Domain Class scheduled for today.\n\n"
            "As part of our planned rollout, the overall class schedule is being structured to ensure we meet all "
            "academic targets effectively. We request you to regularly check and follow the schedule shared in this "
            "group to stay on track.\n\n"
            "Please be assured that the preparation plan has been thoughtfully designed to maximise results. We are "
            "intentionally keeping the pace slightly slower in the initial classes to help students build the right "
            "foundation and momentum for the upcoming weeks.\n\n"
            "We appreciate your cooperation in staying aligned with the plan.\n\n"
            "Keep practicing and make sure to complete your homework.\n\n"
            "P.S: As already communicated during the class, you will have your first oral test of english in your "
            "class tomorrow."
        ),
        "sort_order": 100,
    },
    {
        "doc_type": "whatsapp",
        "stakeholder": Stakeholder.STUDENT,
        "title": "Student session-planning update for new academic year concerns",
        "input_context": (
            "Purpose: address student concerns by clarifying how the new academic session will be structured.\n"
            "Tone: clear, direct, and process-oriented.\n"
            "Key details: explain that the complete syllabus flow and detailed yearly timeline will be shared on "
            "1 April during class, ask students to plan their schedules accordingly, and reinforce admissions "
            "urgency before 31 March because classes begin on 1 April with no repeat batches."
        ),
        "output_text": (
            "Dear Students,\n\n"
            "As per the concerns raised by some students, and with the new academic session beginning on 1st April, "
            "we will be sharing the complete syllabus flow along with a detailed timeline for the year for each class. "
            "This will help you clearly understand your completion targets in advance.\n\n"
            "Please ensure that you follow the timeline strictly and plan your leaves/holidays/study plans accordingly. "
            "All details will be shared on 1st April during your class.\n\n"
            "Admissions are open for Classes 9, 11, and 12. We urge you to book your seat by 31st March, as classes "
            "will commence from 1st April and there will be no repeat batches in order to maintain the academic schedule.\n\n"
            "In case of any further concerns that you may have, you can schedule a call with me directly.\n\n"
            "Regards,\n"
            "Shreya Sinha\n"
            "Co Founder, Lyfshilp Academy\n"
            "https://www.linkedin.com/in/shreya-sinha2802/"
        ),
        "sort_order": 110,
    },
]


class FewShotExampleService:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def ensure_seeded(self) -> None:
        for payload in DEFAULT_FEW_SHOT_EXAMPLES:
            stmt = select(FewShotExample).where(
                FewShotExample.doc_type == payload["doc_type"],
                FewShotExample.stakeholder == payload["stakeholder"],
                FewShotExample.title == payload["title"],
            )
            result = await self._session.execute(stmt)
            existing = result.scalar_one_or_none()
            if existing is None:
                self._session.add(
                    FewShotExample(
                        doc_type=str(payload["doc_type"]),
                        stakeholder=payload["stakeholder"],
                        title=str(payload["title"]),
                        input_context=str(payload["input_context"]),
                        output_text=str(payload["output_text"]),
                        sort_order=int(payload["sort_order"]),
                    )
                )
        await self._session.flush()

    async def list_examples(
        self,
        doc_type: str,
        stakeholder: Stakeholder,
        *,
        active_only: bool = True,
    ) -> List[FewShotExample]:
        stmt = (
            select(FewShotExample)
            .where(
                FewShotExample.doc_type == doc_type,
                FewShotExample.stakeholder == stakeholder,
            )
            .order_by(FewShotExample.sort_order.asc(), FewShotExample.created_at.asc())
        )
        if active_only:
            stmt = stmt.where(FewShotExample.is_active.is_(True))
        result = await self._session.execute(stmt)
        return list(result.scalars().all())

    async def render_examples_block(self, doc_type: str, stakeholder: Stakeholder) -> str:
        examples = await self.list_examples(doc_type, stakeholder)
        if not examples:
            return ""

        rendered_examples: list[str] = []
        for index, example in enumerate(examples, start=1):
            rendered_examples.append(
                "\n".join(
                    [
                        f"EXAMPLE {index}: {example.title}",
                        "INPUT CONTEXT:",
                        example.input_context,
                        "OUTPUT MESSAGE:",
                        example.output_text,
                    ]
                )
            )

        return (
            "FEW-SHOT EXAMPLES\n"
            "Use these examples as style and structure references when the user's context is similar. "
            "Do not copy them verbatim when details differ.\n\n"
            + "\n\n".join(rendered_examples)
        )
