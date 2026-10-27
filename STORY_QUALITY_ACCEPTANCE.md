# AI Story Traffic Platform — Story Quality Acceptance (RC-2 draft)

## Non-negotiable rules
- The product remains a **digital editorial newsroom**, not a one-click text generator or Facebook bot.
- Reuse existing Research → Brain / Story DNA → Generator → Style / Emotion → Editorial → Safety → Visual → Telegram Editor → Owner approval chain.
- Never publish to Facebook or the public site automatically. Never enable image generation or autopublishing without Owner approval.
- Sources and viral competitor signals provide themes, not copyable prose, scenes, characters, endings, or copyrighted examples.
- Maintain original longform Russian narratives: **8,000–20,000 characters**. Facebook hook/comment is a separate, shorter asset.
- Telegram must receive the complete story, with existing integrity checks and text fallback.

## Story acceptance by a human editor
1. Opening: the first line is specific, surprising or emotionally loaded, not clickbait without payoff.
2. Character: decisions follow a concrete desire, fear and contradiction. Side characters have coherent motives.
3. Causality: each scene changes the situation; events are not inserted just to extend length.
4. Conflict: stakes escalate organically. Dialogue sounds like people rather than editorial commentary.
5. Emotional evolution: the central relationship changes; the story does not repeat "она почувствовала боль" to fake emotion.
6. Turn: one significant fair reveal, supported by earlier details. Avoid the same letter, inheritance, secret child or hospital twist every time.
7. Payoff: consequences follow characters' actions, with a credible ending rather than a sermon.
8. Originality: compare with previous generated drafts; reject close duplicates and recognizable retellings.
9. Readability: natural modern Russian, consistent names/ages/timeline, short mobile-friendly paragraphs.
10. Editorial approval: **no numeric score alone certifies literary quality**. At least five diverse samples must be reviewed before production activation.

## Implemented in this branch
- `lib/longform-writer.js` is a private implementation helper of the existing Story Generator v2.
- Uses OpenAI Responses **only when** `STORY_TEXT_PROVIDER=openai` and a valid `OPENAI_API_KEY` is configured in the hosting environment.
- No automatic fallback to canned Russian plots if the AI call fails.
- Validates length, Russian language, paragraph count and obvious duplication **before** saving a draft.
- Uses the existing similarity, Safety, Editorial and human-approval chain.
- Generates no text through OpenAI when the feature flag is off.
- A mocked CI test never calls an external API or consumes credits.

## Production readiness blockers
- Verify real Russian longform quality against **five distinct plots** with human review.
- Confirm practical API model availability, billing and generation cost.
- Vercel's existing `api/index.js` function allows only 30 seconds. Long generation may time out; test this on a preview before enabling it in production. Do not raise time limits or add a background worker until the existing architecture is assessed.
- Build an evidence-based benchmark, including blind comparisons to real human-written originals. A score based only on keyword counts is not enough.
- Verify Telegram full-text integrity and PostgreSQL persistence with one **approved** test draft.
- Keep the separate GitHub CI PR (#2) under review; reconcile local Codex changes before merging.

## Safeguards
- API key never belongs in GitHub or a chat message.
- Feature remains disabled by default, and the primary production branch is unchanged by this PR.
- Failure to meet quality contract produces an error, not a counterfeit "AI-written" story.
- Owner remains the final editor and authorizes any release or publication.
