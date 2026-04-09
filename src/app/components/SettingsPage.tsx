import { useState, useEffect, useCallback } from "react";
import {
  Settings,
  Key,
  CheckCircle2,
  XCircle,
  Loader2,
  Eye,
  EyeOff,
  ExternalLink,
  FolderOpen,
  Save,
  Shield,
  Zap,
  AlertTriangle,
  Brain,
  Copy,
  Check,
  Info,
  ChevronDown,
  HardDrive,
  Plus,
  Trash2,
  RotateCcw,
  Search,
  Wifi,
  WifiOff,
  Terminal,
  Package,
  Download,
  Upload,
  AlertCircle,
} from "lucide-react";

// --- Import service layer & types ---
import type { AiModel, BackendStatus, PathConfig } from "../services/types";
import {
  getBackendStatus,
  loadAllSettings,
  saveAllSettings,
  saveModels as persistModels,
  testApiKey as serviceTestApiKey,
  fetchModelInfo,
  validatePaths,
  getModelProviders,
  getApiKeyConfigs,
  getDefaultPaths,
  generateBackendConfig,
} from "../services/settingsService";
import { toast } from "sonner";
import { BackendSetupTab } from "./settings/BackendSetupTab";
import { ExportImportResetPanel } from "./settings/ExportImportResetPanel";

// --- Types (UI-only, extends service types) ---

interface ApiKeyUiState {
  id: string;
  name: string;
  description: string;
  icon: string;
  placeholder: string;
  docsUrl: string;
  required: boolean;
  keyPrefix: string;
  status: "connected" | "invalid" | "unconfigured" | "testing";
  rateLimit?: string;
  usage?: string;
}

// --- Static data from service ---
const apiKeyConfigs = getApiKeyConfigs();
const defaultPaths = getDefaultPaths();
const providers = getModelProviders();

// --- Component ---

export function SettingsPage() {
  const [apis, setApis] = useState<ApiKeyUiState[]>(
    apiKeyConfigs.map((c) => ({ ...c, status: "unconfigured" }))
  );
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [visibility, setVisibility] = useState<Record<string, boolean>>({});
  const [paths, setPaths] = useState<PathConfig[]>(defaultPaths);
  const [models, setModels] = useState<AiModel[]>([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [activeSection, setActiveSection] = useState<"api" | "ai" | "paths" | "backend">("api");
  const [saved, setSaved] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [backendStatus, setBackendStatus] = useState<BackendStatus | null>(null);

  // Add model form state
  const [addProvider, setAddProvider] = useState("openai");
  const [addModelSlug, setAddModelSlug] = useState("");
  const [addingModel, setAddingModel] = useState(false);
  const [addError, setAddError] = useState("");

  // --- Load everything on mount via service ---
  useEffect(() => {
    async function init() {
      // Check backend connection
      const status = await getBackendStatus();
      setBackendStatus(status);

      // Load settings (service decides: localStorage or FastAPI)
      const settings = await loadAllSettings(defaultPaths);

      setKeys(settings.apiKeys);
      setSelectedModel(settings.selectedModel);
      if (settings.models.length > 0) setModels(settings.models);
      setPaths(settings.paths);

      // Update API statuses
      setApis((prev) =>
        prev.map((api) => ({
          ...api,
          status: settings.apiKeys[api.id] ? "connected" : "unconfigured",
        }))
      );

      // Validate paths if backend is available
      if (status.connected) {
        const validated = await validatePaths(settings.paths);
        setPaths(validated);
      }
    }
    init();
  }, []);

  // Persist models via service whenever they change
  useEffect(() => {
    persistModels(models);
  }, [models]);

  // --- Handlers ---

  const handleKeyChange = (id: string, value: string) => {
    setKeys((prev) => ({ ...prev, [id]: value }));
    setApis((prev) =>
      prev.map((api) => (api.id === id ? { ...api, status: "unconfigured" as const } : api))
    );
  };

  const handleTestKey = useCallback(
    async (id: string) => {
      const api = apiKeyConfigs.find((a) => a.id === id);
      if (!api) return;

      setApis((prev) => prev.map((a) => (a.id === id ? { ...a, status: "testing" as const } : a)));

      const result = await serviceTestApiKey(id, keys[id] || "", api.keyPrefix);

      setApis((prev) =>
        prev.map((a) => {
          if (a.id !== id) return a;
          if (result.valid) {
            return {
              ...a,
              status: "connected" as const,
              rateLimit: result.rateLimit,
              usage: result.usage,
            };
          }
          return { ...a, status: "invalid" as const };
        })
      );
    },
    [keys]
  );

  const handlePathChange = (id: string, value: string) => {
    setPaths((prev) => prev.map((p) => (p.id === id ? { ...p, path: value } : p)));
  };

  const handleSave = async () => {
    await saveAllSettings({
      apiKeys: keys,
      selectedModel,
      models,
      paths,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    toast.success("Settings saved successfully!");
  };

  const toggleVisibility = (id: string) => {
    setVisibility((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopiedId(null), 1500);
  };

  // --- Model management ---

  const handleAddModel = async () => {
    if (!addModelSlug.trim()) {
      setAddError("Enter a model ID");
      return;
    }
    const fullId =
      addProvider === "custom" ? addModelSlug.trim() : `${addProvider}/${addModelSlug.trim()}`;
    if (models.some((m) => m.id === fullId)) {
      setAddError("Model already in your list");
      return;
    }

    setAddError("");
    setAddingModel(true);

    try {
      const model = await fetchModelInfo(addProvider, addModelSlug.trim(), keys.openrouter);
      if (model) {
        setModels((prev) => [...prev, model]);
        setAddModelSlug("");
        if (models.length === 0) setSelectedModel(model.id);
      }
    } catch {
      setAddError("Failed to fetch model info");
    } finally {
      setAddingModel(false);
    }
  };

  const removeModel = (id: string) => {
    setModels((prev) => prev.filter((m) => m.id !== id));
    if (selectedModel === id && models.length > 1) {
      setSelectedModel(models.find((m) => m.id !== id)?.id || "");
    }
  };

  const clearAllModels = () => {
    setModels([]);
    setSelectedModel("");
  };

  const connectedCount = apis.filter((a) => a.status === "connected").length;
  const currentProvider = providers.find((p) => p.id === addProvider)!;
  const configJson = generateBackendConfig(paths, selectedModel);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-foreground">Settings</h1>
          <p className="text-sm text-muted-foreground mt-1">
            API keys, AI model configuration & local paths
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Backend status indicator */}
          {backendStatus && (
            <div
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs ${
                backendStatus.connected
                  ? "bg-chart-2/10 border-chart-2/20 text-chart-2"
                  : "bg-secondary border-border text-muted-foreground"
              }`}
            >
              {backendStatus.connected ? (
                <Wifi className="w-3 h-3" />
              ) : (
                <WifiOff className="w-3 h-3" />
              )}
              {backendStatus.connected
                ? `Backend connected (${backendStatus.mode})`
                : "Browser mode"}
            </div>
          )}

          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/20">
            <Key className="w-3.5 h-3.5 text-primary" />
            <span className="text-xs text-primary">
              {connectedCount}/{apis.length} APIs connected
            </span>
          </div>
          <button
            onClick={handleSave}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs transition-all ${
              saved
                ? "bg-chart-2 text-white"
                : "bg-primary text-primary-foreground hover:bg-primary/90"
            }`}
          >
            {saved ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5" /> Saved!
              </>
            ) : (
              <>
                <Save className="w-3.5 h-3.5" /> Save Settings
              </>
            )}
          </button>
        </div>
      </div>

      {/* Section Tabs */}
      <div className="flex gap-1 bg-card border border-border rounded-lg p-1 w-fit">
        {[
          { id: "api" as const, label: "API Keys", icon: Key },
          { id: "ai" as const, label: "AI Models", icon: Brain },
          { id: "paths" as const, label: "Paths", icon: FolderOpen },
          { id: "backend" as const, label: "Backend Setup", icon: Terminal },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveSection(tab.id)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-xs transition-colors ${
              activeSection === tab.id
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <tab.icon className="w-3.5 h-3.5" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* ========== API Keys Section ========== */}
      {activeSection === "api" && (
        <div className="space-y-4">
          <div className="flex items-start gap-3 px-4 py-3 bg-chart-4/5 border border-chart-4/15 rounded-xl">
            <Shield className="w-4 h-4 text-chart-4 mt-0.5 shrink-0" />
            <div>
              <div className="text-xs text-foreground">
                {backendStatus?.connected
                  ? "API keys are stored in encrypted config.json on disk"
                  : "API keys are stored locally in your browser"}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {backendStatus?.connected
                  ? "Managed by the FastAPI backend. Keys are encrypted at rest and never leave your machine."
                  : "When the Tauri backend is connected, keys will move to encrypted config.json on disk. Never shared externally."}
              </div>
            </div>
          </div>

          {apis.map((api) => (
            <div
              key={api.id}
              className={`bg-card border rounded-xl p-5 transition-all ${
                api.status === "connected"
                  ? "border-chart-2/20"
                  : api.status === "invalid"
                  ? "border-destructive/20"
                  : "border-border"
              }`}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center text-xl">
                    {api.icon}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm text-foreground">{api.name}</h3>
                      {api.required ? (
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-primary/15 text-primary">
                          Required
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-secondary text-muted-foreground">
                          Optional
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 max-w-xl">
                      {api.description}
                    </p>
                  </div>
                </div>
                <ApiStatusBadge status={api.status} />
              </div>

              <div className="flex gap-2 mb-3">
                <div className="flex-1 relative">
                  <input
                    type={visibility[api.id] ? "text" : "password"}
                    value={keys[api.id] || ""}
                    onChange={(e) => handleKeyChange(api.id, e.target.value)}
                    placeholder={api.placeholder}
                    className="w-full px-3 py-2.5 bg-secondary border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/50 pr-20"
                    style={{ fontFamily: "'JetBrains Mono', monospace" }}
                  />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1">
                    <button
                      onClick={() => toggleVisibility(api.id)}
                      className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {visibility[api.id] ? (
                        <EyeOff className="w-3.5 h-3.5" />
                      ) : (
                        <Eye className="w-3.5 h-3.5" />
                      )}
                    </button>
                    {keys[api.id] && (
                      <button
                        onClick={() => copyToClipboard(keys[api.id], api.id)}
                        className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {copiedId === api.id ? (
                          <Check className="w-3.5 h-3.5 text-chart-2" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => handleTestKey(api.id)}
                  disabled={!keys[api.id] || api.status === "testing"}
                  className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-primary/10 text-primary text-xs hover:bg-primary/20 transition-colors disabled:opacity-40"
                >
                  {api.status === "testing" ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Testing
                    </>
                  ) : (
                    <>
                      <Zap className="w-3.5 h-3.5" /> Test
                    </>
                  )}
                </button>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 text-xs">
                  {api.status === "connected" && api.rateLimit && (
                    <>
                      <span className="text-muted-foreground">
                        Rate: <span className="text-foreground">{api.rateLimit}</span>
                      </span>
                      <span className="text-muted-foreground">
                        Usage: <span className="text-foreground">{api.usage}</span>
                      </span>
                    </>
                  )}
                  {api.status === "invalid" && (
                    <span className="text-destructive flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" /> Invalid key format or authentication
                      failed
                    </span>
                  )}
                </div>
                <a
                  href={api.docsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
                >
                  Get API key <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ========== AI Models Section ========== */}
      {activeSection === "ai" && (
        <div className="space-y-6">
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Brain className="w-4 h-4 text-primary" />
                <h3 className="text-sm text-foreground">My Models</h3>
              </div>
              <span className="text-xs text-muted-foreground">{models.length} models</span>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              Your saved AI models, accessed through OpenRouter. Add any model by its provider ID
              below.
            </p>

            {!keys.openrouter && (
              <div className="flex items-start gap-3 px-4 py-3 bg-chart-4/5 border border-chart-4/15 rounded-xl mb-4">
                <AlertTriangle className="w-4 h-4 text-chart-4 mt-0.5 shrink-0" />
                <div>
                  <div className="text-xs text-foreground">OpenRouter API key required</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Add your OpenRouter key in the API Keys tab to enable AI features.
                  </div>
                </div>
              </div>
            )}

            {/* Model list */}
            <div className="space-y-2">
              {models.length === 0 && (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <Brain className="w-8 h-8 text-muted-foreground/30 mb-3" />
                  <div className="text-xs text-muted-foreground">No models added yet</div>
                  <div className="text-xs text-muted-foreground/60 mt-1">
                    Use the "Add Model" section below to add your preferred AI models
                  </div>
                </div>
              )}
              {models.map((model) => (
                <div
                  key={model.id}
                  onClick={() => setSelectedModel(model.id)}
                  className={`flex items-center gap-3 p-3.5 rounded-xl border cursor-pointer transition-all group ${
                    selectedModel === model.id
                      ? "bg-primary/5 border-primary/30"
                      : "bg-secondary/30 border-border hover:border-primary/15"
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                      selectedModel === model.id
                        ? "border-primary"
                        : "border-muted-foreground/30"
                    }`}
                  >
                    {selectedModel === model.id && (
                      <div className="w-2 h-2 rounded-full bg-primary" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-foreground">{model.name}</span>
                      {model.recommended && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-chart-2/15 text-chart-2">
                          Recommended
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {model.provider}{" "}
                      <span
                        className="text-muted-foreground/50"
                        style={{ fontFamily: "'JetBrains Mono', monospace" }}
                      >
                        {model.id}
                      </span>
                    </div>
                  </div>
                  <div className="text-right shrink-0 flex items-center gap-3">
                    <div>
                      <div
                        className="text-xs text-foreground"
                        style={{ fontFamily: "'JetBrains Mono', monospace" }}
                      >
                        {model.contextWindow}
                      </div>
                      <div
                        className="text-xs text-muted-foreground"
                        style={{ fontFamily: "'JetBrains Mono', monospace" }}
                      >
                        {model.costPer1k}
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeModel(model.id);
                      }}
                      className="p-1.5 rounded-md text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive hover:bg-destructive/10 transition-all"
                      title="Remove model"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Selected model ID */}
            {selectedModel && (
              <div className="mt-3 flex items-center gap-2 px-3 py-2 bg-secondary rounded-lg">
                <span className="text-xs text-muted-foreground">Active:</span>
                <code
                  className="text-xs text-primary"
                  style={{ fontFamily: "'JetBrains Mono', monospace" }}
                >
                  {selectedModel}
                </code>
                <button
                  onClick={() => copyToClipboard(selectedModel, "model_id")}
                  className="ml-auto p-1 rounded text-muted-foreground hover:text-foreground transition-colors"
                >
                  {copiedId === "model_id" ? (
                    <Check className="w-3 h-3 text-chart-2" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )}
                </button>
              </div>
            )}
          </div>

          {/* Add Model */}
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <Plus className="w-4 h-4 text-primary" />
              <h3 className="text-sm text-foreground">Add Model</h3>
            </div>

            <div className="flex flex-col gap-3">
              <div className="flex gap-2">
                <div className="relative">
                  <select
                    value={addProvider}
                    onChange={(e) => {
                      setAddProvider(e.target.value);
                      setAddModelSlug("");
                      setAddError("");
                    }}
                    className="appearance-none px-3 py-2.5 pr-8 bg-secondary border border-border rounded-lg text-xs text-foreground focus:outline-none focus:border-primary/50 cursor-pointer min-w-[140px]"
                  >
                    {providers.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-3.5 h-3.5 text-muted-foreground absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>

                <div className="flex-1 relative">
                  <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={addModelSlug}
                    onChange={(e) => {
                      setAddModelSlug(e.target.value);
                      setAddError("");
                    }}
                    onKeyDown={(e) => e.key === "Enter" && handleAddModel()}
                    placeholder={currentProvider.placeholder}
                    className="w-full pl-9 pr-3 py-2.5 bg-secondary border border-border rounded-lg text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/50"
                    style={{ fontFamily: "'JetBrains Mono', monospace" }}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between">
                <a
                  href={currentProvider.modelsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
                >
                  Find model IDs — {currentProvider.label} Models{" "}
                  <ExternalLink className="w-3 h-3" />
                </a>
                {addError && <span className="text-xs text-destructive">{addError}</span>}
              </div>

              <button
                onClick={handleAddModel}
                disabled={!addModelSlug.trim() || addingModel}
                className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg bg-primary text-primary-foreground text-xs hover:bg-primary/90 transition-colors disabled:opacity-40"
              >
                {addingModel ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Fetching model info...
                  </>
                ) : (
                  <>
                    <Plus className="w-3.5 h-3.5" /> Add to My Models
                  </>
                )}
              </button>
            </div>

            {models.length > 0 && (
              <div className="mt-4 pt-4 border-t border-border">
                <button
                  onClick={clearAllModels}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground hover:border-primary/20 transition-colors w-full justify-center"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> Clear All Models
                </button>
              </div>
            )}
          </div>

          {/* AI Feature Preview */}
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <Zap className="w-4 h-4 text-primary" />
              <h3 className="text-sm text-foreground">AI Features (powered by OpenRouter)</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {[
                {
                  title: "Training Advisor",
                  desc: "Get learning rate, epoch, and batch size recommendations based on your dataset and hardware",
                },
                {
                  title: "Error Troubleshooter",
                  desc: "Paste training/generation error logs and get actionable fix suggestions",
                },
                {
                  title: "Prompt Engineer",
                  desc: "Generate and refine prompts for ComfyUI/SwarmUI with style guidance",
                },
                {
                  title: "System Optimizer",
                  desc: "AI analysis of your system config with personalized performance recommendations",
                },
              ].map((feature) => (
                <div
                  key={feature.title}
                  className="flex items-start gap-3 p-3 bg-secondary/30 rounded-lg"
                >
                  <div className="mt-0.5">
                    {keys.openrouter ? (
                      <CheckCircle2 className="w-4 h-4 text-chart-2" />
                    ) : (
                      <Key className="w-4 h-4 text-muted-foreground" />
                    )}
                  </div>
                  <div>
                    <div className="text-xs text-foreground">{feature.title}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{feature.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ========== Paths Section ========== */}
      {activeSection === "paths" && (
        <div className="space-y-4">
          <div className="flex items-start gap-3 px-4 py-3 bg-primary/5 border border-primary/15 rounded-xl">
            <Info className="w-4 h-4 text-primary mt-0.5 shrink-0" />
            <div>
              <div className="text-xs text-foreground">Configure local tool paths</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {backendStatus?.connected
                  ? "Backend is connected \u2014 paths are validated against your filesystem in real time."
                  : "These paths are used by the backend to locate and manage your AI tools. The backend will validate that these directories exist on startup."}
              </div>
            </div>
          </div>

          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <HardDrive className="w-4 h-4 text-primary" />
              <h3 className="text-sm text-foreground">Local Directories</h3>
            </div>
            <div className="space-y-3">
              {paths.map((p) => (
                <div key={p.id} className="flex items-center gap-3">
                  <div className="w-32 shrink-0">
                    <div className="text-xs text-foreground">{p.label}</div>
                    <div className="text-[10px] text-muted-foreground">{p.description}</div>
                  </div>
                  <div className="flex-1 relative">
                    <input
                      type="text"
                      value={p.path}
                      onChange={(e) => handlePathChange(p.id, e.target.value)}
                      className="w-full px-3 py-2 bg-secondary border border-border rounded-lg text-xs text-foreground focus:outline-none focus:border-primary/50"
                      style={{ fontFamily: "'JetBrains Mono', monospace" }}
                    />
                  </div>
                  <div className="shrink-0">
                    {p.exists ? (
                      <CheckCircle2 className="w-4 h-4 text-chart-2" />
                    ) : (
                      <XCircle className="w-4 h-4 text-destructive" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Settings className="w-4 h-4 text-primary" />
                <h3 className="text-sm text-foreground">Generated config.json</h3>
              </div>
              <button
                onClick={() => copyToClipboard(JSON.stringify(configJson, null, 2), "config")}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary text-foreground text-xs hover:bg-secondary/80 transition-colors"
              >
                {copiedId === "config" ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-chart-2" /> Copied!
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" /> Copy JSON
                  </>
                )}
              </button>
            </div>
            <pre
              className="text-xs text-muted-foreground p-4 bg-secondary rounded-lg overflow-x-auto"
              style={{ fontFamily: "'JetBrains Mono', monospace" }}
            >
              {JSON.stringify(configJson, null, 2)}
            </pre>
          </div>
        </div>
      )}

      {/* ========== Backend Setup Section ========== */}
      {activeSection === "backend" && <BackendSetupTab copiedId={copiedId} copyToClipboard={copyToClipboard} />}

      {/* ========== Export / Import / Reset ========== */}
      <ExportImportResetPanel />
    </div>
  );
}

function ApiStatusBadge({ status }: { status: string }) {
  const config: Record<
    string,
    { icon: typeof CheckCircle2; text: string; cls: string }
  > = {
    connected: { icon: CheckCircle2, text: "Connected", cls: "bg-chart-2/15 text-chart-2" },
    invalid: { icon: XCircle, text: "Invalid", cls: "bg-destructive/15 text-destructive" },
    unconfigured: { icon: Key, text: "Not Set", cls: "bg-secondary text-muted-foreground" },
    testing: { icon: Loader2, text: "Testing", cls: "bg-chart-4/15 text-chart-4" },
  };
  const c = config[status] || config.unconfigured;
  return (
    <span className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] ${c.cls}`}>
      <c.icon className={`w-3 h-3 ${status === "testing" ? "animate-spin" : ""}`} />
      {c.text}
    </span>
  );
}