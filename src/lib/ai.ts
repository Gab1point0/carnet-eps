// Appels à l'API Claude, directement depuis le navigateur, avec la clé de l'enseignant.
// La clé reste sur l'appareil (localStorage) : elle n'entre jamais dans les données synchronisées.

const KEY = 'carnet-eps:ia';

export type AiTask = 'lesson' | 'fiche' | 'animation';

export const AI_MODELS = [
  { id: 'claude-haiku-5-5', label: 'Haiku 5.5 (le moins cher)' },
  { id: 'claude-sonnet-5-5', label: 'Sonnet 5.5 (équilibré)' },
  { id: 'claude-opus-5-5', label: 'Opus 5.5 (le plus poussé)' },
];

export interface AiConfig {
  apiKey: string;
  models: Record<AiTask, string>;
}

const DEFAULTS: AiConfig = {
  apiKey: '',
  models: { lesson: 'claude-haiku-5-5', fiche: 'claude-haiku-5-5', animation: 'claude-sonnet-5-5' },
};

export function getAiConfig(): AiConfig {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    return raw ? { apiKey: raw.apiKey ?? '', models: { ...DEFAULTS.models, ...(raw.models ?? {}) } } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

export function setAiConfig(c: AiConfig) {
  try {
    localStorage.setItem(KEY, JSON.stringify(c));
  } catch {
    /* stockage indisponible */
  }
}

export const aiReady = () => !!getAiConfig().apiKey.trim();

/** Une erreur à montrer telle quelle à l'enseignant. */
export class AiError extends Error {}

/** Pièce jointe lue par Claude : photo (JPEG, PNG…) ou PDF, en base64. */
export interface Attachment {
  name: string;
  mediaType: string;
  data: string;
}

interface CallOptions {
  task: AiTask;
  system: string;
  user: string;
  schema: Record<string, unknown>;
  attachments?: Attachment[];
}

/** Message de l'enseignant : les documents d'abord, puis la consigne (ordre conseillé pour l'analyse de documents). */
function userContent(user: string, attachments: Attachment[] = []) {
  if (!attachments.length) return user;
  return [
    ...attachments.map((a) =>
      a.mediaType === 'application/pdf'
        ? { type: 'document' as const, source: { type: 'base64' as const, media_type: 'application/pdf' as const, data: a.data }, title: a.name }
        : { type: 'image' as const, source: { type: 'base64' as const, media_type: a.mediaType as 'image/jpeg', data: a.data } },
    ),
    { type: 'text' as const, text: user },
  ];
}

/** Demande à Claude une réponse JSON conforme au schéma. */
export async function callClaude<T>({ task, system, user, schema, attachments }: CallOptions): Promise<T> {
  const config = getAiConfig();
  if (!config.apiKey.trim()) throw new AiError('Aucune clé d\'API : ajoutez-la dans Réglages, « Assistant IA ».');
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: config.apiKey.trim(), dangerouslyAllowBrowser: true });
  const model = config.models[task];
  const params = {
    model,
    max_tokens: 16000,
    system,
    messages: [{ role: 'user' as const, content: userContent(user, attachments) as never }],
    output_config: { effort: 'medium' as const, format: { type: 'json_schema' as const, schema } },
  };
  try {
    // Sonnet et Opus : si un filtre de sécurité refuse à tort, l'API réessaie seule sur un autre modèle.
    const msg = model.includes('haiku')
      ? await client.messages.create(params)
      : await client.beta.messages.create({ ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' } as never);
    const res = msg as unknown as { stop_reason: string | null; content: Array<{ type: string; text?: string }> };
    if (res.stop_reason === 'refusal') throw new AiError('Claude a refusé cette demande. Reformulez-la.');
    if (res.stop_reason === 'max_tokens') throw new AiError('La réponse est trop longue. Essayez une demande plus courte.');
    const text = res.content.find((b) => b.type === 'text')?.text;
    if (!text) throw new AiError('Réponse vide de Claude. Réessayez.');
    return JSON.parse(text) as T;
  } catch (e) {
    if (e instanceof AiError) throw e;
    if (e instanceof Anthropic.AuthenticationError) throw new AiError('Clé d\'API refusée : vérifiez-la dans Réglages.');
    if (e instanceof Anthropic.PermissionDeniedError) throw new AiError('Cette clé n\'a pas accès à ce modèle.');
    if (e instanceof Anthropic.RateLimitError) throw new AiError('Trop de demandes d\'un coup : réessayez dans une minute.');
    if (e instanceof Anthropic.BadRequestError) {
      if (/credit/i.test(e.message)) throw new AiError('Crédit épuisé : rechargez-le sur la console Anthropic.');
      throw new AiError(`Demande refusée par l'API : ${e.message}`);
    }
    if (e instanceof Anthropic.APIConnectionError) throw new AiError('Pas de connexion à l\'API : vérifiez internet.');
    if (e instanceof Anthropic.APIError) throw new AiError(`Erreur de l'API (${e.status ?? 'inconnue'}). Réessayez.`);
    if (e instanceof SyntaxError) throw new AiError('Réponse illisible de Claude. Réessayez.');
    throw e;
  }
}

/**
 * Recherche en ligne (référentiels officiels) : Claude cherche avec l'outil de recherche web côté serveur
 * et renvoie un texte de synthèse. Sonnet au minimum : la recherche filtrée n'existe pas sur Haiku.
 */
export async function callClaudeResearch({ system, user }: { system: string; user: string }): Promise<string> {
  const config = getAiConfig();
  if (!config.apiKey.trim()) throw new AiError('Aucune clé d\'API : ajoutez-la dans Réglages, « Assistant IA ».');
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: config.apiKey.trim(), dangerouslyAllowBrowser: true });
  const model = config.models.fiche.includes('haiku') ? 'claude-sonnet-5-5' : config.models.fiche;
  const messages: Array<{ role: 'user' | 'assistant'; content: unknown }> = [{ role: 'user', content: user }];
  try {
    // La recherche se fait côté serveur ; une longue recherche peut s'arrêter en « pause_turn » : on la relance telle quelle.
    for (let i = 0; i < 4; i++) {
      const res = (await client.messages.create({
        model,
        max_tokens: 16000,
        system,
        messages: messages as never,
        tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 6 } as never],
      })) as unknown as { stop_reason: string | null; content: Array<{ type: string; text?: string }> };
      if (res.stop_reason === 'pause_turn') {
        messages.push({ role: 'assistant', content: res.content });
        continue;
      }
      if (res.stop_reason === 'refusal') throw new AiError('Claude a refusé cette recherche.');
      const text = res.content.filter((b) => b.type === 'text').map((b) => b.text ?? '').join('').trim();
      if (!text) throw new AiError('La recherche du référentiel n\'a rien donné. Collez le référentiel vous-même.');
      return text;
    }
    throw new AiError('La recherche du référentiel est trop longue. Collez le référentiel vous-même.');
  } catch (e) {
    if (e instanceof AiError) throw e;
    if (e instanceof Anthropic.AuthenticationError) throw new AiError('Clé d\'API refusée : vérifiez-la dans Réglages.');
    if (e instanceof Anthropic.APIConnectionError) throw new AiError('Pas de connexion à l\'API : vérifiez internet.');
    if (e instanceof Anthropic.APIError) throw new AiError(`Erreur de l'API pendant la recherche (${e.status ?? 'inconnue'}) : ${e.message}`);
    throw e;
  }
}
