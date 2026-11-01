import { useState } from 'react';
import { Loader } from 'lucide-react';
import { Button, Card, Field, Section, TextInput } from './ui';
import { AI_MODELS, getAiConfig, setAiConfig, type AiConfig, type AiTask } from '../lib/ai';
import { testAi } from '../lib/aiTasks';

declare const __BUILD_TIME__: string;

const TASKS: Array<{ id: AiTask; label: string }> = [
  { id: 'lesson', label: 'Dictée des séances' },
  { id: 'fiche', label: 'Fiches adaptées' },
  { id: 'animation', label: 'Schémas animés' },
];

/** Réglages de l'assistant : la clé d'API reste sur cet appareil. */
export function AiSection() {
  const [config, setConfig] = useState<AiConfig>(getAiConfig);
  const [results, setResults] = useState<Partial<Record<AiTask, string | null>>>({});
  const [testing, setTesting] = useState(false);

  const update = (next: AiConfig) => {
    setConfig(next);
    setAiConfig(next);
  };
  const test = async () => {
    setTesting(true);
    setResults({});
    await testAi((task, result) => setResults((cur) => ({ ...cur, [task]: result })));
    setTesting(false);
  };

  return (
    <Section title="Assistant IA (API Claude)">
      <Card>
        <p className="muted small">
          Claude comprend votre dictée et crée des fiches et des schémas. L'usage se paie à la demande sur votre compte API, séparé de l'abonnement Claude. Créez la clé sur{' '}
          <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer">
            la console Anthropic
          </a>
          . Sans clé, la dictée fonctionne avec les mots-clés.
        </p>
        <Field label="Clé d'API (sur cet appareil uniquement, jamais synchronisée)">
          <TextInput type="password" autoComplete="off" value={config.apiKey} onChange={(apiKey) => update({ ...config, apiKey: apiKey.trim() })} placeholder="sk-ant-…" />
        </Field>
        <div className="grid grid-2" style={{ marginTop: 10 }}>
          {TASKS.map((t) => (
            <Field key={t.id} label={t.label}>
              <select className="input" value={config.models[t.id]} onChange={(e) => update({ ...config, models: { ...config.models, [t.id]: e.target.value } })}>
                {AI_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </Field>
          ))}
        </div>
        <div className="row" style={{ gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          <Button size="sm" variant="primary" onClick={test} disabled={!config.apiKey || testing} icon={testing ? <Loader size={15} className="spin" /> : undefined}>
            {testing ? 'Essai en cours…' : 'Tester les 3 fonctions'}
          </Button>
          {config.apiKey && (
            <Button size="sm" variant="ghost" onClick={() => update({ ...config, apiKey: '' })}>
              Retirer la clé de cet appareil
            </Button>
          )}
        </div>
        {TASKS.filter((t) => t.id in results).map((t) => (
          <p key={t.id} className={results[t.id] ? 'error-text small' : 'small'}>
            {results[t.id] ? `✗ ${t.label} : ${results[t.id]}` : `✓ ${t.label} : ça fonctionne`}
          </p>
        ))}
        <p className="muted small">L'essai fait de vrais appels : quelques centimes au plus. Vos phrases et le contenu de la séance sont envoyés à Anthropic ; évitez de dicter des noms d'élèves.</p>
        <p className="muted small">Version de l'application : {new Date(__BUILD_TIME__).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}</p>
      </Card>
    </Section>
  );
}
