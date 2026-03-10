import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  Activity,
  ArrowRight,
  Bot,
  Database,
  KeyRound,
  RefreshCcw,
  Settings2,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  UploadCloud,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import DesktopUpdatePanel from "@/components/DesktopUpdatePanel";
import PageTransition from "@/components/PageTransition";
import { useAppData } from "@/contexts/AppDataContext";
import {
  clearLocalSettings,
  DEFAULT_LOCAL_SETTINGS,
  loadLocalSettings,
  mergeLocalIntegrationSettings,
  saveLocalSettings,
} from "@/lib/local-settings";
import { getAIConfig, saveAIConfig, testAIConnection } from "@/lib/api";
import { getUpdaterPhaseLabel } from "@/lib/updater";
import { useOperionDesktopStatus } from "@/hooks/use-operion-desktop";
import type { OperionLocalSettings } from "@/types/desktop";
import type { AIConnectionStatus, AIIntegrationConfigResponse } from "@/types/analytics";

const TAB_ITEMS = [
  { value: "geral", label: "Geral", icon: Settings2 },
  { value: "atualizacoes", label: "Atualizacoes", icon: RefreshCcw },
  { value: "diagnostico", label: "Diagnostico", icon: Stethoscope },
  { value: "integracoes", label: "Integracoes", icon: Bot },
  { value: "dados", label: "Dados do aplicativo", icon: Database },
] as const;

type TabValue = (typeof TAB_ITEMS)[number]["value"];

function isTabValue(value: string | null): value is TabValue {
  return TAB_ITEMS.some((item) => item.value === value);
}

function formatTimestamp(value: string | null) {
  if (!value) {
    return "Ainda nao registrado";
  }

  return new Date(value).toLocaleString("pt-BR");
}

function getConnectionStatusLabel(status: AIConnectionStatus | null) {
  switch (status) {
    case "success":
      return "Conexao validada";
    case "invalid_key":
      return "Chave invalida";
    case "model_not_found":
      return "Modelo nao encontrado";
    case "network_error":
      return "Erro de rede";
    case "provider_not_configured":
      return "Provider incompleto";
    case "fallback_only":
      return "Fallback ativo";
    case "openai_error":
      return "Erro OpenAI";
    default:
      return "Nao testado";
  }
}

export default function SettingsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = isTabValue(searchParams.get("tab")) ? searchParams.get("tab") : "geral";

  const [settings, setSettings] = useState<OperionLocalSettings>(() => loadLocalSettings());
  const [generalStatus, setGeneralStatus] = useState<string | null>(null);
  const [integrationStatus, setIntegrationStatus] = useState<string | null>(null);
  const [integrationError, setIntegrationError] = useState<string | null>(null);
  const [loadingIntegrationConfig, setLoadingIntegrationConfig] = useState(true);
  const [testingIntegration, setTestingIntegration] = useState(false);
  const [savingIntegration, setSavingIntegration] = useState(false);
  const [diagnosticStatus, setDiagnosticStatus] = useState<string | null>(null);
  const [diagnosticError, setDiagnosticError] = useState<string | null>(null);
  const [openLogsBusy, setOpenLogsBusy] = useState(false);

  const { state, rmData, lastFGImportAt, lastRMImportAt } = useAppData();
  const {
    appVersion,
    backendUrl,
    config,
    currentVersion,
    availableVersion,
    progressValue,
    updaterStatus,
    isDesktop,
    desktopBridge,
    updaterBridge,
  } = useOperionDesktopStatus();

  const setTab = (nextTab: string) => {
    if (!isTabValue(nextTab)) {
      return;
    }

    setSearchParams({ tab: nextTab });
  };

  const handleGeneralToggle = (key: keyof OperionLocalSettings["general"], value: boolean) => {
    setSettings((current) => ({
      ...current,
      general: {
        ...current.general,
        [key]: value,
      },
    }));
    setGeneralStatus(null);
  };

  const handleSaveGeneral = () => {
    saveLocalSettings(settings);
    setGeneralStatus("Preferencias locais salvas.");
  };

  const applyRemoteConfig = (
    payload: AIIntegrationConfigResponse,
    options?: { keepDraftApiKey?: boolean; lastSavedAt?: string | null; statusMessage?: string | null },
  ) => {
    let nextSettings: OperionLocalSettings | null = null;

    setSettings((current) => {
      nextSettings = {
        ...current,
        integrations: {
          ...current.integrations,
          provider: payload.provider,
          apiKey: options?.keepDraftApiKey ? current.integrations.apiKey : "",
          apiKeyMasked: payload.apiKeyMasked,
          hasApiKey: payload.hasApiKey,
          model: payload.model,
          providerActive: payload.providerActive,
          modelActive: payload.modelActive,
          connectionStatus: payload.connectionStatus,
          usingEnvironmentKey: payload.usingEnvironmentKey,
          lastSavedAt: options?.lastSavedAt ?? current.integrations.lastSavedAt,
          lastTestedAt: payload.lastTestedAt,
          lastStatus: options?.statusMessage ?? payload.lastTestMessage ?? current.integrations.lastStatus,
        },
      };
      return nextSettings;
    });

    if (nextSettings) {
      mergeLocalIntegrationSettings(nextSettings.integrations);
    }
  };

  useEffect(() => {
    let active = true;

    getAIConfig()
      .then((payload) => {
        if (!active) {
          return;
        }

        const cachedSettings = loadLocalSettings().integrations;
        const nextIntegrations: OperionLocalSettings["integrations"] = {
          ...cachedSettings,
          provider: payload.provider,
          apiKey: "",
          apiKeyMasked: payload.apiKeyMasked,
          hasApiKey: payload.hasApiKey,
          model: payload.model,
          providerActive: payload.providerActive,
          modelActive: payload.modelActive,
          connectionStatus: payload.connectionStatus,
          usingEnvironmentKey: payload.usingEnvironmentKey,
          lastSavedAt: cachedSettings.lastSavedAt,
          lastTestedAt: payload.lastTestedAt,
          lastStatus: payload.lastTestMessage,
        };
        setSettings((current) => ({
          ...current,
          integrations: nextIntegrations,
        }));
        mergeLocalIntegrationSettings(nextIntegrations);
        setIntegrationStatus(payload.lastTestMessage);
        setIntegrationError(null);
      })
      .catch((error) => {
        if (!active) {
          return;
        }
        setIntegrationStatus(null);
        setIntegrationError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        if (active) {
          setLoadingIntegrationConfig(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const handleSaveIntegrations = async () => {
    try {
      setSavingIntegration(true);
      setIntegrationError(null);
      const savedAt = new Date().toISOString();
      const payload = await saveAIConfig({
        provider: settings.integrations.provider,
        model: settings.integrations.model,
        apiKey: settings.integrations.apiKey.trim() || null,
        keepExistingKey: settings.integrations.apiKey.trim() === "",
      });
      const statusMessage =
        payload.providerActive === "openai"
          ? `Integracao OpenAI salva. Provider ativo: OpenAI (${payload.modelActive}).`
          : "Modo fallback local salvo. As interpretacoes vao usar o provider deterministic.";
      applyRemoteConfig(payload, { lastSavedAt: savedAt, statusMessage });
      setIntegrationStatus(statusMessage);
    } catch (error) {
      setIntegrationStatus(null);
      setIntegrationError(error instanceof Error ? error.message : String(error));
    } finally {
      setSavingIntegration(false);
    }
  };

  const handleTestIntegration = async () => {
    try {
      setTestingIntegration(true);
      setIntegrationError(null);

      const savedAt = new Date().toISOString();
      const savedConfig = await saveAIConfig({
        provider: settings.integrations.provider,
        model: settings.integrations.model,
        apiKey: settings.integrations.apiKey.trim() || null,
        keepExistingKey: settings.integrations.apiKey.trim() === "",
      });
      applyRemoteConfig(savedConfig, { lastSavedAt: savedAt, keepDraftApiKey: false });

      const testResult = await testAIConnection();
      const refreshedConfig = await getAIConfig();
      applyRemoteConfig(refreshedConfig, {
        lastSavedAt: savedAt,
        statusMessage: testResult.message,
      });
      setIntegrationStatus(testResult.message);
    } catch (error) {
      setIntegrationStatus(null);
      setIntegrationError(error instanceof Error ? error.message : String(error));
    } finally {
      setTestingIntegration(false);
    }
  };

  const handleCopyUpdaterDiagnostic = async () => {
    if (!updaterBridge?.copyDiagnostic) {
      setDiagnosticStatus(null);
      setDiagnosticError("Diagnostico do updater disponivel apenas no app desktop.");
      return;
    }

    try {
      setDiagnosticError(null);
      const result = await updaterBridge.copyDiagnostic();
      setDiagnosticStatus(result.message);
    } catch (error) {
      setDiagnosticStatus(null);
      setDiagnosticError(error instanceof Error ? error.message : String(error));
    }
  };

  const handleOpenLogs = async () => {
    if (!desktopBridge?.openLogs) {
      setDiagnosticStatus(null);
      setDiagnosticError("Abrir logs disponivel apenas no app desktop.");
      return;
    }

    try {
      setOpenLogsBusy(true);
      setDiagnosticError(null);
      await desktopBridge.openLogs();
      setDiagnosticStatus("Pasta de logs aberta.");
    } catch (error) {
      setDiagnosticStatus(null);
      setDiagnosticError(error instanceof Error ? error.message : String(error));
    } finally {
      setOpenLogsBusy(false);
    }
  };

  const handleClearLocalPreferences = () => {
    clearLocalSettings();
    setSettings(DEFAULT_LOCAL_SETTINGS);
    setGeneralStatus("Preferencias locais foram limpas. A configuracao persistida do backend foi preservada.");
    setIntegrationStatus(null);
    setIntegrationError(null);
  };

  return (
    <PageTransition className="p-6 space-y-6">
      <section className="relative overflow-hidden rounded-[28px] border border-border/70 bg-card/90 px-6 py-7 shadow-[0_24px_80px_rgba(2,6,23,0.35)]">
        <div
          className="pointer-events-none absolute inset-0 opacity-80"
          style={{
            background:
              "radial-gradient(circle at top left, rgba(14,165,233,0.18), transparent 34%), linear-gradient(135deg, rgba(15,23,42,0.12), rgba(2,6,23,0.56))",
          }}
        />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-4">
            <span className="inline-flex rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-[11px] font-mono uppercase tracking-[0.28em] text-primary">
              Configuracoes e governanca
            </span>
            <div className="space-y-2">
              <h1 className="text-3xl font-semibold tracking-tight text-foreground">Centro tecnico discreto do Operion</h1>
              <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                Atualizacoes, diagnostico, integracoes de IA e dados do aplicativo ficam concentrados aqui para a
                Home permanecer orientada a decisao.
              </p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-border/70 bg-background/40 p-4">
              <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Versao</p>
              <p className="mt-2 text-lg font-semibold text-foreground">{currentVersion || appVersion}</p>
            </div>
            <div className="rounded-2xl border border-border/70 bg-background/40 p-4">
              <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Ambiente</p>
              <p className="mt-2 text-lg font-semibold text-foreground">{isDesktop ? "Desktop" : "Web"}</p>
            </div>
            <div className="rounded-2xl border border-border/70 bg-background/40 p-4">
              <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Updater</p>
              <p className="mt-2 text-lg font-semibold text-foreground">{getUpdaterPhaseLabel(updaterStatus)}</p>
            </div>
          </div>
        </div>
      </section>

      <Tabs value={activeTab} onValueChange={setTab} className="space-y-6">
        <TabsList className="h-auto w-full flex-wrap justify-start gap-2 rounded-2xl border border-border/80 bg-card/70 p-2">
          {TAB_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <TabsTrigger
                key={item.value}
                value={item.value}
                className="gap-2 rounded-xl border border-transparent px-4 py-2 data-[state=active]:border-border data-[state=active]:bg-background"
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </TabsTrigger>
            );
          })}
        </TabsList>

        <TabsContent value="geral" className="space-y-6">
          <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
            <section className="metric-card space-y-4">
              <div className="space-y-1">
                <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Ambiente</p>
                <h2 className="text-xl font-semibold text-foreground">Informacoes gerais</h2>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
                  <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Versao instalada</p>
                  <p className="mt-2 text-lg font-semibold text-foreground">{currentVersion || appVersion}</p>
                </div>
                <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
                  <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Backend</p>
                  <p className="mt-2 break-all text-sm text-foreground">{backendUrl}</p>
                </div>
                <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
                  <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Build</p>
                  <p className="mt-2 text-lg font-semibold text-foreground">{updaterStatus.isPackaged ? "Instalado" : "Desenvolvimento"}</p>
                </div>
                <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
                  <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Porta backend</p>
                  <p className="mt-2 text-lg font-semibold text-foreground">{String(config.backendPort || 80)}</p>
                </div>
              </div>
            </section>

            <section className="metric-card space-y-4">
              <div className="space-y-1">
                <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Preferencias</p>
                <h2 className="text-xl font-semibold text-foreground">Ajustes visuais basicos</h2>
              </div>

              {[
                {
                  key: "compactNavigation" as const,
                  title: "Navegacao compacta",
                  description: "Reduz a largura visual dos grupos de navegacao para leitura mais contida.",
                },
                {
                  key: "prioritizeAlerts" as const,
                  title: "Destacar alertas criticos",
                  description: "Mantem o Home focado nas prioridades com maior impacto executivo.",
                },
                {
                  key: "showAITeaser" as const,
                  title: "Exibir bloco discreto de IA",
                  description: "Mostra um atalho contextual para interpretacoes assistidas na Home executiva.",
                },
              ].map((item) => (
                <div key={item.key} className="flex items-start justify-between gap-4 rounded-2xl border border-border/70 bg-muted/20 p-4">
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-foreground">{item.title}</p>
                    <p className="text-sm text-muted-foreground">{item.description}</p>
                  </div>
                  <Switch
                    checked={settings.general[item.key]}
                    onCheckedChange={(value) => handleGeneralToggle(item.key, value)}
                  />
                </div>
              ))}

              <div className="flex flex-wrap items-center gap-3">
                <Button onClick={handleSaveGeneral}>Salvar preferencias</Button>
                {generalStatus && <p className="text-xs font-mono text-muted-foreground">{generalStatus}</p>}
              </div>
            </section>
          </div>
        </TabsContent>

        <TabsContent value="atualizacoes" className="space-y-6">
          <section className="metric-card space-y-4">
            <div className="space-y-1">
              <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Fluxo do app</p>
              <h2 className="text-xl font-semibold text-foreground">Atualizacoes do Operion</h2>
            </div>
            <p className="text-sm leading-6 text-muted-foreground">
              O painel de atualizacoes foi retirado da Home e centralizado aqui. O indicador discreto permanece no topo
              quando houver nova versao disponivel ou pronta para instalar.
            </p>
          </section>

          <DesktopUpdatePanel />
        </TabsContent>

        <TabsContent value="diagnostico" className="space-y-6">
          <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
            <section className="metric-card space-y-4">
              <div className="space-y-1">
                <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Diagnostico tecnico</p>
                <h2 className="text-xl font-semibold text-foreground">Estado do backend e do updater</h2>
              </div>

              <div className="grid gap-3">
                <div className="rounded-2xl border border-border/70 bg-muted/20 px-4 py-3">
                  <span className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Versao atual instalada</span>
                  <p className="mt-2 text-sm text-foreground">{currentVersion || appVersion}</p>
                </div>
                <div className="rounded-2xl border border-border/70 bg-muted/20 px-4 py-3">
                  <span className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Backend URL</span>
                  <p className="mt-2 break-all text-sm text-foreground">{backendUrl}</p>
                </div>
                <div className="rounded-2xl border border-border/70 bg-muted/20 px-4 py-3">
                  <span className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Status do updater</span>
                  <p className="mt-2 text-sm text-foreground">{updaterStatus.message || "Sem status"}</p>
                </div>
                <div className="rounded-2xl border border-border/70 bg-muted/20 px-4 py-3">
                  <span className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Ultima versao encontrada</span>
                  <p className="mt-2 text-sm text-foreground">{availableVersion}</p>
                </div>
                <div className="rounded-2xl border border-border/70 bg-muted/20 px-4 py-3">
                  <span className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Progresso do download</span>
                  <p className="mt-2 text-sm text-foreground">{progressValue}%</p>
                </div>
                <div className="rounded-2xl border border-border/70 bg-muted/20 px-4 py-3">
                  <span className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Instalacao ao fechar</span>
                  <p className="mt-2 text-sm text-foreground">{updaterStatus.willInstallOnQuit ? "Ativa" : "Inativa"}</p>
                </div>
              </div>
            </section>

            <section className="metric-card space-y-4">
              <div className="space-y-1">
                <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Acoes de suporte</p>
                <h2 className="text-xl font-semibold text-foreground">Mensagens e ferramentas tecnicas</h2>
              </div>

              <div className="grid gap-3">
                <div className="rounded-2xl border border-border/70 bg-muted/20 px-4 py-3">
                  <span className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Mensagem tecnica</span>
                  <p className="mt-2 text-sm text-foreground">{updaterStatus.message || "Sem mensagem"}</p>
                </div>
                <div className="rounded-2xl border border-border/70 bg-muted/20 px-4 py-3">
                  <span className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Ultimo erro</span>
                  <p className="mt-2 text-sm text-foreground">{updaterStatus.lastError ?? "Nenhum erro recente"}</p>
                </div>
                <div className="rounded-2xl border border-border/70 bg-muted/20 px-4 py-3">
                  <span className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Instalacao confirmada</span>
                  <p className="mt-2 text-sm text-foreground">{updaterStatus.installedMessage ?? "Sem confirmacao apos relaunch"}</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <Button variant="outline" className="gap-2" onClick={handleCopyUpdaterDiagnostic} disabled={!updaterBridge?.copyDiagnostic}>
                  <ShieldCheck className="h-4 w-4" />
                  Copiar diagnostico do updater
                </Button>
                <Button variant="secondary" className="gap-2" onClick={handleOpenLogs} disabled={openLogsBusy || !desktopBridge?.openLogs}>
                  <Activity className="h-4 w-4" />
                  {openLogsBusy ? "Abrindo..." : "Abrir logs"}
                </Button>
              </div>

              {diagnosticStatus && <p className="text-xs font-mono text-muted-foreground">{diagnosticStatus}</p>}
              {diagnosticError && <p className="text-xs font-mono text-destructive">{diagnosticError}</p>}
            </section>
          </div>
        </TabsContent>

        <TabsContent value="integracoes" className="space-y-6">
          <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
            <section className="metric-card space-y-4">
              <div className="space-y-1">
                <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Configuracao de IA</p>
                <h2 className="text-xl font-semibold text-foreground">Integracoes</h2>
              </div>
              <p className="text-sm leading-6 text-muted-foreground">
                Esta camada conecta a IA real do Operion. Provider, modelo e API key ficam persistidos no app e o
                backend usa essa configuracao para interpretar o Contexto Executivo Consolidado.
              </p>

              <div className="grid gap-4">
                <div className="space-y-2">
                  <label className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Provider</label>
                  <Select
                    value={settings.integrations.provider}
                    onValueChange={(value) =>
                      setSettings((current) => ({
                        ...current,
                        integrations: {
                          ...current.integrations,
                          provider: value as OperionLocalSettings["integrations"]["provider"],
                        },
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="openai">OpenAI</SelectItem>
                      <SelectItem value="deterministic">Deterministico</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">OpenAI API Key</label>
                  <Input
                    type="password"
                    value={settings.integrations.apiKey}
                    placeholder={settings.integrations.apiKeyMasked ?? "sk-..."}
                    onChange={(event) =>
                      setSettings((current) => ({
                        ...current,
                        integrations: {
                          ...current.integrations,
                          apiKey: event.target.value,
                        },
                      }))
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    {settings.integrations.hasApiKey
                      ? `Chave salva localmente no app: ${settings.integrations.apiKeyMasked}${
                          settings.integrations.usingEnvironmentKey ? " (origem ambiente)" : ""
                        }`
                      : "Nenhuma chave salva. Informe uma nova chave para ativar OpenAI."}
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Modelo</label>
                  <Input
                    value={settings.integrations.model}
                    placeholder="gpt-4o-mini"
                    onChange={(event) =>
                      setSettings((current) => ({
                        ...current,
                        integrations: {
                          ...current.integrations,
                          model: event.target.value,
                        },
                      }))
                    }
                  />
                </div>

                <div className="flex flex-wrap gap-3">
                  <Button className="gap-2" onClick={handleSaveIntegrations} disabled={savingIntegration || loadingIntegrationConfig}>
                    <KeyRound className="h-4 w-4" />
                    {savingIntegration ? "Salvando..." : "Salvar"}
                  </Button>
                  <Button
                    variant="outline"
                    className="gap-2"
                    onClick={handleTestIntegration}
                    disabled={testingIntegration || savingIntegration || loadingIntegrationConfig}
                  >
                    <Sparkles className="h-4 w-4" />
                    {testingIntegration ? "Testando..." : "Testar conexao"}
                  </Button>
                </div>

                {loadingIntegrationConfig && <p className="text-xs font-mono text-muted-foreground">Carregando configuracao real do backend...</p>}
                {integrationStatus && <p className="text-xs font-mono text-muted-foreground">{integrationStatus}</p>}
                {integrationError && <p className="text-xs font-mono text-destructive">{integrationError}</p>}
              </div>
            </section>

            <section className="metric-card space-y-4">
              <div className="space-y-1">
                <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Estado da integracao</p>
                <h2 className="text-xl font-semibold text-foreground">Prontidao para uso real</h2>
              </div>

              <div className="grid gap-3">
                <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
                  <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Provider configurado</p>
                  <p className="mt-2 text-lg font-semibold text-foreground">
                    {settings.integrations.provider === "openai" ? "OpenAI" : "Deterministico"}
                  </p>
                </div>
                <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
                  <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Provider ativo</p>
                  <p className="mt-2 text-lg font-semibold text-foreground">
                    {settings.integrations.providerActive === "openai" ? "OpenAI ativo" : "Fallback local ativo"}
                  </p>
                </div>
                <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
                  <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Modelo ativo</p>
                  <p className="mt-2 text-lg font-semibold text-foreground">{settings.integrations.modelActive || "Nao definido"}</p>
                </div>
                <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
                  <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Ultima gravacao</p>
                  <p className="mt-2 text-sm text-foreground">{formatTimestamp(settings.integrations.lastSavedAt)}</p>
                </div>
                <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
                  <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Ultimo teste</p>
                  <p className="mt-2 text-sm text-foreground">{formatTimestamp(settings.integrations.lastTestedAt)}</p>
                </div>
                <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
                  <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Status da conexao</p>
                  <p className="mt-2 text-sm text-foreground">{getConnectionStatusLabel(settings.integrations.connectionStatus)}</p>
                </div>
              </div>

              <div className="rounded-2xl border border-primary/20 bg-primary/10 p-4 text-sm text-foreground">
                <p className="font-medium">Status da integracao</p>
                <p className="mt-2 text-muted-foreground">
                  {settings.integrations.lastStatus ??
                    "Nenhum teste recente. Salve a configuracao e valide a conectividade real do provider."}
                </p>
              </div>

              <Button asChild variant="outline" className="gap-2">
                <Link to="/ia">
                  Abrir workspace de IA
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </section>
          </div>
        </TabsContent>

        <TabsContent value="dados" className="space-y-6">
          <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
            <section className="metric-card space-y-4">
              <div className="space-y-1">
                <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Bases carregadas</p>
                <h2 className="text-xl font-semibold text-foreground">Dados do aplicativo</h2>
              </div>

              <div className="grid gap-3">
                <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
                  <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Base operacional</p>
                  <p className="mt-2 text-sm text-foreground">{state ? `${state.products.length} SKUs ativos` : "Sem dados carregados"}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Ultima importacao: {formatTimestamp(lastFGImportAt)}</p>
                </div>
                <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
                  <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Cobertura de insumos</p>
                  <p className="mt-2 text-sm text-foreground">{rmData ? `${rmData.length} materiais ativos` : "Sem dados carregados"}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Ultima importacao: {formatTimestamp(lastRMImportAt)}</p>
                </div>
                <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
                  <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Contexto cliente</p>
                  <p className="mt-2 text-sm text-foreground">
                    {state?.hasClientes ? `${state.clientes.length} clientes vinculados` : "Base sem camada de clientes"}
                  </p>
                </div>
              </div>
            </section>

            <section className="metric-card space-y-4">
              <div className="space-y-1">
                <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Operacoes locais</p>
                <h2 className="text-xl font-semibold text-foreground">Reprocessamento e limpeza</h2>
              </div>

              <div className="grid gap-3">
                <Button variant="outline" className="justify-between gap-2" onClick={() => navigate("/upload")}>
                  <span className="inline-flex items-center gap-2">
                    <UploadCloud className="h-4 w-4" />
                    Abrir carga de dados
                  </span>
                  <ArrowRight className="h-4 w-4" />
                </Button>
                <Button variant="outline" className="justify-between gap-2" onClick={() => navigate("/ia")}>
                  <span className="inline-flex items-center gap-2">
                    <Sparkles className="h-4 w-4" />
                    Reprocessar contexto IA
                  </span>
                  <ArrowRight className="h-4 w-4" />
                </Button>
                <Button variant="secondary" className="justify-between gap-2" onClick={handleClearLocalPreferences}>
                  <span className="inline-flex items-center gap-2">
                    <Database className="h-4 w-4" />
                    Limpar preferencias locais
                  </span>
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>

              <div className="rounded-2xl border border-border/70 bg-muted/20 p-4 text-sm text-muted-foreground">
                As bases analiticas permanecem na sessao atual. A limpeza acima remove apenas preferencias locais,
                configuracoes de integracao e atalhos visuais salvos no desktop.
              </div>

              {generalStatus && <p className="text-xs font-mono text-muted-foreground">{generalStatus}</p>}
            </section>
          </div>
        </TabsContent>
      </Tabs>
    </PageTransition>
  );
}
