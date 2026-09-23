import { useEffect, useRef, useState } from "react";
import { Edit3, FileText, Loader2, Save, Sparkles, Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { EmptyState } from "@/components/EmptyState";
import { Toast } from "@/components/Toast";
import { RenameDialog } from "@/components/RenameDialog";
import { ExportMenu } from "@/components/ExportMenu";
import { MaterialDrawer } from "@/components/MaterialDrawer";
import { useMaterials } from "@/context/MaterialsContext";
import { buildInterviewGenPrompt } from "@/prompts/interviewGen";
import { chatCompletion } from "@/services/aiClient";
import { jdsRepository } from "@/storage";
import { interviewDraftRepository } from "@/storage/repository";
import { InterviewDraft, JDRecord, Material } from "@/types";
import { createId, formatDate } from "@/utils/id";
import { clearEditCache, readEditCache, writeEditCache } from "@/utils/editCache";

const INTERVIEW_EDIT_CACHE = "aidesk:interview-edit-cache";

function materialPayload(materials: Material[]) {
  return JSON.stringify(
    materials.map(({ id, title, content, tags }) => ({
      id,
      title,
      content,
      tags,
    })),
    null,
    2,
  );
}

function MarkdownPreview({
  content,
  loading,
  emptyMessage = "生成或编辑内容后，这里会显示实时预览",
}: {
  content: string;
  loading?: boolean;
  emptyMessage?: string;
}) {
  if (loading)
    return (
      <div className="min-h-[480px] animate-pulse space-y-4"><p className="text-center text-xs text-slate-400">生成中…</p>
        <div className="h-6 w-2/3 rounded bg-slate-200 dark:bg-slate-800" />
        <div className="h-4 w-full rounded bg-slate-100 dark:bg-slate-900" />
        <div className="h-4 w-5/6 rounded bg-slate-100 dark:bg-slate-900" />
        <div className="h-32 rounded-xl bg-slate-100 dark:bg-slate-900" />
      </div>
    );
  if (!content.trim())
    return (
      <div className="flex min-h-[480px] flex-col items-center justify-center text-center text-sm text-slate-400">
        <FileText size={24} className="text-slate-300" />
        <span className="mt-3">{emptyMessage}</span>
      </div>
    );
  return (
    <div className="min-h-[480px] space-y-3 text-sm leading-7 text-slate-700 dark:text-slate-200">
      {content.split("\n").map((line, index) => {
        if (!line.trim()) return <div className="h-2" key={index} />;
        if (line.startsWith("### "))
          return (
            <h3 className="pt-3 text-base font-semibold" key={index}>
              {line.slice(4)}
            </h3>
          );
        if (line.startsWith("## "))
          return (
            <h2 className="pt-4 text-lg font-semibold" key={index}>
              {line.slice(3)}
            </h2>
          );
        if (line.startsWith("# "))
          return (
            <h1 className="pt-2 text-2xl font-semibold" key={index}>
              {line.slice(2)}
            </h1>
          );
        if (line.startsWith("- ") || line.startsWith("* "))
          return (
            <div className="flex gap-2" key={index}>
              <span>•</span>
              <span>{line.slice(2)}</span>
            </div>
          );
        if (line.startsWith("> "))
          return (
            <blockquote
              className="border-l-2 border-indigo-300 pl-3 text-slate-500"
              key={index}
            >
              {line.slice(2)}
            </blockquote>
          );
        return <p key={index}>{line}</p>;
      })}
    </div>
  );
}

function draftTitle(jd?: JDRecord) {
  return `${jd?.title ?? "未命名面试准备"} ${new Date().toLocaleDateString("zh-CN")}`;
}

export function InterviewPage() {
  const { materials, save: saveMaterial } = useMaterials();
  const [jds, setJds] = useState<JDRecord[]>([]);
  const [drafts, setDrafts] = useState<InterviewDraft[]>([]);
  const [selectedDraftId, setSelectedDraftId] = useState("");
  const [jdId, setJdId] = useState(jds[0]?.id ?? "");
  const [selectedMaterialIds, setSelectedMaterialIds] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [toast, setToast] = useState("");
  const [deleteDraftId, setDeleteDraftId] = useState<string | null>(null);
  const [renameDraftId, setRenameDraftId] = useState<string | null>(null);
  const [materialDrawerOpen, setMaterialDrawerOpen] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void Promise.all([jdsRepository.getAll(), interviewDraftRepository.getDrafts()]).then(([storedJDs, storedDrafts]) => {
      setJds(storedJDs);
      setDrafts(storedDrafts);
      if (storedJDs[0]) setJdId(storedJDs[0].id);
      const cached = readEditCache<{ title: string; content: string; jdId: string; materialIds: string[] }>(INTERVIEW_EDIT_CACHE);
      if (cached) { setTitle(cached.title); setContent(cached.content); setJdId(cached.jdId); setSelectedMaterialIds(cached.materialIds); }
    });
  }, []);

  useEffect(() => { if (!content.trim() && !title.trim()) return; const timer = window.setTimeout(() => writeEditCache(INTERVIEW_EDIT_CACHE, { title, content, jdId, materialIds: selectedMaterialIds }), 2000); return () => window.clearTimeout(timer); }, [content, title, jdId, selectedMaterialIds]);

  const selectedJD = jds.find((jd) => jd.id === jdId);
  const selectedMaterials = materials.filter((material) =>
    selectedMaterialIds.includes(material.id),
  );
  useEffect(() => {
    const available = new Set(materials.map((material) => material.id));
    setSelectedMaterialIds((current) => current.filter((id) => available.has(id)));
  }, [materials]);

  const saveImportedMaterial = async (item: Material) => {
    await saveMaterial(item);
    setSelectedMaterialIds((current) =>
      current.includes(item.id) ? current : [...current, item.id],
    );
    setMaterialDrawerOpen(false);
    setToast("素材已保存");
  };

  const toggleMaterial = (materialId: string) =>
    setSelectedMaterialIds((current) =>
      current.includes(materialId)
        ? current.filter((id) => id !== materialId)
        : [...current, materialId],
    );

  const loadDraft = (draft: InterviewDraft) => {
    setSelectedDraftId(draft.id);
    setJdId(draft.jdId);
    setSelectedMaterialIds(draft.materialIds);
    setTitle(draft.title);
    clearEditCache(INTERVIEW_EDIT_CACHE);
    setContent(draft.content);
    setStreamingText("");
    setToast("面试草稿已载入");
  };

  const generate = async () => {
    if (!selectedJD) {
      setToast("请先选择一条历史 JD");
      return;
    }
    setLoading(true);
    setContent("");
    setStreamingText("");
    try {
      const result = await chatCompletion({
        messages: [
          {
            role: "user",
            content: buildInterviewGenPrompt(
              selectedJD.rawText,
              materialPayload(selectedMaterials),
            ),
          },
        ],
        stream: true,
        onToken: (token) => {
          setStreamingText((current) => current + token);
          setContent((current) => current + token);
        },
      });
      setContent(result);
      setStreamingText("");
      await saveDraft(result, true);
      setToast("面试备考文档生成完成，请检查并编辑内容");
    } catch {
      setContent("");
      setStreamingText("");
      setToast("调用失败，请检查 API Key 或网络连接");
    } finally {
      setLoading(false);
    }
  };

  const saveDraft = async (contentOverride = content, silent = false) => {
    if (!selectedJD) {
      if (!silent) setToast("请先选择一条历史 JD");
      return;
    }
    if (!contentOverride.trim()) {
      if (!silent) setToast("暂无可保存的面试文档");
      return;
    }
    const now = new Date().toISOString();
    const draft: InterviewDraft = {
      id: selectedDraftId || createId(),
      title: title.trim() || draftTitle(selectedJD),
      jdId: selectedJD.id,
      materialIds: selectedMaterialIds,
      content: contentOverride,
      createdAt:
        drafts.find((item) => item.id === selectedDraftId)?.createdAt ?? now,
      updatedAt: now,
      targetJdId: selectedJD.id,
      mode: "interview",
      createTime:
        drafts.find((item) => item.id === selectedDraftId)?.createTime ??
        Date.now(),
      updateTime: Date.now(),
    };
    await interviewDraftRepository.saveDraft(draft);
    setDrafts(await interviewDraftRepository.getDrafts());
    setSelectedDraftId(draft.id);
    setTitle(draft.title);
    clearEditCache(INTERVIEW_EDIT_CACHE);
    if (!silent) setToast("面试草稿已保存");
  };

  const renameDraft = async (titleValue: string) => {
    if (!renameDraftId) return;
    await interviewDraftRepository.renameDraft(renameDraftId, titleValue);
    setDrafts(await interviewDraftRepository.getDrafts());
    if (selectedDraftId === renameDraftId) setTitle(titleValue);
    setRenameDraftId(null);
    setToast("草稿已重命名");
  };

  const deleteDraft = async () => {
    if (!deleteDraftId) return;
    await interviewDraftRepository.deleteDraft(deleteDraftId);
    setDrafts(await interviewDraftRepository.getDrafts());
    if (selectedDraftId === deleteDraftId) setSelectedDraftId("");
    setDeleteDraftId(null);
    setToast("面试草稿已删除");
  };

  return (
    <div>
      <header>
        <h1 className="text-3xl font-semibold">面试准备</h1>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          可先生成通用参考；勾选素材后会增加基于真实素材的个性化准备。
        </p>
      </header>
      <div className="mt-8 grid gap-5 xl:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="space-y-5">
          <section className="panel p-5">
            <div className="flex items-center gap-2">
              <FileText size={18} className="text-indigo-500" />
              <h2 className="font-semibold">生成配置</h2>
            </div>
            <label className="mt-5 block text-sm font-medium">
              目标 JD
              <select
                className="field mt-2"
                value={jdId}
                onChange={(event) => setJdId(event.target.value)}
              >
                <option value="">请选择历史 JD</option>
                {jds.map((jd) => (
                  <option value={jd.id} key={jd.id}>
                    {jd.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="mt-4 block text-sm font-medium">
              草稿标题
              <input
                className="field mt-2"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder={draftTitle(selectedJD)}
              />
            </label>
            <div className="mt-5 flex items-center justify-between">
              <h3 className="text-sm font-semibold">选择素材（可选）</h3>
              <div className="flex items-center gap-2">
                <button type="button" className="button-secondary px-2.5 py-1.5 text-xs" onClick={() => setMaterialDrawerOpen(true)}>+ 导入素材</button>
                <span className="text-xs text-slate-400">已选 {selectedMaterials.length} 条</span>
              </div>
            </div>
            <div className="mt-3 max-h-72 space-y-2 overflow-y-auto">
              {materials.length ? (
                materials.map((material) => (
                  <label
                    className="flex cursor-pointer gap-3 rounded-xl border p-3 transition hover:border-indigo-300 dark:border-slate-800"
                    key={material.id}
                  >
                    <input
                      className="mt-1 accent-indigo-600"
                      type="checkbox"
                      checked={selectedMaterialIds.includes(material.id)}
                      onChange={() => toggleMaterial(material.id)}
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">
                        {material.title}
                      </span>
                      <span
                        className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[11px] ${material.type === "reference" ? "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300" : "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300"}`}
                      >
                        {material.type === "reference"
                          ? "参考资料"
                          : "个人经历"}
                      </span>
                      <span className="mt-1 block line-clamp-2 text-xs leading-5 text-slate-400">
                        {material.content}
                      </span>
                    </span>
                  </label>
                ))
              ) : (
                <p className="rounded-xl bg-slate-50 p-4 text-center text-xs leading-5 text-slate-400 dark:bg-slate-950">
                  暂无素材，可前往素材库添加
                </p>
              )}
            </div>
            <p className="mt-4 text-xs leading-5 text-slate-400">
              无素材时仅生成通用参考模板；有素材时会优先整理个性化内容。
            </p>
            <button
              className="button-primary mt-5 w-full"
              title={!selectedJD ? "请先选择目标 JD" : undefined}
              disabled={loading || !selectedJD}
              onClick={generate}
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  正在流式生成
                </>
              ) : (
                <>
                  <Sparkles size={16} />
                  生成面试文档
                </>
              )}
            </button>
          </section>
          <section className="panel p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">历史草稿</h2>
              <span className="text-xs text-slate-400">{drafts.length} 条</span>
            </div>
            <div className="mt-4 space-y-2">
              {drafts.length ? (
                drafts.map((draft) => (
                  <div
                    className={`group flex items-center gap-2 rounded-xl p-2 ${draft.id === selectedDraftId ? "bg-indigo-50 dark:bg-white" : "hover:bg-slate-50 dark:hover:bg-slate-800"}`}
                    key={draft.id}
                  >
                    <button
                      className="min-w-0 flex-1 text-left"
                      onClick={() => loadDraft(draft)}
                    >
                      <p className="truncate text-sm font-medium dark:text-[#F1F3F8]">
                        {draft.title}
                      </p>
                      <p className="mt-1 text-xs text-slate-400">
                        {formatDate(
                          draft.updateTime ?? Date.parse(draft.updatedAt),
                        )}
                      </p>
                    </button>
                    <button
                      title="重命名"
                      className="rounded-lg p-1.5 text-slate-400 opacity-70 hover:text-indigo-600 group-hover:opacity-100"
                      onClick={() => setRenameDraftId(draft.id)}
                    >
                      <Edit3 size={14} />
                    </button>
                    <button
                      title="删除"
                      className="rounded-lg p-1.5 text-slate-400 opacity-70 hover:bg-rose-50 hover:text-rose-600 group-hover:opacity-100"
                      onClick={() => setDeleteDraftId(draft.id)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))
              ) : (
                <EmptyState icon={FileText} title="还没有准备过面试" description="围绕岗位和简历，生成高频问题与回答思路" actionLabel="去准备面试" onAction={() => document.querySelector('select')?.focus()} />
              )}
            </div>
          </section>
        </aside>
        <main className="panel min-w-0 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold">Markdown 编辑与预览</h2>
              <p className="mt-1 text-xs text-slate-400">
                左侧编辑，右侧实时预览；个性化内容与通用参考会用分隔线区分。
              </p>
            </div>
            <div className="flex gap-2">
              <button
                className="button-secondary py-2"
                onClick={() => void saveDraft()}
              >
                <Save size={15} />
                保存草稿
              </button>
              <ExportMenu
                content={content}
                title={title.trim() || draftTitle(selectedJD)}
                previewRef={previewRef}
                onToast={setToast}
              />
            </div>
          </div>
          <div className="mt-5 grid gap-5 lg:grid-cols-2">
            <div>
              <textarea
                className="field min-h-[560px] max-h-[70vh] resize-y overflow-y-auto font-mono text-sm leading-6"
                disabled={loading}
                value={content}
                onChange={(event) => setContent(event.target.value)}
                placeholder="生成结果或 Markdown 内容会出现在这里。你可以继续手动编辑。"
              />
              {streamingText && (
                <p className="mt-2 text-xs text-slate-400">正在接收流式内容…</p>
              )}
            </div>
            <div
              ref={previewRef}
              className="export-preview min-h-[560px] rounded-xl border bg-white p-5 dark:border-slate-800 dark:bg-slate-950"
            >
              <MarkdownPreview
                content={content}
                loading={loading}
                emptyMessage={
                  !selectedJD
                    ? "请先在左侧选择目标 JD"
                    : "生成或编辑 Markdown 后，这里会显示实时预览"
                }
              />
            </div>
          </div>
        </main>
      </div>
      {deleteDraftId && (
        <ConfirmDialog
          title="确认执行该操作？"
          description="删除后该内容将无法恢复"
          onCancel={() => setDeleteDraftId(null)}
          onConfirm={deleteDraft}
        />
      )}
      {renameDraftId && (
        <RenameDialog
          title="重命名草稿"
          value={
            drafts.find((draft) => draft.id === renameDraftId)?.title ?? ""
          }
          onCancel={() => setRenameDraftId(null)}
          onConfirm={(value) => void renameDraft(value)}
        />
      )}
      {materialDrawerOpen && (
        <MaterialDrawer
          tags={["个人经历", "项目经历", "教育背景", "专业技能", "证书资质", "简历参考"]}
          onClose={() => setMaterialDrawerOpen(false)}
          onSave={saveImportedMaterial}
          onAddTag={() => undefined}
        />
      )}
      {toast && <Toast message={toast} onClose={() => setToast("")} />}
    </div>
  );
}
