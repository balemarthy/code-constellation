import React, { useState, useEffect } from 'react';
import type { AiProvider, AppSettings } from '../types';

interface SettingsModalProps {
    onClose: () => void;
}

// ── Provider metadata ─────────────────────────────────────────────────────────

interface ProviderInfo {
    id: AiProvider;
    label: string;
    defaultModel: string;
    modelPlaceholder: string;
    keyPlaceholder: string;
    keyHint: string;
    needsKey: boolean;
    needsBaseUrl: boolean;
}

const PROVIDERS: ProviderInfo[] = [
    {
        id: 'claude',
        label: 'Claude',
        defaultModel: 'claude-opus-4-6',
        modelPlaceholder: 'claude-opus-4-6',
        keyPlaceholder: 'sk-ant-api03-…',
        keyHint: 'Get a free-tier key at console.anthropic.com',
        needsKey: true,
        needsBaseUrl: false,
    },
    {
        id: 'openai-compatible',
        label: 'OpenAI / Mistral / Groq / …',
        defaultModel: 'gpt-4o',
        modelPlaceholder: 'e.g. mistral-large-latest, gpt-4o, llama-3.3-70b',
        keyPlaceholder: 'Your API key',
        keyHint: 'Works with OpenAI, Mistral (free tier!), Together AI, Groq, Perplexity, and any OpenAI-compatible API.',
        needsKey: true,
        needsBaseUrl: true,
    },
    {
        id: 'gemini',
        label: 'Gemini',
        defaultModel: 'gemini-2.0-flash',
        modelPlaceholder: 'gemini-2.0-flash',
        keyPlaceholder: 'AIza…',
        keyHint: 'Get a free key at aistudio.google.com',
        needsKey: true,
        needsBaseUrl: false,
    },
    {
        id: 'ollama',
        label: 'Ollama (local)',
        defaultModel: 'llama3.2',
        modelPlaceholder: 'e.g. llama3.2, mistral, codellama',
        keyPlaceholder: '',
        keyHint: 'Runs locally — no API key needed. Install from ollama.com.',
        needsKey: false,
        needsBaseUrl: false,
    },
];

const BASE_URL_HINTS: Record<string, string> = {
    'LM Studio': 'http://localhost:1234/v1',
    'Mistral AI': 'https://api.mistral.ai/v1',
    'Groq': 'https://api.groq.com/openai/v1',
    'Together AI': 'https://api.together.xyz/v1',
    'Perplexity': 'https://api.perplexity.ai',
    'OpenAI': 'https://api.openai.com/v1',
};

// ── Component ─────────────────────────────────────────────────────────────────

const SettingsModal: React.FC<SettingsModalProps> = ({ onClose }) => {
    const [settings, setSettings] = useState<AppSettings>({ provider: 'claude' });
    const [showKey, setShowKey] = useState(false);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        window.api.getSettings().then(s => {
            setSettings({ provider: 'claude', ...s });
        }).catch(() => {});
    }, []);

    const provider = PROVIDERS.find(p => p.id === (settings.provider ?? 'claude'))!;

    const set = (patch: Partial<AppSettings>) =>
        setSettings(prev => ({ ...prev, ...patch }));

    const handleSave = async () => {
        setSaving(true);
        try {
            await window.api.saveSettings(settings);
            setSaved(true);
            setTimeout(onClose, 600);
        } catch (e) {
            console.error('Failed to save settings', e);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={onClose}>
            <div
                className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-[500px] shadow-2xl"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex items-center justify-between mb-5">
                    <h2 className="text-base font-semibold text-white">AI Settings</h2>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-lg leading-none">✕</button>
                </div>

                {/* Provider selector */}
                <div className="mb-4">
                    <label className="block text-xs font-medium text-gray-400 mb-2">AI Provider</label>
                    <div className="grid grid-cols-2 gap-2">
                        {PROVIDERS.map(p => (
                            <button
                                key={p.id}
                                onClick={() => set({ provider: p.id, model: '' })}
                                className={`px-3 py-2 rounded-lg text-xs text-left transition-all border ${
                                    settings.provider === p.id
                                        ? 'bg-blue-600/20 border-blue-500 text-blue-300 font-medium'
                                        : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600 hover:text-gray-300'
                                }`}
                            >
                                {p.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* API Key */}
                {provider.needsKey && (
                    <div className="mb-4">
                        <label className="block text-xs font-medium text-gray-400 mb-1.5">API Key</label>
                        <div className="relative">
                            <input
                                type={showKey ? 'text' : 'password'}
                                value={settings.apiKey ?? ''}
                                onChange={e => set({ apiKey: e.target.value })}
                                placeholder={provider.keyPlaceholder}
                                spellCheck={false}
                                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white pr-10 focus:outline-none focus:border-blue-500 font-mono"
                            />
                            <button
                                type="button"
                                onClick={() => setShowKey(v => !v)}
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                            >
                                {showKey
                                    ? <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                                    : <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                                }
                            </button>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">{provider.keyHint}</p>
                    </div>
                )}

                {/* Base URL (OpenAI-compatible only) */}
                {provider.needsBaseUrl && (
                    <div className="mb-4">
                        <label className="block text-xs font-medium text-gray-400 mb-1.5">
                            API Base URL <span className="text-gray-600 font-normal">(optional — leave blank for OpenAI)</span>
                        </label>
                        <input
                            type="text"
                            value={settings.apiBaseUrl ?? ''}
                            onChange={e => set({ apiBaseUrl: e.target.value })}
                            placeholder="https://api.mistral.ai/v1"
                            spellCheck={false}
                            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 font-mono"
                        />
                        {/* Quick-fill hints */}
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                            {Object.entries(BASE_URL_HINTS).map(([name, url]) => (
                                <button
                                    key={name}
                                    onClick={() => set({ apiBaseUrl: url })}
                                    className="text-[10px] px-2 py-0.5 rounded bg-gray-800 border border-gray-700 text-gray-400 hover:text-gray-200 hover:border-gray-600 transition-colors"
                                >
                                    {name}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Ollama URL */}
                {settings.provider === 'ollama' && (
                    <div className="mb-4">
                        <label className="block text-xs font-medium text-gray-400 mb-1.5">
                            Ollama URL <span className="text-gray-600 font-normal">(default: http://localhost:11434)</span>
                        </label>
                        <input
                            type="text"
                            value={settings.ollamaUrl ?? ''}
                            onChange={e => set({ ollamaUrl: e.target.value })}
                            placeholder="http://localhost:11434"
                            spellCheck={false}
                            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 font-mono"
                        />
                        <p className="text-xs text-gray-500 mt-1">{provider.keyHint}</p>
                    </div>
                )}

                {/* Model */}
                <div className="mb-5">
                    <label className="block text-xs font-medium text-gray-400 mb-1.5">
                        Model <span className="text-gray-600 font-normal">(optional — uses default if blank)</span>
                    </label>
                    <input
                        type="text"
                        value={settings.model ?? ''}
                        onChange={e => set({ model: e.target.value })}
                        placeholder={provider.modelPlaceholder}
                        spellCheck={false}
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 font-mono"
                    />
                </div>

                <div className="border-t border-gray-800 pt-4 flex justify-end gap-2">
                    <button
                        onClick={onClose}
                        className="px-4 py-1.5 text-sm bg-gray-800 text-gray-300 rounded-lg hover:bg-gray-700 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className={`px-4 py-1.5 text-sm rounded-lg font-medium transition-colors ${
                            saved
                                ? 'bg-green-600 text-white'
                                : 'bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-60'
                        }`}
                    >
                        {saved ? '✓ Saved' : saving ? 'Saving…' : 'Save'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default SettingsModal;
