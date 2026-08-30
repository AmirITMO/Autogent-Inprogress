import OpenAI from 'openai';
import { RawProfile, AIAnalysis } from './types';

export async function analyzeWithAI(
  profile: RawProfile,
  apiKey: string
): Promise<AIAnalysis> {
  const client = new OpenAI({ apiKey });

  const posts = profile.latestPosts.slice(0, 5).map((p, i) =>
    `Post ${i + 1}: views=${p.videoViewCount || 0}, likes=${p.likesCount}, caption="${p.caption.slice(0, 100)}"`
  ).join('\n');

  const prompt = `Analyse this Instagram profile as a potential creative professional lead.

Username: @${profile.username}
Full Name: ${profile.fullName}
Bio: ${profile.bio}
Followers: ${profile.followersCount}
Category: ${profile.businessCategory || 'not set'}
External URL: ${profile.externalUrl || 'none'}

Recent posts:
${posts}

Determine if this person is a creative professional (video maker, art director, filmmaker, photographer, designer, content creator, etc.) who creates high-quality visual content.

Answer in JSON:
{
  "description": "brief description of what this person does (1-2 sentences, in Russian)",
  "activitySummary": "brief activity/engagement summary (in Russian)",
  "isGoodLead": true/false,
  "confidence": 0.0-1.0,
  "reason": "why this is or isn't a good lead (in Russian, 1 sentence)"
}`;

  try {
    const res = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: prompt }],
    });

    const parsed = JSON.parse(res.choices[0].message.content || '{}');
    return {
      description: parsed.description || '',
      activitySummary: parsed.activitySummary || '',
      isGoodLead: Boolean(parsed.isGoodLead),
      confidence: Number(parsed.confidence || 0),
      reason: parsed.reason || '',
    };
  } catch {
    return {
      description: '',
      activitySummary: '',
      isGoodLead: false,
      confidence: 0,
      reason: 'Ошибка анализа',
    };
  }
}
