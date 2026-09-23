import { useEffect, useMemo, useState } from "react";
import {
  Cpu,
  Database,
  Download,
  Edit3,
  Eye,
  EyeOff,
  Globe2,
  Moon,
  Plus,
  Server,
  Sun,
  Trash2,
  Zap,
} from "lucide-react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Toast } from "@/components/Toast";
import { BUILTIN_PLATFORMS } from "@/config/platforms";
import {
  clearAllData,
  DEFAULT_SETTINGS,
  getSnapshot,
  getStorageUsage,
  settingsRepository,
} from "@/storage";
import {
  getAvailablePlatforms,
  getCurrentPlatformSelection,
  getPlatformConfig,
  platformConfigRepository,
  setCurrentPlatformSelection,
} from "@/storage/repository";
import {
  AIModel,
  AIPlatform,
  AppSettings,
  ThemeMode,
  UserPlatformConfig,
} from "@/types";

const emptyCustom = { name: "", baseUrl: "", apiKey: "", modelId: "" };
const themes: Array<[ThemeMode, string, typeof Sun]> = [
  ["light", "浅色", Sun],
  ["dark", "深色", Moon],
  ["system", "跟随系统", Database],
];

function iconFor(id: string) {
  if (id === "ollama") return Cpu;
  if (id === "spark") return Zap;
  if (id === "dashscope") return Globe2;
  return Server;
}
function defaultConfig(platform: AIPlatform): UserPlatformConfig {
  return {
    platformId: platform.id,
    name: platform.name,
    baseUrl: platform.baseUrl,
    apiKey: "",
    modelId: platform.models[0]?.id ?? "",
    models: platform.models,
    requiresApiKey: platform.requiresApiKey,
    isCustom: Boolean(platform.isCustom),
    guideUrl: platform.guideUrl,
    guideSteps: platform.guideSteps,
    updatedAt: new Date().toISOString(),
  };
}

function normalizeConfig(
  platform: AIPlatform,
  stored?: Partial<UserPlatformConfig>,
): UserPlatformConfig {
  const fallback = defaultConfig(platform);
  const models = stored?.models?.length ? stored.models : fallback.models;
  const modelId = models.some((model) => model.id === stored?.modelId)
    ? stored?.modelId ?? models[0]?.id ?? ""
    : models[0]?.id ?? "";
  return {
    ...fallback,
    ...stored,
    platformId: platform.id,
    name: stored?.name?.trim() || fallback.name,
    baseUrl: stored?.baseUrl?.trim() || fallback.baseUrl,
    apiKey: stored?.apiKey ?? "",
    models,
    modelId,
    requiresApiKey: stored?.requiresApiKey ?? fallback.requiresApiKey,
    isCustom: stored?.isCustom ?? fallback.isCustom,
    updatedAt: stored?.updatedAt ?? fallback.updatedAt,
  };
}

export function SettingsPage({
  onThemeChange,
}: {
  onThemeChange: (theme: ThemeMode) => void;
}) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [platforms, setPlatforms] = useState<AIPlatform[]>(BUILTIN_PLATFORMS);
  const [selectedId, setSelectedId] = useState("zhipu");
  const [selectedModelId, setSelectedModelId] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [draft, setDraft] = useState(emptyCustom);
  const [edit, setEdit] = useState<{
    name: string;
    baseUrl: string;
    apiKey: string;
    models: AIModel[];
  } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AIPlatform | null>(null);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [toast, setToast] = useState("");
  const [, setTheme] = useState(settings.theme);
  const [usage, setUsage] = useState({ bytes: 0, formatted: "0 B" });

  const selected = useMemo(
    () =>
      platforms.find((item) => item.id === selectedId) ??
      platforms[0] ??
      BUILTIN_PLATFORMS[0],
    [platforms, selectedId],
  );
  const selectedModel =
    selected.models.find((model) => model.id === selectedModelId) ??
    selected.models[0];
  const editingPlatform = edit
    ? platforms.find((item) => item.id === selectedId)
    : undefined;

  useEffect(() => {
    void Promise.all([
      settingsRepository.get(),
      getStorageUsage(),
      getAvailablePlatforms(),
      platformConfigRepository.getAll(),
      getCurrentPlatformSelection(),
    ]).then(async ([stored, storedUsage, available, configs, current]) => {
      const normalizedConfigs = available.map((platform) =>
        normalizeConfig(
          platform,
          configs.find((item) => item.platformId === platform.id),
        ),
      );
      await Promise.all(
        normalizedConfigs.map((config) => platformConfigRepository.save(config)),
      );
      const platform =
        available.find((item) => item.id === current.platformId) ??
        available[0] ??
        BUILTIN_PLATFORMS[0];
      const config =
        normalizedConfigs.find((item) => item.platformId === platform.id) ??
        normalizeConfig(platform);
      setSettings(stored);
      setTheme(stored.theme);
      setUsage(storedUsage);
      setPlatforms(available);
      setSelectedId(platform.id);
      const modelId = config.models.some((model) => model.id === current.modelId)
        ? current.modelId
        : config.modelId;
      setSelectedModelId(modelId);
      setApiKey(config.apiKey);
      setBaseUrl(config.baseUrl);
      if (current.platformId !== platform.id || current.modelId !== modelId) {
        await setCurrentPlatformSelection(platform.id, modelId);
      }
    });
  }, []);

  const updateLegacy = async (config: UserPlatformConfig, modelId: string) => {
    const old = await settingsRepository.get();
    const isOfficial = config.platformId === "zhipu";
    const next = {
      ...old,
      apiKey: isOfficial ? config.apiKey : old.apiKey,
      baseUrl: isOfficial ? config.baseUrl : old.baseUrl,
      model: isOfficial ? modelId : old.model,
      modelSource: isOfficial ? ("recommended" as const) : ("custom" as const),
      customModel: isOfficial
        ? old.customModel
        : {
            name: config.name,
            modelId,
            baseUrl: config.baseUrl,
            apiKey: config.apiKey,
          },
    };
    await settingsRepository.save(next);
    setSettings(next);
  };

  const selectPlatform = async (platform: AIPlatform) => {
    const config = await getPlatformConfig(platform.id);
    const modelId = config.modelId || platform.models[0]?.id || "";
    setSelectedId(platform.id);
    setSelectedModelId(modelId);
    setApiKey(config.apiKey);
    setBaseUrl(config.baseUrl);
    setEdit(null);
    await setCurrentPlatformSelection(platform.id, modelId);
  };

  const saveCurrent = async (patch: Partial<UserPlatformConfig>) => {
    const current = await getPlatformConfig(selected.id);
    const next = {
      ...current,
      apiKey: patch.apiKey ?? apiKey,
      baseUrl: patch.baseUrl ?? baseUrl,
      modelId: patch.modelId ?? selectedModelId,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    await platformConfigRepository.save(normalizeConfig(selected, next));
    await setCurrentPlatformSelection(next.platformId, next.modelId);
    await updateLegacy(next, next.modelId);
    setToast("配置已保存");
  };

  const saveEdit = async () => {
    if (!edit || !editingPlatform) return;
    if (edit.models.some((model) => !model.id.trim() || !model.name.trim())) {
      setToast("请完善模型信息");
      return;
    }
    const current = await getPlatformConfig(editingPlatform.id);
    const models = edit.models.map((model) => ({
      ...model,
      id: model.id.trim(),
      name: model.name.trim(),
    }));
    const modelId = models.some((model) => model.id === selectedModelId)
      ? selectedModelId
      : models[0].id;
    const next = {
      ...current,
      name: editingPlatform.isCustom
        ? edit.name.trim() || current.name
        : current.name,
      baseUrl: edit.baseUrl.trim(),
      apiKey: edit.apiKey,
      models,
      modelId,
      updatedAt: new Date().toISOString(),
    };
    await platformConfigRepository.save(next);
    await setCurrentPlatformSelection(next.platformId, modelId);
    await updateLegacy(next, modelId);
    setPlatforms((items) =>
      items.map((item) =>
        item.id === editingPlatform.id
          ? {
              ...item,
              name: next.name,
              baseUrl: next.baseUrl,
              models: next.models,
            }
          : item,
      ),
    );
    setSelectedModelId(modelId);
    setApiKey(next.apiKey);
    setBaseUrl(next.baseUrl);
    setEdit(null);
    setToast("配置已保存");
  };

  const addPlatform = async () => {
    if (!draft.name.trim()) {
      setToast("请输入平台名称");
      return;
    }
    if (!draft.baseUrl.trim()) {
      setToast("请输入接口地址");
      return;
    }
    if (!draft.modelId.trim()) {
      setToast("请输入模型 ID");
      return;
    }
    const id = "custom-" + Date.now();
    const model: AIModel = {
      id: draft.modelId.trim(),
      name: draft.modelId.trim(),
      type: "paid",
      description: "自定义模型",
    };
    const config: UserPlatformConfig = {
      platformId: id,
      name: draft.name.trim(),
      baseUrl: draft.baseUrl.trim(),
      apiKey: draft.apiKey,
      modelId: model.id,
      models: [model],
      requiresApiKey: true,
      isCustom: true,
      updatedAt: new Date().toISOString(),
    };
    await platformConfigRepository.save(config);
    const platform: AIPlatform = {
      id,
      name: config.name,
      baseUrl: config.baseUrl,
      models: [model],
      description: "用户自定义平台",
      guideSteps: [],
      requiresApiKey: true,
      isCustom: true,
    };
    setPlatforms((items) => [...items, platform]);
    setDraft(emptyCustom);
    await selectPlatform(platform);
    setToast("平台已添加");
  };

  const deletePlatform = async () => {
    if (!deleteTarget || platforms.length <= 1 || !deleteTarget.isCustom)
      return;
    const next = platforms.filter((item) => item.id !== deleteTarget.id);
    if (deleteTarget.id === selectedId) await selectPlatform(next[0]);
    await platformConfigRepository.delete(deleteTarget.id);
    setPlatforms(next);
    setDeleteTarget(null);
    setToast("平台已删除");
  };

  const restoreDefault = async () => {
    const official = BUILTIN_PLATFORMS.find((item) => item.id === selected.id);
    if (!official || selected.isCustom) return;
    const current = await getPlatformConfig(selected.id);
    const next = {
      ...current,
      baseUrl: official.baseUrl,
      models: official.models,
      modelId: official.models[0]?.id ?? current.modelId,
      updatedAt: new Date().toISOString(),
    };
    await platformConfigRepository.save(next);
    await setCurrentPlatformSelection(next.platformId, next.modelId);
    await updateLegacy(next, next.modelId);
    setPlatforms((items) =>
      items.map((item) =>
        item.id === selected.id
          ? { ...item, baseUrl: next.baseUrl, models: next.models }
          : item,
      ),
    );
    setSelectedModelId(next.modelId);
    setBaseUrl(next.baseUrl);
    setRestoreOpen(false);
    setToast("已恢复默认配置");
  };

  const exportConfig = async () => {
    const payload = {
      version: 1,
      platformConfigs: await platformConfigRepository.getAll(),
      selection: await getCurrentPlatformSelection(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download =
      "ai-job-assistant-config-" +
      new Date().toISOString().slice(0, 10).replace(/-/g, "") +
      ".json";
    link.click();
    URL.revokeObjectURL(url);
    setToast("配置已导出");
  };

  const importConfig = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setImporting(true);
    try {
      if (
        !file.name.toLowerCase().endsWith(".json") &&
        file.type !== "application/json"
      ) {
        setToast("请选择有效的 JSON 配置文件");
        return;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(await file.text());
      } catch {
        setToast("配置文件格式错误");
        return;
      }
      if (
        !parsed ||
        typeof parsed !== "object" ||
        !Array.isArray(
          (parsed as { platformConfigs?: unknown }).platformConfigs,
        )
      ) {
        setToast("配置文件格式错误");
        return;
      }
      const imported = (parsed as { platformConfigs: unknown[] })
        .platformConfigs;
      if (
        imported.some((item) => {
          const config = item as UserPlatformConfig;
          return (
            !config ||
            typeof config.platformId !== "string" ||
            !config.platformId.trim() ||
            typeof config.name !== "string" ||
            !config.name.trim() ||
            typeof config.baseUrl !== "string" ||
            !config.baseUrl.trim() ||
            !Array.isArray(config.models) ||
            config.models.some(
              (model) =>
                !model.id ||
                !model.name ||
                !["free", "paid", "local"].includes(model.type),
            )
          );
        })
      ) {
        setToast("配置文件格式错误");
        return;
      }
      const merged = await platformConfigRepository.getAll();
      for (const item of imported as UserPlatformConfig[]) {
        const index = merged.findIndex(
          (config) => config.platformId === item.platformId,
        );
        if (index >= 0) merged[index] = item;
        else {
          let name = item.name;
          let suffix = 2;
          while (merged.some((config) => config.name === name))
            name = item.name + "（导入" + suffix++ + "）";
          merged.push({ ...item, name });
        }
      }
      for (const config of merged) await platformConfigRepository.save(config);
      const first = imported[0] as UserPlatformConfig;
      const available = await getAvailablePlatforms();
      setPlatforms(available);
      await setCurrentPlatformSelection(
        first.platformId,
        first.modelId || first.models[0].id,
      );
      await selectPlatform(
        available.find((item) => item.id === first.platformId) ?? available[0],
      );
      setToast("配置导入成功");
    } catch (error) {
      console.error("[Settings] config import failed", error);
      setToast("配置文件格式错误");
    } finally {
      setImporting(false);
    }
  };

  const clearData = async () => {
    await clearAllData();
    setUsage(await getStorageUsage());
    setSettings(await settingsRepository.get());
    setPlatforms(BUILTIN_PLATFORMS);
    setSelectedId("zhipu");
    setSelectedModelId(BUILTIN_PLATFORMS[0].models[0]?.id ?? "");
    setApiKey("");
    setBaseUrl(BUILTIN_PLATFORMS[0].baseUrl);
    setClearOpen(false);
    setToast("数据已清空");
  };
  const changeTheme = (next: ThemeMode) => {
    setTheme(next);
    const value = { ...settings, theme: next };
    setSettings(value);
    void settingsRepository.save(value);
    onThemeChange(next);
    setToast("设置已保存");
  };
  const exportAll = async () => {
    const snapshot = await getSnapshot();
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "aidesk-backup.json";
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-3xl">
      <header>
        <h1 className="text-3xl font-semibold">设置</h1>
        <p className="mt-2 text-sm text-slate-500">
          管理模型配置、本地数据和主题偏好。
        </p>
      </header>
      <div className="mt-8 space-y-5">
        <section className="panel p-6">
          <h2 className="font-semibold">AI 服务配置</h2>
          <p className="mt-2 text-xs font-normal text-slate-500 dark:text-slate-400">
            配置仅保存在当前浏览器本地存储，不上传服务器；清理浏览器缓存或更换设备会丢失，建议导出备份。
          </p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {platforms.map((platform) => {
              const Icon = iconFor(platform.id);
              const canDelete =
                Boolean(platform.isCustom) && platforms.length > 1;
              return (
                <div className="group relative" key={platform.id}>
                  <button
                    className={
                      "w-full rounded-xl border p-4 text-left " +
                      (selected.id === platform.id
                        ? "border-indigo-500 bg-indigo-50 dark:border-[#22D3EE] dark:bg-[#22D3EE]/10"
                        : "border-slate-200/70 dark:border-slate-800/70 hover:border-indigo-300")
                    }
                    onClick={() => void selectPlatform(platform)}
                  >
                    <span className="flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        <Icon size={18} />
                        {platform.name}
                      </span>
                      <span className={`rounded-full bg-indigo-50 px-2 py-0.5 text-xs text-indigo-700 dark:bg-[#22D3EE]/10 dark:text-[#22D3EE] ${platform.isCustom ? '' : 'mr-10'}`}>
                        {platform.isCustom ? "自定义" : "官方"}
                      </span>
                    </span>
                    <span className="mt-2 block text-xs text-slate-500">
                      {platform.description}
                    </span>
                  </button>
                  <span
                    className={`absolute right-3 top-3 flex gap-2 ${platform.isCustom ? '' : 'pl-1'}`}
                    title={
                      !platform.isCustom
                        ? "内置平台不可删除"
                        : !canDelete
                          ? "至少保留一个 AI 平台"
                          : undefined
                    }
                  >
                    <button
                      type="button"
                      className="rounded p-1 text-slate-400 opacity-0 group-hover:opacity-100"
                      onClick={(event) => {
                        event.stopPropagation();
                        void getPlatformConfig(platform.id).then((config) => {
                          setSelectedId(platform.id);
                          setEdit({
                            name: platform.name,
                            baseUrl: config.baseUrl,
                            apiKey: config.apiKey,
                            models: config.models.map((model) => ({
                              ...model,
                            })),
                          });
                        });
                      }}
                    >
                      <Edit3 size={15} />
                    </button>
                    <button
                      type="button"
                      disabled={!canDelete}
                      className="rounded p-1 text-slate-400 disabled:cursor-not-allowed disabled:opacity-40"
                      onClick={(event) => {
                        event.stopPropagation();
                        setDeleteTarget(platform);
                      }}
                    >
                      <Trash2 size={15} />
                    </button>
                  </span>
                </div>
              );
            })}
          </div>
          {edit && editingPlatform && (
            <div className="mt-5 rounded-xl bg-slate-50/70 p-4 dark:bg-slate-950/30">
              <h3 className="font-medium">编辑{editingPlatform.name}</h3>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <input
                  className="field"
                  disabled={!editingPlatform.isCustom}
                  value={edit.name}
                  onChange={(event) =>
                    setEdit({ ...edit, name: event.target.value })
                  }
                  placeholder="请输入平台名称"
                />
                <input
                  className="field"
                  value={edit.baseUrl}
                  onChange={(event) =>
                    setEdit({ ...edit, baseUrl: event.target.value })
                  }
                  placeholder="请输入接口地址"
                />
                <input
                  className="field sm:col-span-2"
                  type="password"
                  value={edit.apiKey}
                  onChange={(event) =>
                    setEdit({ ...edit, apiKey: event.target.value })
                  }
                  placeholder="API Key"
                />
              </div>
              <div className="mt-4 space-y-2">
                <button
                  className="button-secondary text-xs"
                  onClick={() =>
                    setEdit({
                      ...edit,
                      models: [
                        ...edit.models,
                        { id: "", name: "", type: "free" },
                      ],
                    })
                  }
                >
                  <Plus size={14} />
                  新增模型
                </button>
                {edit.models.map((model, index) => (
                  <div className="grid gap-2 sm:grid-cols-3" key={index}>
                    <input
                      className={
                        "field " + (!model.id.trim() ? "border-rose-400" : "")
                      }
                      value={model.id}
                      onChange={(event) =>
                        setEdit({
                          ...edit,
                          models: edit.models.map((item, i) =>
                            i === index
                              ? { ...item, id: event.target.value }
                              : item,
                          ),
                        })
                      }
                      placeholder="请输入模型 ID"
                    />
                    <input
                      className="field"
                      value={model.name}
                      onChange={(event) =>
                        setEdit({
                          ...edit,
                          models: edit.models.map((item, i) =>
                            i === index
                              ? { ...item, name: event.target.value }
                              : item,
                          ),
                        })
                      }
                      placeholder="模型名称"
                    />
                    <select
                      className="field"
                      value={model.type}
                      onChange={(event) =>
                        setEdit({
                          ...edit,
                          models: edit.models.map((item, i) =>
                            i === index
                              ? {
                                  ...item,
                                  type: event.target.value as AIModel["type"],
                                }
                              : item,
                          ),
                        })
                      }
                    >
                      <option value="free">免费</option>
                      <option value="paid">付费</option>
                      <option value="local">本地</option>
                    </select>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <button
                  className="button-secondary"
                  onClick={() => setEdit(null)}
                >
                  取消
                </button>
                <button
                  className="button-primary"
                  onClick={() => void saveEdit()}
                >
                  保存
                </button>
              </div>
            </div>
          )}
          {!edit && !selected.isCustom && (
            <button
              className="button-secondary mt-4"
              onClick={() => setRestoreOpen(true)}
            >
              恢复默认配置
            </button>
          )}
          {!edit && (
            <div className="mt-5 rounded-xl border p-4">
              <div className="flex justify-between">
                <h3>{selected.name}</h3>
                <span className="text-xs">{selectedModel?.id}</span>
              </div>
              <div className="mt-3 space-y-2">
                {selected.models.map((model) => (
                  <label
                    className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition hover:bg-white/70 dark:hover:bg-slate-900/70"
                    key={model.id}
                  >
                    <input
                      type="radio"
                      className="accent-indigo-600 dark:accent-[#22D3EE]"
                      checked={selectedModelId === model.id}
                      onChange={() => {
                        setSelectedModelId(model.id);
                        void saveCurrent({ modelId: model.id });
                      }}
                    />
                    <span className="min-w-0 flex-1">
                      {model.name} · {model.id}
                    </span>
                    <span className="text-[11px] text-slate-400 dark:text-slate-500">
                      {model.type === "free"
                        ? "免费"
                        : model.type === "paid"
                          ? "付费"
                          : "本地"}
                    </span>
                  </label>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-slate-400 dark:text-slate-500">
                Flash 模型为免费额度，Reasoner 模型为付费模型，需对应账号开通权限。
              </p>
              <label className="mt-4 block text-sm">
                API Key
                <div className="relative mt-2">
                  <input
                    className="field pr-10"
                    type={showKey ? "text" : "password"}
                    value={apiKey}
                    onChange={(event) => {
                      setApiKey(event.target.value);
                      void saveCurrent({ apiKey: event.target.value });
                    }}
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-2"
                    onClick={() => setShowKey(!showKey)}
                  >
                    {showKey ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
              </label>
              <label className="mt-3 block text-sm">
                接口地址
                <input
                  className="field mt-2"
                  value={baseUrl}
                  onChange={(event) => {
                    setBaseUrl(event.target.value);
                    void saveCurrent({ baseUrl: event.target.value });
                  }}
                />
              </label>
            </div>
          )}
          <div className="mt-5 flex flex-wrap gap-2 border-t pt-4">
            <button
              className="button-secondary"
              onClick={() => void exportConfig()}
            >
              <Download size={15} />
              导出配置
            </button>
            <label className="button-secondary cursor-pointer">
              <input
                className="sr-only"
                type="file"
                accept=".json,application/json"
                disabled={importing}
                onChange={(event) => void importConfig(event)}
              />
              {importing ? "正在导入" : "导入配置"}
            </label>
          </div>
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            可导出全部配置备份，换设备或清理缓存后可导入恢复。
          </p>
          <div className="mt-5 rounded-xl border border-dashed p-4">
            <h3 className="font-medium">添加自定义平台</h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <input
                className="field"
                placeholder="请输入平台名称"
                value={draft.name}
                onChange={(event) =>
                  setDraft({ ...draft, name: event.target.value })
                }
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void addPlatform();
                  }
                }}
              />
              <input
                className="field"
                placeholder="请输入接口地址"
                value={draft.baseUrl}
                onChange={(event) =>
                  setDraft({ ...draft, baseUrl: event.target.value })
                }
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void addPlatform();
                  }
                }}
              />
              <input
                className="field"
                type="password"
                placeholder="API Key"
                value={draft.apiKey}
                onChange={(event) =>
                  setDraft({ ...draft, apiKey: event.target.value })
                }
              />
              <input
                className="field"
                placeholder="请输入模型 ID"
                value={draft.modelId}
                onChange={(event) =>
                  setDraft({ ...draft, modelId: event.target.value })
                }
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void addPlatform();
                  }
                }}
              />
            </div>
            <button
              className="button-secondary mt-3"
              onClick={() => void addPlatform()}
            >
              <Plus size={15} />
              添加平台
            </button>
          </div>
        </section>
        <section className="panel p-6">
          <h2 className="font-semibold">主题</h2>
          <div className="mt-3 flex gap-2">
            {themes.map(([value, label, Icon]) => (
              <button
                className="button-secondary"
                key={value}
                onClick={() => changeTheme(value)}
              >
                <Icon size={16} />
                {label}
              </button>
            ))}
          </div>
        </section>
        <section className="panel p-6">
          <h2 className="font-semibold">数据管理</h2>
          <div className="mt-3 flex gap-2">
            <button className="button-secondary" onClick={exportAll}>
              <Download size={15} />
              导出数据
            </button>
            <button
              className="button-secondary"
              onClick={() => setClearOpen(true)}
            >
              <Trash2 size={15} />
              清空数据
            </button>
          </div>
          <p className="mt-3 text-sm text-slate-500">
            存储用量：{usage.formatted}
          </p>
        </section>
      </div>
      {clearOpen && (
        <ConfirmDialog
          title="确认执行该操作？"
          description="清空后所有记录将无法恢复"
          confirmLabel="确认清空"
          onCancel={() => setClearOpen(false)}
          onConfirm={() => void clearData()}
        />
      )}
      {restoreOpen && (
        <ConfirmDialog
          title="恢复默认配置"
          description="将重置该平台的接口地址与模型列表为官方默认值，API Key 保持不变"
          confirmLabel="确认恢复"
          onCancel={() => setRestoreOpen(false)}
          onConfirm={() => void restoreDefault()}
        />
      )}
      {deleteTarget && (
        <ConfirmDialog
          title="确认执行该操作？"
          description="删除后该内容将无法恢复"
          confirmLabel="确认删除"
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => void deletePlatform()}
        />
      )}
      {toast && <Toast message={toast} onClose={() => setToast("")} />}
    </div>
  );
}
