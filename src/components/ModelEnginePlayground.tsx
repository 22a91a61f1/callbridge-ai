import React, { useState } from 'react';
import {
  Cpu,
  Terminal,
  Send,
  Code,
  Zap,
  Volume2,
  CheckCircle2,
  Layers,
  Copy,
  Check,
  Activity,
  Bot,
  Gauge,
} from 'lucide-react';

export function ModelEnginePlayground() {
  const [selectedLanguage, setSelectedLanguage] = useState<'te' | 'hi' | 'en'>('te');
  const [promptInput, setPromptInput] = useState('నా ప్రాంతంలో తాగునీటి సమస్య ఉంది. రోజుకి ఒకసారి మాత్రమే నీళ్లు వస్తాయి.');
  const [isLoading, setIsLoading] = useState(false);
  const [modelResponse, setModelResponse] = useState<any>(null);
  const [copiedSnippet, setCopiedSnippet] = useState<string | null>(null);

  const samplePrompts: Record<'te' | 'hi' | 'en', string[]> = {
    te: [
      'నా ప్రాంతంలో తాగునీటి సమస్య ఉంది. రోజుకి ఒకసారి మాత్రమే నీళ్లు వస్తాయి.',
      'రోడ్ల మీద పెద్ద పెద్ద గుంతలు ఉన్నాయి, వర్షం పడితే నీళ్లు నిలుస్తున్నాయి.',
      'నేను మీకు ఎందుకు సమాధానం చెప్పాలి? మీరు ఎవరు?',
      'ఇప్పుడు నేను బిజీగా ఉన్నాను, తర్వాత కాల్ చేయండి.',
    ],
    hi: [
      'हमारे इलाके में पीने के पानी की बहुत किल्लत है।',
      'सड़कों पर बहुत गड्ढे हैं और बारिश में जलभराव हो जाता है।',
      'मैं अभी व्यस्त हूँ, बाद में बात करूँगा।',
    ],
    en: [
      'Drinking water is available only 2 days a week in our colony.',
      'Road conditions are very poor with major potholes.',
      'I am busy right now, please call me tomorrow morning.',
    ],
  };

  const handleTestTurn = async (textToTest = promptInput) => {
    setIsLoading(true);
    const t0 = Date.now();
    try {
      const res = await fetch('/api/callbridge/model/turn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: textToTest,
          language: selectedLanguage,
        }),
      });

      const data = await res.json();
      const t1 = Date.now();
      data.total_roundtrip_ms = t1 - t0;
      setModelResponse(data);
    } catch (err: any) {
      setModelResponse({ error: err.message });
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSnippet(id);
    setTimeout(() => setCopiedSnippet(null), 2000);
  };

  const curlCode = `curl -X POST https://your-server-domain/api/survey/interact \\
  -H "Content-Type: application/json" \\
  -d '{
    "messages": [
      { "role": "respondent", "text": "${promptInput}" }
    ],
    "surveyConfig": {
      "id": "public_facilities",
      "targetLanguage": "${selectedLanguage === 'te' ? 'Telugu' : selectedLanguage === 'hi' ? 'Hindi' : 'English'}"
    },
    "voice_id": "4XvBGCPMXWyVQa75dbZg"
  }'`;

  const pythonCode = `import requests

url = "https://your-server-domain/api/survey/interact"
payload = {
    "messages": [{"role": "respondent", "text": "${promptInput}"}],
    "surveyConfig": {"id": "public_facilities", "targetLanguage": "${selectedLanguage === 'te' ? 'Telugu' : 'English'}"},
    "voice_id": "YOUR_VOICE_ID"
}
response = requests.post(url, json=payload)
data = response.json()
print("Agent Reply:", data["reply"])
print("Audio Base64:", data.get("audio_base64")[:30], "...")`;

  return (
    <div className="space-y-6">
      {/* Model Banner */}
      <div className="p-6 rounded-2xl bg-slate-900 text-white shadow-xl border border-slate-800">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center space-x-2 px-2.5 py-1 rounded-full bg-indigo-500/20 text-indigo-300 text-xs font-semibold border border-indigo-500/30">
              <Cpu className="w-3.5 h-3.5" />
              <span>Standalone Conversational AI Voice Model Engine</span>
            </div>
            <h1 className="text-xl font-bold tracking-tight">CallBridge Voice Intelligence Model v3</h1>
            <p className="text-xs text-slate-400 max-w-2xl">
              Use this model independently via REST API, Python, or cURL. It delivers zero-hallucination dynamic follow-ups, robust conversational memory, and native multi-language Telugu/Hindi/English speech synthesis.
            </p>
          </div>

          <div className="flex items-center space-x-3 bg-slate-800/80 p-3 rounded-xl border border-slate-700">
            <Gauge className="w-5 h-5 text-emerald-400" />
            <div className="text-left text-xs">
              <div className="text-slate-400 font-medium">Avg Inference Latency</div>
              <div className="text-emerald-400 font-bold font-mono text-sm">~180ms</div>
            </div>
          </div>
        </div>
      </div>

      {/* Model Interactive Sandbox */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Input Sandbox */}
        <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-800 flex items-center space-x-2">
              <Terminal className="w-4 h-4 text-indigo-600" />
              <span>Model Turn Prompt Tester</span>
            </h3>

            {/* Language Selector */}
            <div className="flex items-center space-x-1 bg-slate-100 p-1 rounded-lg">
              <button
                onClick={() => {
                  setSelectedLanguage('te');
                  setPromptInput(samplePrompts.te[0]);
                }}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                  selectedLanguage === 'te' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600'
                }`}
              >
                Telugu (te)
              </button>
              <button
                onClick={() => {
                  setSelectedLanguage('hi');
                  setPromptInput(samplePrompts.hi[0]);
                }}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                  selectedLanguage === 'hi' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600'
                }`}
              >
                Hindi (hi)
              </button>
              <button
                onClick={() => {
                  setSelectedLanguage('en');
                  setPromptInput(samplePrompts.en[0]);
                }}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                  selectedLanguage === 'en' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600'
                }`}
              >
                English (en)
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">
              Respondent Spoken Input (Simulated)
            </label>
            <textarea
              rows={4}
              value={promptInput}
              onChange={(e) => setPromptInput(e.target.value)}
              className="w-full p-3 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-slate-50/50"
            />
          </div>

          {/* Quick preset samples */}
          <div className="space-y-1.5">
            <div className="text-[11px] font-semibold text-slate-400 uppercase">Quick Prompt Presets:</div>
            <div className="flex flex-wrap gap-1.5">
              {samplePrompts[selectedLanguage].map((sample, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    setPromptInput(sample);
                    handleTestTurn(sample);
                  }}
                  className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] transition-colors text-left truncate max-w-xs cursor-pointer"
                >
                  {sample}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={() => handleTestTurn()}
            disabled={isLoading}
            className="w-full flex items-center justify-center space-x-2 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm transition-colors disabled:opacity-50 cursor-pointer"
          >
            <Send className="w-3.5 h-3.5" />
            <span>{isLoading ? 'Running Model Evaluation...' : 'Run Turn Through Model'}</span>
          </button>
        </div>

        {/* Right: Output Inspection */}
        <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-800 flex items-center space-x-2">
              <Bot className="w-4 h-4 text-emerald-600" />
              <span>Model State & Output Inspector</span>
            </h3>
            {modelResponse?.total_roundtrip_ms && (
              <span className="text-xs font-mono text-emerald-600 font-semibold">
                Latency: {modelResponse.total_roundtrip_ms}ms
              </span>
            )}
          </div>

          {!modelResponse ? (
            <div className="p-12 rounded-xl border border-dashed border-slate-200 text-center text-xs text-slate-400 bg-slate-50/50">
              Run a test turn on the left to inspect the model's generated response and semantic evaluation.
            </div>
          ) : (
            <div className="space-y-4">
              {/* Spoken Text Result */}
              <div className="p-4 rounded-xl bg-indigo-50/70 border border-indigo-100 space-y-1.5">
                <div className="text-[10px] font-bold uppercase tracking-wider text-indigo-700">
                  Model Spoken Response ({selectedLanguage.toUpperCase()})
                </div>
                <div className="text-sm font-medium text-slate-800 leading-relaxed">
                  {modelResponse.reply}
                </div>
              </div>

              {/* JSON State Output */}
              <div className="space-y-1">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Raw Output Payload
                </div>
                <pre className="p-3.5 rounded-xl bg-slate-900 text-emerald-400 font-mono text-[11px] overflow-x-auto max-h-52">
                  {JSON.stringify(modelResponse, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Programmatic API / cURL Code Snippets */}
      <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <h3 className="text-sm font-bold text-slate-800 flex items-center space-x-2">
              <Code className="w-4 h-4 text-indigo-600" />
              <span>Headless API & Code Generator</span>
            </h3>
            <p className="text-xs text-slate-500">
              Integrate the conversational voice model directly into your backend, telephony provider, or custom scripts without any frontend.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
          {/* cURL Snippet */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
              <span>cURL (HTTP POST)</span>
              <button
                onClick={() => copyToClipboard(curlCode, 'curl')}
                className="flex items-center space-x-1 text-indigo-600 hover:text-indigo-800 text-[11px] cursor-pointer"
              >
                {copiedSnippet === 'curl' ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                <span>{copiedSnippet === 'curl' ? 'Copied!' : 'Copy cURL'}</span>
              </button>
            </div>
            <pre className="p-3.5 rounded-xl bg-slate-900 text-slate-200 font-mono text-[11px] overflow-x-auto">
              {curlCode}
            </pre>
          </div>

          {/* Python Snippet */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
              <span>Python (requests)</span>
              <button
                onClick={() => copyToClipboard(pythonCode, 'python')}
                className="flex items-center space-x-1 text-indigo-600 hover:text-indigo-800 text-[11px] cursor-pointer"
              >
                {copiedSnippet === 'python' ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                <span>{copiedSnippet === 'python' ? 'Copied!' : 'Copy Python'}</span>
              </button>
            </div>
            <pre className="p-3.5 rounded-xl bg-slate-900 text-slate-200 font-mono text-[11px] overflow-x-auto">
              {pythonCode}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
