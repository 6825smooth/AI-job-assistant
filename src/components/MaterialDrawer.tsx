import { useEffect, useRef, useState } from "react";
import { Film, Loader2, Upload, X } from "lucide-react";
import { Toast } from "@/components/Toast";
import { PRESET_TAGS, Material } from "@/types";
import { createId } from "@/utils/id";
import { clearEditCache, readEditCache, writeEditCache } from "@/utils/editCache";

const MATERIAL_EDIT_CACHE = "aidesk:material-edit-cache";
const MAX_IMPORT_SIZE = 5 * 1024 * 1024;
const PARSE_TIMEOUT = "__PARSE_TIMEOUT__";
const FILE_READ_ERROR = "__FILE_READ_ERROR__";
const COMPONENT_TIMEOUT = 15_000;
const FORMAT_TIMEOUTS = { md: 10_000, txt: 10_000, docx: 30_000, pdf: 45_000, image: 60_000 } as const;

type MammothModule = typeof import("mammoth");
type PdfModule = typeof import("pdfjs-dist/legacy/build/pdf.mjs");
type ImageParserModule = typeof import("@/utils/ocr");
let mammothPromise: Promise<MammothModule> | null = null;
let pdfPromise: Promise<PdfModule> | null = null;
let imageParserPromise: Promise<ImageParserModule> | null = null;

type Form = Omit<Material, "id" | "createdAt" | "updatedAt">;
const blank: Form = {
  title: "",
  content: "",
  type: "personal",
  sourceUrl: "",
  tags: [],
  note: "",
};
const personalPlaceholder =
  "记录你亲自参与的项目背景、职责、行动与可验证结果；仅个人真实经历可用于简历和个性化面试内容。";
const referencePlaceholder =
  "记录外部文章、课程、面经或行业资料中的要点；仅作参考，不会写入简历或包装为个人经历。";
const personalHint = "请填写您真实参与的经历，用于简历与面试准备";
const referenceHint =
  "外部参考资料仅用于理解岗位和准备通用内容，不会写入简历，也不能替代个人真实经历。";
const sourceTemplate = "> 来源：视频标题｜发布者：｜平台：｜链接：｜发布日期：";
const categoryOptions = [
  "个人经历",
  "项目经历",
  "教育背景",
  "专业技能",
  "证书资质",
  "简历参考",
] as const;
const legacyCategoryTags = [
  "个人经历",
  "项目经历",
  "项目作品",
  "教育背景",
  "专业技能",
  "证书资质",
  "技能证书",
];

function readTextFile(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    let settled = false;
    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      reader.abort();
      reject(new Error(PARSE_TIMEOUT));
    }, FORMAT_TIMEOUTS.md);
    reader.onload = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      resolve(typeof reader.result === "string" ? reader.result : "");
    };
    reader.onerror = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      reject(new Error(FILE_READ_ERROR));
    };
    reader.onabort = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      reject(new Error(FILE_READ_ERROR));
    };
    try {
      reader.readAsText(file);
    } catch (error) {
      if (!settled) {
        settled = true;
        window.clearTimeout(timer);
        reject(error);
      }
    }
  });
}

function withTimeout<T>(promise: Promise<T>, timeout: number) {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(PARSE_TIMEOUT)), timeout);
    promise.then(
      (value) => { window.clearTimeout(timer); resolve(value); },
      (error) => { window.clearTimeout(timer); reject(error); },
    );
  });
}

function loadMammoth() {
  mammothPromise ??= import("mammoth").catch((error) => {
    mammothPromise = null;
    throw error;
  });
  return mammothPromise;
}

function loadPdf() {
  pdfPromise ??= import("pdfjs-dist/legacy/build/pdf.mjs").then((pdfjs) => {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/legacy/build/pdf.worker.mjs",
      import.meta.url,
    ).toString();
    return pdfjs;
  }).catch((error) => {
    pdfPromise = null;
    console.error("[MaterialImport] PDF component load failed", error);
    throw new Error("PDF 解析组件加载失败");
  });
  return pdfPromise;
}

function loadImageParser() {
  imageParserPromise ??= import("@/utils/ocr").catch((error) => {
    imageParserPromise = null;
    throw error;
  });
  return imageParserPromise;
}

async function readPdfFile(file: File, pdfjs: PdfModule) {
  try {
    const document = await pdfjs.getDocument({
      data: await file.arrayBuffer(),
      disableFontFace: true,
      useSystemFonts: false,
      disableAutoFetch: true,
      disableStream: true,
    }).promise;
    const pages: string[] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const textContent = await page.getTextContent();
      let lastY: number | undefined;
      const pageText = textContent.items.map((entry) => {
        const item = entry as { str?: string; transform?: number[] };
        if (!item.str) return "";
        const y = item.transform?.[5];
        const separator = y !== undefined && lastY !== undefined && Math.abs(y - lastY) > 3 ? "\n" : " ";
        if (y !== undefined) lastY = y;
        return `${separator}${item.str}`;
      }).join("").trim();
      pages.push(pageText);
    }
    const text = pages.filter(Boolean).join("\n\n").trim();
    if (text.length < 10) {
      throw new Error("该 PDF 为扫描件，无法提取文本，建议使用图片识别");
    }
    return text;
  } catch (error) {
    if (error instanceof Error && error.message.includes("扫描件")) throw error;
    throw new Error("PDF 文件解析失败，请检查文件是否正常且未加密");
  }
}


export function MaterialDrawer({
  material,
  tags,
  onClose,
  onSave,
  onAddTag,
}: {
  material?: Material;
  tags: string[];
  onClose: () => void;
  onSave: (value: Material) => void | Promise<void>;
  onAddTag: (tag: string) => void;
}) {
  const [form, setForm] = useState<Form>(
    material ? { ...material, type: material.type ?? "personal" } : blank,
  );
  const [newTag, setNewTag] = useState("");
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [parseProgress, setParseProgress] = useState({ current: 0, total: 0, fileName: "" });
  const [parseStage, setParseStage] = useState<"idle" | "loading" | "parsing">("idle");
  const [videoGuideOpen, setVideoGuideOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [saving, setSaving] = useState(false);
  const contentRef = useRef<HTMLTextAreaElement>(null);
  const activeRef = useRef(true);
  const currentFileIndexRef = useRef(-1);

  useEffect(
    () =>
      setForm(
        material ? { ...material, type: material.type ?? "personal" } : blank,
      ),
    [material],
  );
  useEffect(() => setVideoGuideOpen(false), [material]);
  useEffect(() => { if (!material) { const cached = readEditCache<Form>(MATERIAL_EDIT_CACHE); if (cached) setForm(cached); } }, [material]);
  useEffect(() => () => { activeRef.current = false; }, []);
  useEffect(() => { if (material || (!form.title.trim() && !form.content.trim())) return; const timer = window.setTimeout(() => writeEditCache(MATERIAL_EDIT_CACHE, form), 2000); return () => window.clearTimeout(timer); }, [form, material]);

  const selectedCategory =
    categoryOptions.find((category) => form.tags.includes(category)) ??
    (form.tags.includes("项目作品") || form.tags.includes("技能证书")
      ? form.tags.includes("项目作品")
        ? "项目经历"
        : "证书资质"
      : "个人经历");
  const isPersonal = (form.type ?? "personal") === "personal";
  const contentPlaceholder = isPersonal
    ? personalPlaceholder
    : referencePlaceholder;
  const contentHint = isPersonal ? personalHint : referenceHint;
  const update = <K extends keyof Form>(key: K, value: Form[K]) =>
    setForm((current) => ({ ...current, [key]: value }));
  const toggleTag = (tag: string) =>
    setForm((current) => ({
      ...current,
      tags: current.tags.includes(tag)
        ? current.tags.filter((item) => item !== tag)
        : [...current.tags, tag],
    }));
  const selectCategory = (category: (typeof categoryOptions)[number]) =>
    setForm((current) => ({
      ...current,
      tags: [
        ...current.tags.filter((tag) => !legacyCategoryTags.includes(tag)),
        category,
      ],
    }));
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.title.trim() || !form.content.trim()) return;
    const sourceUrl = (form.sourceUrl ?? "").trim();
    if (sourceUrl) {
      try {
        const parsedUrl = new URL(sourceUrl);
        if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
          throw new Error("invalid protocol");
        }
      } catch {
        setToast("请输入有效的来源链接");
        return;
      }
    }
    const now = new Date().toISOString();
    setSaving(true);
    try {
      await onSave({
        id: material?.id ?? createId(),
        ...form,
        type: form.type ?? "personal",
        title: form.title.trim(),
        content: form.content.trim(),
        createdAt: material?.createdAt ?? now,
        updatedAt: now,
      });
      clearEditCache(MATERIAL_EDIT_CACHE);
    } finally { setSaving(false); }
  };
  const addTag = () => {
    const tag = newTag.trim();
    if (tag && !tags.includes(tag)) onAddTag(tag);
    if (tag) toggleTag(tag);
    setNewTag("");
  };

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    const fileArray = Array.from(files ?? []);
    console.log("进入handleFile", fileArray);
    event.target.value = "";
    if (!fileArray.length) return;
    console.log("准备开始遍历，文件数量", fileArray.length);
    setOcrLoading(true);
    setOcrProgress(0);
    setParseProgress({ current: 0, total: fileArray.length, fileName: "" });
    const textsByIndex: Array<string | undefined> = [];
    let failed = 0;
    let timedOut = 0;
    let loadFailed = 0;
    let readFailed = 0;
    let formatFailed = 0;
    let exceptionFailed = 0;
    let totalTimedOut = false;
    const totalTimeoutId = window.setTimeout(() => {
      totalTimedOut = true;
      console.error("[MaterialImport] 全部解析超时");
      setParseStage("idle");
      setOcrLoading(false);
    }, (COMPONENT_TIMEOUT + FORMAT_TIMEOUTS.image) * fileArray.length + 5_000);
    try {
      for (let i = 0; i < fileArray.length; i += 1) {
        console.log("进入循环体，索引", i, "文件名", fileArray[i].name);
        const file = fileArray[i];
        console.log("开始遍历文件", file.name, file.type);
        currentFileIndexRef.current = i;
        setParseProgress((current) => ({ ...current, current: i + 1, total: fileArray.length, fileName: file.name }));
        let loadingComponent = false;
        try {
          if (file.size > MAX_IMPORT_SIZE) {
            failed += 1;
            formatFailed += 1;
          } else {
            const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
            const isImage = file.type.startsWith("image/") || ["png", "jpg", "jpeg", "webp"].includes(extension);
            if (!isImage && !["md", "txt", "docx", "pdf"].includes(extension)) {
              console.log("未匹配到支持的格式", file.name);
              failed += 1;
              formatFailed += 1;
            } else {
              const format = (isImage ? "image" : extension) as "image" | "md" | "txt" | "docx" | "pdf";
              const needsComponent = format === "image" ? !imageParserPromise : format === "docx" ? !mammothPromise : format === "pdf" ? !pdfPromise : false;
              let text = "";
              let parser: MammothModule | PdfModule | ImageParserModule | undefined;
              if (needsComponent) {
                loadingComponent = true;
                setParseStage("loading");
              }
              if (format === "image") parser = await withTimeout(loadImageParser(), COMPONENT_TIMEOUT);
              else if (format === "docx") parser = await withTimeout(loadMammoth(), COMPONENT_TIMEOUT);
              else if (format === "pdf") parser = await withTimeout(loadPdf(), COMPONENT_TIMEOUT);
              setParseStage("parsing");
              if (format === "image") {
                console.log("匹配到图片格式");
                console.log("[MaterialImport] 文件读取开始", file.name);
                text = await withTimeout(
                  (parser as ImageParserModule).recognizeImage(file, (progress) => {
                    if (currentFileIndexRef.current === i) setOcrProgress(progress);
                  }),
                  FORMAT_TIMEOUTS.image,
                );
              } else if (format === "md" || format === "txt") {
                console.log("匹配到纯文本格式");
                console.log("[MaterialImport] 文件读取开始", file.name);
                text = await readTextFile(file);
              } else if (format === "pdf") {
                console.log("匹配到PDF格式");
                console.log("[MaterialImport] 文件读取开始", file.name);
                text = await withTimeout(readPdfFile(file, parser as PdfModule), FORMAT_TIMEOUTS.pdf);
              } else {
                console.log("匹配到DOCX格式");
                console.log("[MaterialImport] 文件读取开始", file.name);
                text = await withTimeout(
                  (parser as MammothModule).extractRawText({ arrayBuffer: await file.arrayBuffer() }).then((result) => result.value),
                  FORMAT_TIMEOUTS.docx,
                );
              }
              if (!text.trim()) throw new Error("文件内容为空");
              textsByIndex[i] = text;
              console.log("[MaterialImport] 读取成功", file.name);
              console.log("单个文件解析完成", file.name, "内容长度:", text.length);
            }
          }
        } catch (error) {
          console.error("[MaterialImport] 文件处理失败", file.name, error);
          failed += 1;
          if (loadingComponent) loadFailed += 1;
          else if (error instanceof Error && error.message === PARSE_TIMEOUT) timedOut += 1;
          else if (error instanceof Error && error.message === FILE_READ_ERROR) readFailed += 1;
          else if (!loadingComponent) exceptionFailed += 1;
        } finally {
          setParseProgress((current) => ({ ...current, current: i + 1, fileName: file.name }));
          console.log("[MaterialImport] 状态更新", file.name);
          await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
        }
      }
      console.log("循环结束，进入最终收尾");
      try {
        console.log("进入收尾try块");
        if (totalTimedOut) console.warn("[MaterialImport] 收尾时批次已超时");
        const mergedTexts = textsByIndex.filter((text): text is string => Boolean(text));
        const separator = form.content.trim() ? "\n\n" : "";
        const finalText = mergedTexts.join("\n\n");
        console.log("文本拼接完成", "长度:", finalText.length);
        const nextContent = `${form.content}${separator}${finalText}`;
        const successCount = mergedTexts.length;
        if (mergedTexts.length) {
          console.log("赋值前目标值", form.content);
          setForm((current) => ({
            ...current,
            content: nextContent,
            sourceUrl: "",
          }));
          console.log("赋值后目标值", nextContent);
          const textarea = contentRef.current;
          if (textarea) {
            textarea.value = nextContent;
            console.log("ref赋值后值", textarea.value);
          } else {
            console.warn("ref赋值后值", undefined);
          }
          console.log("完整form对象", JSON.stringify(form, null, 2));
          requestAnimationFrame(() => {
            const contentInput = contentRef.current;
            if (contentInput && contentInput.value !== nextContent) {
              contentInput.value = nextContent;
            }
            contentInput?.focus();
            contentInput?.setSelectionRange(nextContent.length, nextContent.length);
          });
        }
        console.log("准备重置解析状态");
        setParseStage("idle");
        setOcrLoading(false);
        if (failed === fileArray.length) {
          setToast(`共 ${fileArray.length} 个文件，成功解析 0 个，失败 ${failed} 个（组件加载失败 ${loadFailed} 个，解析超时 ${timedOut} 个，文件读取失败 ${readFailed} 个，格式不支持 ${formatFailed} 个，解析异常 ${exceptionFailed} 个）`);
        } else if (failed > 0) {
          setToast(`共 ${fileArray.length} 个文件，成功解析 ${mergedTexts.length} 个，失败 ${failed} 个（组件加载失败 ${loadFailed} 个，解析超时 ${timedOut} 个，文件读取失败 ${readFailed} 个，格式不支持 ${formatFailed} 个，解析异常 ${exceptionFailed} 个）`);
        }
        console.log(
          "全部解析完成",
          "总文件数:",
          fileArray.length,
          "成功数:",
          successCount,
          "最终文本:",
          finalText,
          "是否解析中:",
          false,
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const stack = error instanceof Error ? error.stack : undefined;
        console.error("收尾异常详情", message, stack);
      } finally {
        setParseStage("idle");
        setOcrLoading(false);
      }
    } finally {
      window.clearTimeout(totalTimeoutId);
      currentFileIndexRef.current = -1;
      setParseStage("idle");
      if (activeRef.current) setOcrLoading(false);
    }
  };

  const insertSourceTemplate = () => {
    const separator = form.content
      ? form.content.endsWith("\n")
        ? ""
        : "\n\n"
      : "";
    const nextContent = `${form.content}${separator}${sourceTemplate}`;
    update("content", nextContent);
    requestAnimationFrame(() => {
      contentRef.current?.focus();
      contentRef.current?.setSelectionRange(
        nextContent.length,
        nextContent.length,
      );
    });
  };

  return (
    <div className="fixed inset-0 z-30 bg-slate-950/30">
      <div className="absolute inset-y-0 right-0 flex w-full max-w-xl flex-col bg-white shadow-2xl dark:bg-slate-900">
        <div className="flex items-center justify-between border-b px-6 py-5 dark:border-slate-800">
          <div>
            <h2 className="text-lg font-semibold">
              {material ? "编辑素材" : "新增素材"}
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              素材将保存在浏览器本地
            </p>
          </div>
          <button type="button" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <form
          id="material-form"
          className="flex-1 overflow-y-auto px-6 py-6"
          onSubmit={submit}
        >
          <label className="mb-5 block text-sm font-medium">
            标题
            <input
              autoFocus
              required
              className="field mt-2"
              value={form.title}
              onChange={(e) => update("title", e.target.value)}
              placeholder="例如：支付项目性能优化"
            />
          </label>
          <div className="mb-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">内容</p>
              <div className="flex flex-wrap gap-2">
                <label
                  className={`button-secondary cursor-pointer py-2 ${ocrLoading ? "pointer-events-none opacity-60" : ""}`}
                >
                  <input
                    className="sr-only"
                    type="file"
                    accept=".md,.txt,.docx,.pdf,.png,.jpg,.jpeg,.webp,image/*"
                    multiple
                    onChange={(event) => {
                      console.log("文件选择触发", event.target.files);
                      void handleFile(event);
                    }}
                    disabled={ocrLoading}
                  />
                  {ocrLoading ? (
                    <>
                      <Loader2 size={15} className="animate-spin" />
                      {parseStage === "loading" ? "加载解析组件中…" : `解析中（${parseProgress.current} / ${parseProgress.total}）`}
                      <span className="max-w-32 truncate" title={parseProgress.fileName}>{parseProgress.fileName}</span>
                    </>
                  ) : (
                    <>
                      <Upload size={15} />
                      上传文件提取内容
                    </>
                  )}
                </label>
                <button
                  type="button"
                  className="button-secondary py-2"
                  onClick={() => setVideoGuideOpen((open) => !open)}
                >
                  <Film size={15} />
                  提取视频文案
                </button>
              </div>
            </div>
            {ocrLoading && (
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <div
                  className="h-full rounded-full bg-indigo-500 transition-all"
                  style={{ width: `${ocrProgress}%` }}
                />
              </div>
            )}
            {videoGuideOpen && (
              <div className="mt-3 rounded-xl border bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950">
                <h3 className="text-sm font-semibold">视频文案提取参考</h3>
                <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                  本入口仅提供手动提取引导，不会上传视频或调用外部接口。
                </p>
                <div className="mt-3">
                  <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                    推荐工具
                  </p>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-5 text-slate-500 dark:text-slate-400">
                    <li>轻抖 / 提词匠（微信小程序）：短视频快速提取字幕，无需安装软件</li>
                    <li>剪映 / CapCut：可对照画面校对字幕，精准可控</li>
                    <li>视频平台自带字幕：直接复制内置字幕，零成本复用</li>
                    <li>通义听悟：长视频、会议访谈适用，专业转写精度高</li>
                  </ul>
                </div>
                <div className="mt-3">
                  <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                    操作步骤
                  </p>
                  <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs leading-5 text-slate-500 dark:text-slate-400">
                    <li>使用对应工具提取并导出字幕文本</li>
                    <li>人工筛选出你亲身参与的经历内容</li>
                    <li>粘贴到下方内容框，补充来源标注</li>
                  </ol>
                </div>
                <button
                  type="button"
                  className="button-secondary mt-4 py-2"
                  onClick={insertSourceTemplate}
                >
                  插入来源标注模板
                </button>
              </div>
            )}
            <textarea
              ref={contentRef}
              required
              maxLength={3000}
              className="field mt-3 min-h-40 resize-y leading-6"
              value={form.content}
              onChange={(e) => update("content", e.target.value)}
              placeholder={contentPlaceholder}
            />
            <p className="mt-2 text-xs leading-5 text-slate-400">
              {contentHint}
            </p>
            {form.content.length >= 3000 && <p className="mt-1 text-xs text-slate-400">已达字数上限</p>}
          </div>
          <fieldset className="mb-5">
            <legend className="text-sm font-medium">素材类目</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {categoryOptions.map((category) => (
                <button
                  type="button"
                  key={category}
                  onClick={() => selectCategory(category)}
                  className={`rounded-full border px-3 py-1.5 text-xs transition ${selectedCategory === category ? "border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300" : "text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"}`}
                >
                  {category}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset className="mb-5">
            <legend className="text-sm font-medium">素材性质</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <label
                className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2.5 text-sm ${form.type === "personal" ? "border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300" : "dark:border-slate-700"}`}
              >
                <input
                  className="accent-indigo-600"
                  type="radio"
                  name="material-type"
                  value="personal"
                  checked={form.type === "personal"}
                  onChange={() => update("type", "personal")}
                />
                个人真实经历
              </label>
              <label
                className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2.5 text-sm ${form.type === "reference" ? "border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300" : "dark:border-slate-700"}`}
              >
                <input
                  className="accent-indigo-600"
                  type="radio"
                  name="material-type"
                  value="reference"
                  checked={form.type === "reference"}
                  onChange={() => update("type", "reference")}
                />
                外部参考资料
              </label>
            </div>
          </fieldset>
          <label className="mb-5 block text-sm font-medium">
            来源链接<span className="font-normal text-slate-400">（可选）</span>
            <input
              type="text"
              className="field mt-2"
              value={form.sourceUrl}
              onChange={(e) => update("sourceUrl", e.target.value)}
              placeholder="https://..."
            />
          </label>
          <div className="mb-5">
            <p className="text-sm font-medium">标签</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {[
                ...PRESET_TAGS,
                ...tags.filter((tag) => !PRESET_TAGS.includes(tag as never)),
              ].map((tag) => (
                <button
                  type="button"
                  key={tag}
                  onClick={() => toggleTag(tag)}
                  className={`rounded-full border px-3 py-1.5 text-xs transition ${form.tags.includes(tag) ? "border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300" : "text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"}`}
                >
                  {tag}
                </button>
              ))}
            </div>
            <div className="mt-3 flex gap-2">
              <input
                className="field"
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                onKeyDown={(e) =>
                  e.key === "Enter" && (e.preventDefault(), addTag())
                }
                placeholder="新增自定义标签"
              />
              <button
                type="button"
                className="button-secondary shrink-0"
                onClick={addTag}
              >
                添加
              </button>
            </div>
          </div>
          <label className="block text-sm font-medium">
            备注
            <span className="font-normal text-slate-400">
              （不参与 AI 生成）
            </span>
            <textarea
              className="field mt-2 min-h-24 resize-y"
              value={form.note}
              onChange={(e) => update("note", e.target.value)}
              placeholder="补充一些仅供自己查看的备注。"
            />
          </label>
        </form>
        <div className="flex justify-end gap-3 border-t px-6 py-4 dark:border-slate-800">
          <button className="button-secondary" type="button" onClick={onClose}>
            取消
          </button>
          <button className="button-primary" disabled={saving} type="submit" form="material-form">
            {saving ? "保存中…" : "保存素材"}
          </button>
        </div>
      </div>
      {toast && <Toast message={toast} onClose={() => setToast("")} />}
    </div>
  );
}
