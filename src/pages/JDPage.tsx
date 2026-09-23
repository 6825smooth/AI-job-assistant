import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  ChevronRight,
  Clock3,
  FileSearch,
  Loader2,
  Pencil,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { EmptyState } from "@/components/EmptyState";
import { Toast } from "@/components/Toast";
import { useMaterials } from "@/context/MaterialsContext";
import { buildJDParserPrompt } from "@/prompts";
import { requestJson, AIClientError } from "@/services/aiClient";
import { jdsRepository } from "@/storage";
import {
  JDMatchResult,
  JDMetadata,
  JDRecord,
  Material,
  ParsedJD,
} from "@/types";
import { createId, formatDate } from "@/utils/id";
import { matchMaterials } from "@/utils/matchEngine";
import { recognizeImage } from "@/utils/ocr";
import { clearEditCache, readEditCache, writeEditCache } from "@/utils/editCache";

const JD_EDIT_CACHE = "aidesk:jd-edit-cache";

const EMPTY_PARSED: ParsedJD = {
  hardRequirements: [],
  softSkills: [],
  businessDirection: [],
  inspectionPoints: [],
  keywords: [],
  metadata: {},
};

function emptyMatch(materials: Material[]): JDMatchResult {
  return matchMaterials(EMPTY_PARSED, materials);
}

function materialCategory(material: Material) {
  if (material.tags.includes("证书资质") || material.tags.includes("技能证书"))
    return "证书资质";
  if (material.tags.includes("专业技能")) return "专业技能";
  if (material.tags.includes("教育背景")) return "教育背景";
  if (material.tags.includes("项目经历") || material.tags.includes("项目作品"))
    return "项目经历";
  return "个人经历";
}

function isParsedJD(value: unknown): value is ParsedJD {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  const arrayFields = [
    "hardRequirements",
    "softSkills",
    "businessDirection",
    "inspectionPoints",
    "keywords",
  ];
  return (
    arrayFields.every((field) => Array.isArray(candidate[field])) &&
    (candidate.keywords as unknown[]).every(
      (keyword) =>
        Boolean(keyword) &&
        typeof keyword === "object" &&
        typeof (keyword as Record<string, unknown>).word === "string" &&
        typeof (keyword as Record<string, unknown>).weight === "number",
    )
  );
}

function normalizeRecord(record: JDRecord, materials: Material[]): JDRecord {
  const legacyParsed = record.parsed as ParsedJD & { focusPoints?: string[] };
  const parsed: ParsedJD = {
    ...EMPTY_PARSED,
    ...legacyParsed,
    inspectionPoints:
      legacyParsed.inspectionPoints ?? legacyParsed.focusPoints ?? [],
  };
  const legacyMatch = record.matchResult as unknown as {
    totalScore?: number;
    shortageTips?: string[];
    score?: number;
    gaps?: string[];
    matchedMaterials?: Array<{
      materialId?: string;
      relevance?: number;
      reason?: string;
    }>;
  };
  if (
    typeof legacyMatch.totalScore === "number" &&
    Array.isArray(legacyMatch.shortageTips)
  )
    return {
      ...record,
      title: record.title?.trim() || "职位详情",
      parsed,
      matchResult: record.matchResult as JDMatchResult,
    };
  const matchedMaterials = (legacyMatch.matchedMaterials ?? []).flatMap(
    (item) => {
      const material = materials.find(
        (candidate) => candidate.id === item.materialId,
      );
      return material
        ? [
            {
              material,
              score: Math.round((item.relevance ?? 0) * 100),
              reason: item.reason ?? "历史匹配结果",
              dimensions: { tag: 0, content: 0, relevance: 0 },
            },
          ]
        : [];
    },
  );
  return {
    ...record,
    title: record.title?.trim() || "职位详情",
    parsed,
    matchResult: {
      totalScore: legacyMatch.score ?? 0,
      matchedMaterials,
      shortageTips: legacyMatch.gaps ?? [],
    },
  };
}

function buildJDTitle(metadata: JDMetadata | undefined) {
  const parts = [metadata?.companyName, metadata?.positionName, metadata?.city]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));
  return parts.length ? parts.join("-") : "职位详情";
}

function normalizeMetadata(value: unknown): JDMetadata {
  if (!value || typeof value !== "object") return {};
  const metadata = value as Record<string, unknown>;
  return {
    companyName:
      typeof metadata.companyName === "string"
        ? metadata.companyName.trim()
        : "",
    positionName:
      typeof metadata.positionName === "string"
        ? metadata.positionName.trim()
        : "",
    city: typeof metadata.city === "string" ? metadata.city.trim() : "",
  };
}

function sortRecords(records: JDRecord[]) {
  return [...records].sort(
    (left, right) =>
      new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
  );
}

function ResultList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <h3 className="text-sm font-semibold">{title}</h3>
      <div className="mt-3 space-y-2">
        {items.length ? (
          items.map((item, index) => (
            <div
              className="rounded-xl bg-slate-50 px-3.5 py-2.5 text-sm leading-6 dark:bg-slate-950"
              key={`${item}-${index}`}
            >
              {item}
            </div>
          ))
        ) : (
          <p className="text-sm text-slate-400">暂无识别内容</p>
        )}
      </div>
    </div>
  );
}

function ResultSkeleton() {
  return (
    <div className="mt-6 space-y-4 animate-pulse"><p className="text-center text-xs text-slate-400">解析中…</p>
      <div className="h-5 w-1/3 rounded bg-slate-200 dark:bg-slate-800" />
      <div className="grid gap-4 md:grid-cols-2">
        <div className="h-24 rounded-xl bg-slate-100 dark:bg-slate-900" />
        <div className="h-24 rounded-xl bg-slate-100 dark:bg-slate-900" />
        <div className="h-24 rounded-xl bg-slate-100 dark:bg-slate-900" />
        <div className="h-24 rounded-xl bg-slate-100 dark:bg-slate-900" />
      </div>
    </div>
  );
}

function ScoreRing({ score }: { score: number }) {
  return (
    <div
      className="relative grid h-32 w-32 shrink-0 place-items-center rounded-full"
      style={{
        background: `conic-gradient(#4f46e5 ${score * 3.6}deg, #e2e8f0 0deg)`,
      }}
    >
      <div className="grid h-24 w-24 place-items-center rounded-full bg-white dark:bg-slate-900">
        <div className="text-center">
          <div className="text-3xl font-semibold">{score}</div>
          <div className="text-xs text-slate-400">匹配度</div>
        </div>
      </div>
    </div>
  );
}

export function JDPage() {
  const navigate = useNavigate();
  const { materials } = useMaterials();
  const [records, setRecords] = useState<JDRecord[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const selected = records.find((record) => record.id === selectedId);
  const [rawText, setRawText] = useState(selected?.rawText ?? "");
  const [parsed, setParsed] = useState<ParsedJD>(
    selected?.parsed ?? EMPTY_PARSED,
  );
  const [matchResult, setMatchResult] = useState<JDMatchResult>(emptyMatch([]));
  const [loading, setLoading] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [toast, setToast] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null);
  const [editingTitleValue, setEditingTitleValue] = useState("");
  const [detailEditingId, setDetailEditingId] = useState<string | null>(null);
  const [detailEditingValue, setDetailEditingValue] = useState("");
  const [parseError, setParseError] = useState("");
  const [previewMaterial, setPreviewMaterial] = useState<Material | null>(null);
  const isEditing = Boolean(selected && editingTitleId === selected.id);
  const isDetailEditing = Boolean(selected && detailEditingId === selected.id);
  console.log("JD标题渲染，编辑态:", isEditing);
  console.log("JD详情标题渲染，编辑态:", isDetailEditing);
  const resultRef = useRef<HTMLElement>(null);
  const jdInputRef = useRef<HTMLTextAreaElement>(null);
  const editingTitleOriginalRef = useRef("");
  const savingTitleRef = useRef(false);
  const cancelTitleRef = useRef(false);
  const detailTitleOriginalRef = useRef("");
  const savingDetailTitleRef = useRef(false);
  const cancelDetailTitleRef = useRef(false);

  useEffect(() => {
    void jdsRepository.getAll().then((storedJDs) => {
      const nextRecords = sortRecords(
        storedJDs.map((record) => normalizeRecord(record, materials)),
      );
      setRecords(nextRecords);
      const first = nextRecords[0];
      const cached = readEditCache<{ rawText: string }>(JD_EDIT_CACHE);
      if (cached?.rawText) setRawText(cached.rawText);
      if (first) {
        setSelectedId(first.id);
        setRawText(first.rawText);
        setParsed(first.parsed);
        setMatchResult(first.matchResult);
      }
    });
  }, [materials]);

  useEffect(() => { if (!rawText.trim()) return; const timer = window.setTimeout(() => writeEditCache(JD_EDIT_CACHE, { rawText }), 2000); return () => window.clearTimeout(timer); }, [rawText]);

  const selectRecord = (record: JDRecord) => {
    setDetailEditingId(null);
    setDetailEditingValue("");
    setSelectedId(record.id);
    setRawText(record.rawText);
    setParsed(record.parsed);
    setMatchResult(record.matchResult);
    setStreamText("");
  };

  const beginRename = (record: JDRecord) => {
    const title = record.title?.trim() || "职位详情";
    console.log("JD标题进入编辑态", record.id, title);
    editingTitleOriginalRef.current = title;
    cancelTitleRef.current = false;
    setEditingTitleId(record.id);
    setEditingTitleValue(title);
  };

  const beginDetailRename = (record: JDRecord) => {
    const title = record.title?.trim() || "职位详情";
    console.log("点击详情标题编辑", record.id, detailEditingId === record.id);
    detailTitleOriginalRef.current = title;
    cancelDetailTitleRef.current = false;
    setDetailEditingId(record.id);
    setDetailEditingValue(title);
    console.log("详情标题进入编辑态", record.id);
  };

  const saveDetailTitle = async () => {
    if (!detailEditingId || savingDetailTitleRef.current || cancelDetailTitleRef.current) return;
    const record = records.find((item) => item.id === detailEditingId);
    if (!record) return;
    const title = detailEditingValue.trim();
    const originalTitle = detailTitleOriginalRef.current;
    console.log("详情标题执行保存", detailEditingId);
    if (!title || title === originalTitle) {
      setDetailEditingId(null);
      setDetailEditingValue("");
      return;
    }
    savingDetailTitleRef.current = true;
    try {
      await jdsRepository.save({ ...record, title });
      const nextRecords = sortRecords(
        (await jdsRepository.getAll()).map((item) =>
          normalizeRecord(item, materials),
        ),
      );
      setRecords(nextRecords);
      setDetailEditingId(null);
      setDetailEditingValue("");
      setToast("JD 标题已保存");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "标题保存失败，请重试");
    } finally {
      savingDetailTitleRef.current = false;
    }
  };

  const cancelDetailRename = () => {
    console.log("详情标题取消编辑", detailEditingId);
    cancelDetailTitleRef.current = true;
    setDetailEditingId(null);
    setDetailEditingValue("");
  };

  const saveTitle = async () => {
    if (!editingTitleId || savingTitleRef.current || cancelTitleRef.current) return;
    console.log("JD标题执行保存", editingTitleId);
    const record = records.find((item) => item.id === editingTitleId);
    if (!record) return;
    const title = editingTitleValue.trim();
    const originalTitle = editingTitleOriginalRef.current;
    if (title === originalTitle) {
      setEditingTitleId(null);
      setEditingTitleValue("");
      return;
    }
    if (!title) {
      setEditingTitleId(null);
      setEditingTitleValue("");
      return;
    }
    savingTitleRef.current = true;
    try {
      await jdsRepository.save({ ...record, title });
      const nextRecords = sortRecords(
        (await jdsRepository.getAll()).map((item) =>
          normalizeRecord(item, materials),
        ),
      );
      setRecords(nextRecords);
      setEditingTitleId(null);
      setEditingTitleValue("");
      setToast("JD 标题已保存");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "标题保存失败，请重试");
    } finally {
      savingTitleRef.current = false;
    }
  };

  const parse = async () => {
    if (!rawText.trim()) {
      setToast("请先粘贴 JD 文本");
      return;
    }
    setLoading(true);
    setParseError("");
    setStreamText("");
    try {
      const result = await requestJson<unknown>({
        prompt: buildJDParserPrompt(rawText.trim()),
        onToken: (token) => setStreamText((current) => current + token),
      });
      if (!isParsedJD(result))
        throw new AIClientError(
          "AI 返回的 JSON 缺少必要字段，请重试。",
          "RESPONSE_PARSE",
        );
      const normalized: ParsedJD = {
        hardRequirements: result.hardRequirements.map(String),
        softSkills: result.softSkills.map(String),
        businessDirection: result.businessDirection.map(String),
        inspectionPoints: result.inspectionPoints.map(String),
        keywords: result.keywords
          .map((keyword) => ({
            word: keyword.word.trim(),
            weight: Math.max(1, Math.min(5, keyword.weight)),
          }))
          .filter((keyword) => keyword.word),
        metadata: normalizeMetadata(result.metadata),
      };
      const currentMaterials = materials;
      const nextMatch = matchMaterials(normalized, currentMaterials);
      const now = new Date().toISOString();
      // 每次解析都创建独立历史记录；重新解析也不能复用旧主键，否则 IndexedDB put 会覆盖历史记录。
      const record: JDRecord = {
        id: createId(),
        title: buildJDTitle(normalized.metadata),
        rawText: rawText.trim(),
        parsed: normalized,
        matchResult: nextMatch,
        createdAt: now,
        updatedAt: now,
      };
      await jdsRepository.save(record);
      const nextRecords = sortRecords(
        (await jdsRepository.getAll()).map((item) =>
          normalizeRecord(item, currentMaterials),
        ),
      );
      setRecords(nextRecords);
      setSelectedId(record.id);
      setParsed(normalized);
      setMatchResult(nextMatch);
      clearEditCache(JD_EDIT_CACHE);
      setStreamText("");
      setToast("JD 解析完成");
      requestAnimationFrame(() =>
        resultRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        }),
      );
    } catch {
      setStreamText("");
      const failureMessage = "调用失败，请检查 API Key 或网络连接";
      setParseError(failureMessage);
      setToast(failureMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleImage = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setOcrLoading(true);
    setOcrProgress(0);
    try {
      const text = await recognizeImage(file, setOcrProgress);
      const separator = rawText.trim() ? "\n\n" : "";
      setRawText(`${rawText}${separator}${text}`);
      setToast("图片文字识别完成，JD 内容已追加");
    } catch (error) {
      setToast(
        error instanceof Error ? error.message : "图片文字识别失败，请稍后重试",
      );
    } finally {
      setOcrLoading(false);
    }
  };

  const handlePaste = async (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const imageFiles = Array.from(event.clipboardData.items)
      .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
      .map((item) => item.getAsFile())
      .filter((file): file is File => Boolean(file));
    if (!imageFiles.length) return;
    event.preventDefault();
    if (ocrLoading) {
      setToast("图片识别进行中，请稍候");
      return;
    }
    setOcrLoading(true);
    setOcrProgress(0);
    let appendedText = rawText;
    let failedCount = 0;
    try {
      for (const file of imageFiles) {
        try {
          const text = await recognizeImage(file, setOcrProgress);
          if (text.trim()) {
            const separator = appendedText.trim() ? "\n\n" : "";
            appendedText = `${appendedText}${separator}${text}`;
          }
        } catch (error) {
          failedCount += 1;
          console.error("[JD] 剪贴板图片识别失败", error);
        }
      }
      if (appendedText !== rawText) {
        setRawText(appendedText);
        requestAnimationFrame(() => {
          const input = jdInputRef.current;
          input?.focus();
          input?.setSelectionRange(appendedText.length, appendedText.length);
        });
      }
      if (failedCount) {
        setToast(`图片识别完成，${failedCount} 张图片识别失败`);
      } else {
        setToast("图片文字识别完成，JD 内容已追加");
      }
    } finally {
      setOcrLoading(false);
    }
  };

  const remove = async () => {
    if (!deleteId) return;
    await jdsRepository.delete(deleteId);
    const nextRecords = sortRecords(
      (await jdsRepository.getAll()).map((record) =>
        normalizeRecord(record, materials),
      ),
    );
    setRecords(nextRecords);
    setDeleteId(null);
    if (selectedId === deleteId) {
      const nextRecord = nextRecords[0];
      if (nextRecord) selectRecord(nextRecord);
      else {
        setSelectedId("");
        setRawText("");
        setParsed(EMPTY_PARSED);
        setMatchResult(emptyMatch(materials));
      }
    }
    setToast("历史解析已删除");
  };

  return (
    <div>
      <header>
        <h1 className="text-3xl font-semibold">JD 智能解析</h1>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          粘贴目标岗位描述，提炼关键信息并匹配已有素材。
        </p>
      </header>
      <div className="mt-8 grid gap-5 xl:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="panel h-fit p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">历史解析</h2>
            <span className="text-xs text-slate-400">{records.length} 条</span>
          </div>
          <div className="mt-4 space-y-2">
            {records.length ? (
              records.map((record) => (
                <div
                  className={`group flex items-start gap-2 rounded-xl p-3 transition ${record.id === selectedId ? "bg-indigo-50 dark:bg-white" : "hover:bg-slate-50 dark:hover:bg-slate-800"}`}
                  key={record.id}
                >
                  {editingTitleId === record.id ? (
                    <input
                      autoFocus
                      className="field min-w-0 flex-1 py-1.5 text-sm"
                      value={editingTitleValue}
                      onChange={(event) =>
                        setEditingTitleValue(event.target.value)
                      }
                      onClick={(event) => event.stopPropagation()}
                      onBlur={() => void saveTitle()}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          void saveTitle();
                        }
                        if (event.key === "Escape") {
                          cancelTitleRef.current = true;
                          setEditingTitleId(null);
                          setEditingTitleValue("");
                        }
                      }}
                    />
                  ) : (
                    <button
                      className="min-w-0 flex-1 text-left"
                      onClick={() => selectRecord(record)}
                    >
                      <p className="truncate text-sm font-medium dark:text-[#F1F3F8]">
                        {record.title || "职位详情"}
                      </p>
                      <p className="mt-1 flex items-center gap-1 text-xs text-slate-400">
                        <Clock3 size={12} />
                        {formatDate(record.updatedAt)}
                      </p>
                    </button>
                  )}
                  <div className="flex shrink-0 items-start gap-1">
                    <button
                      type="button"
                      title="重命名"
                      className="mt-0.5 rounded-lg p-1.5 text-slate-400 opacity-70 hover:bg-indigo-50 hover:text-indigo-600 group-hover:opacity-100 dark:hover:bg-indigo-950/30"
                      onClick={(event) => {
                        event.stopPropagation();
                        beginRename(record);
                      }}
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      type="button"
                      title="删除该记录"
                      className="mt-0.5 rounded-lg p-1.5 text-slate-400 opacity-70 hover:bg-rose-50 hover:text-rose-600 group-hover:opacity-100 dark:hover:bg-rose-950/30"
                      onClick={(event) => {
                        event.stopPropagation();
                        setDeleteId(record.id);
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-xl bg-slate-50 p-4 text-center text-xs leading-5 text-slate-400 dark:bg-slate-950">
                <EmptyState icon={FileSearch} title="还没有解析过岗位" description="粘贴目标岗位JD，一键拆解要求与关键词" actionLabel="去解析JD" onAction={() => document.querySelector<HTMLTextAreaElement>('textarea[placeholder*="职位描述"]')?.focus()} />
              </div>
            )}
          </div>
        </aside>
        <main className="min-w-0 space-y-5">
          <section className="panel p-5">
            <div className="flex items-center gap-2">
              <FileSearch size={18} className="text-indigo-500" />
              <h2 className="font-semibold">粘贴 JD</h2>
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs text-slate-400">
                支持粘贴文本或上传截图识别
              </span>
              <label
                className={`button-secondary cursor-pointer py-2 ${ocrLoading ? "pointer-events-none opacity-60" : ""}`}
              >
                <input
                  className="sr-only"
                  type="file"
                  accept="image/*"
                  onChange={(event) => void handleImage(event)}
                  disabled={ocrLoading}
                />
                {ocrLoading ? (
                  <>
                    <Loader2 size={15} className="animate-spin" />
                    识别中 {ocrProgress}%
                  </>
                ) : (
                  <>
                    <Upload size={15} />
                    上传图片识别文字
                  </>
                )}
              </label>
            </div>
            {ocrLoading && (
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <div
                  className="h-full rounded-full bg-indigo-500 transition-all"
                  style={{ width: `${ocrProgress}%` }}
                />
              </div>
            )}
            <div className="relative mt-3">
              <textarea
              ref={jdInputRef}
              className="field min-h-48 max-h-72 resize-y overflow-y-auto leading-6"
              maxLength={5000}
              onKeyDown={(event) => {
                if (event.ctrlKey && event.key === "Enter") {
                  event.preventDefault();
                  void parse();
                }
              }}
              onPaste={(event) => void handlePaste(event)}
              value={rawText}
              onChange={(event) => setRawText(event.target.value)}
              placeholder="将职位描述粘贴到这里，例如岗位职责、任职要求、加分项等。"
              />
              {rawText && <button type="button" aria-label="清除职位描述" title="清除职位描述" className="absolute right-2 top-2 rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200" onClick={() => { setRawText(""); jdInputRef.current?.focus(); }}><X size={15} /></button>}
            </div>
            {rawText.length >= 5000 && <p className="mt-2 text-xs text-slate-400">已达字数上限</p>}
            <div className="mt-4 flex items-center justify-between gap-3">
              <span className="text-xs text-slate-400">
                {rawText.length} 字
              </span>
              <button
                className="button-primary"
                disabled={loading || ocrLoading}
                onClick={parse}
              >
                {loading ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    正在解析
                  </>
                ) : (
                  <>
                    <Sparkles size={16} />
                    开始解析
                  </>
                )}
              </button>
            </div>
            {loading && streamText && (
              <div className="mt-4 max-h-32 overflow-y-auto rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-500 dark:bg-slate-950">
                {streamText}
              </div>
            )}
          </section>
          <section ref={resultRef} className="panel p-5">
            <div className="flex items-center justify-between">
              <div>
                {selected ? (
                  <>
                    {isDetailEditing ? (
                      <div className="flex items-center gap-1">
                        <input
                          autoFocus
                          className="field py-1.5 text-sm font-semibold"
                          value={detailEditingValue}
                          onFocus={(event) => event.currentTarget.select()}
                          onChange={(event) => setDetailEditingValue(event.target.value)}
                          onBlur={() => void saveDetailTitle()}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              void saveDetailTitle();
                            }
                            if (event.key === "Escape") cancelDetailRename();
                          }}
                        />
                        <button type="button" aria-label="保存标题" title="保存" onMouseDown={(event) => event.preventDefault()} onClick={() => void saveDetailTitle()}>
                          <Check size={15} />
                        </button>
                        <button type="button" aria-label="取消编辑标题" title="取消" onMouseDown={(event) => event.preventDefault()} onClick={cancelDetailRename}>
                          <X size={15} />
                        </button>
                      </div>
                    ) : (
                      <div className="group flex items-center gap-2 text-left text-lg font-semibold">
                        <span className="max-w-[min(60vw,28rem)] truncate">
                          {selected.title || "职位详情"}
                        </span>
                        <button
                          type="button"
                          aria-label="编辑职位详情标题"
                          title="编辑标题"
                          className="rounded-lg p-1 text-slate-400 opacity-0 transition hover:bg-slate-100 hover:text-indigo-600 group-hover:opacity-100 dark:hover:bg-slate-800"
                          onClick={() => beginDetailRename(selected)}
                        >
                          <Pencil size={15} />
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <h2 className="font-semibold">解析结果</h2>
                )}
                <p className="mt-1 text-xs text-slate-400">
                  结构化结果严格来自当前 JD 原文
                </p>
              </div>
              {selected && (
                <button
                  className="button-secondary py-2"
                  onClick={parse}
                  disabled={loading}
                >
                  <RefreshCw size={15} />
                  重新解析
                </button>
              )}
            </div>
            {loading ? (
              <ResultSkeleton />
            ) : parseError ? (
              <div className="flex min-h-40 flex-col items-center justify-center text-center">
                <AlertTriangle size={28} className="text-rose-400" />
                <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
                  {parseError}
                </p>
                <button
                  type="button"
                  className="button-secondary mt-4"
                  onClick={() => void parse()}
                >
                  <RefreshCw size={15} />
                  重新解析
                </button>
              </div>
            ) : parsed.keywords.length ||
              parsed.hardRequirements.length ||
              parsed.softSkills.length ||
              parsed.businessDirection.length ||
              parsed.inspectionPoints.length ? (
              <div className="mt-6 grid gap-6 md:grid-cols-2">
                <ResultList title="硬性要求" items={parsed.hardRequirements} />
                <ResultList title="软技能" items={parsed.softSkills} />
                <ResultList
                  title="核心业务方向"
                  items={parsed.businessDirection}
                />
                <ResultList title="考察重点" items={parsed.inspectionPoints} />
                <div className="md:col-span-2">
                  <h3 className="text-sm font-semibold">关键词</h3>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {parsed.keywords.map((keyword) => (
                      <span
                        className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs text-indigo-700 dark:border-indigo-900 dark:bg-indigo-950/60 dark:text-indigo-300"
                        key={keyword.word}
                      >
                        {keyword.word}
                        <span className="ml-1 text-indigo-400">
                          ·{keyword.weight}
                        </span>
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex min-h-40 flex-col items-center justify-center text-center">
                <Search size={24} className="text-slate-300" />
                <p className="mt-3 text-sm text-slate-500">
                  暂无解析结果，请在上方粘贴职位后点击解析
                </p>
              </div>
            )}
          </section>
          <section className="panel p-5">
            <div className="flex items-center gap-2">
              <Sparkles size={18} className="text-indigo-500" />
              <h2 className="font-semibold">素材匹配</h2>
            </div>
            {parsed.keywords.length ? (
              <div className="mt-6 grid gap-6 lg:grid-cols-[150px_minmax(0,1fr)]">
                <ScoreRing score={matchResult.totalScore} />
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold">
                    匹配素材{" "}
                    <span className="font-normal text-slate-400">
                      · {matchResult.matchedMaterials.length} 条
                    </span>
                  </h3>
                  <div className="mt-3 space-y-2">
                    {matchResult.matchedMaterials.length ? (
                      matchResult.matchedMaterials.map((item) => (
                        <button
                          className="flex w-full items-center gap-3 rounded-xl border p-3 text-left transition hover:border-indigo-300 hover:bg-indigo-50/50 dark:border-slate-800 dark:hover:bg-indigo-950/30"
                          key={item.material.id}
                          onClick={() => setPreviewMaterial(item.material)}
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">
                              {item.material.title}
                            </span>
                            <span className="mt-1 block text-xs text-slate-400">
                              {materialCategory(item.material)} · {item.reason}
                            </span>
                          </span>
                          <span className="text-sm font-semibold text-indigo-600">
                            {item.score}%
                          </span>
                          <ChevronRight size={16} className="text-slate-300" />
                        </button>
                      ))
                    ) : (
                      <p className="text-sm text-slate-400">
                        暂无匹配素材，请先完善素材库。
                      </p>
                    )}
                  </div>
                </div>
                <div className="lg:col-span-2">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <AlertTriangle size={16} className="text-amber-500" />
                    素材短板
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {matchResult.shortageTips.length ? (
                      matchResult.shortageTips.map((tip) => (
                        <button
                          type="button"
                          className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-950/30 dark:text-amber-300"
                          key={tip}
                          onClick={() =>
                            navigate(
                              `/materials?new=${encodeURIComponent(tip.replace(/^素材库暂未覆盖「|」$/g, ""))}`,
                            )
                          }
                        >
                          {tip}
                        </button>
                      ))
                    ) : (
                      <span className="text-sm text-emerald-600">
                        当前关键词均能在素材库中找到覆盖。
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex min-h-32 flex-col items-center justify-center text-center text-sm text-slate-400">
                完成 JD 解析后，将自动计算素材匹配
              </div>
            )}
          </section>
        </main>
      </div>
      {deleteId && (
        <ConfirmDialog
          title="确认执行该操作？"
          description="删除后该内容将无法恢复"
          onCancel={() => setDeleteId(null)}
          onConfirm={remove}
        />
      )}
      {previewMaterial && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/40 p-4"
          onClick={() => setPreviewMaterial(null)}
        >
          <div
            className="panel max-h-[80vh] w-full max-w-xl overflow-y-auto p-6"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold">
                  {previewMaterial.title}
                </h3>
                <p className="mt-1 text-xs text-indigo-600">
                  {materialCategory(previewMaterial)}
                </p>
              </div>
              <button type="button" onClick={() => setPreviewMaterial(null)}>
                <X size={20} />
              </button>
            </div>
            <p className="mt-5 whitespace-pre-wrap text-sm leading-7 text-slate-600 dark:text-slate-300">
              {previewMaterial.content}
            </p>
            {previewMaterial.tags.length > 0 && (
              <div className="mt-5 flex flex-wrap gap-2">
                {previewMaterial.tags.map((tag) => (
                  <span
                    className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-500"
                    key={tag}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
      {toast && <Toast message={toast} onClose={() => setToast("")} />}
    </div>
  );
}
