import { useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  ExternalLink,
  FileText,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { MaterialDrawer } from "@/components/MaterialDrawer";
import { Toast } from "@/components/Toast";
import { EmptyState } from "@/components/EmptyState";
import {
  DEFAULT_SETTINGS,
  settingsRepository,
} from "@/storage";
import { useMaterials } from "@/context/MaterialsContext";
import { Material, PRESET_TAGS } from "@/types";
import { formatDate } from "@/utils/id";

type Filter =
  | "all"
  | "personal"
  | "project"
  | "education"
  | "skill"
  | "certificate"
  | "resume";
function category(item: Material): Exclude<Filter, "all"> {
  if (item.tags.includes("简历参考")) return "resume";
  if (item.tags.includes("证书资质") || item.tags.includes("技能证书"))
    return "certificate";
  if (item.tags.includes("专业技能")) return "skill";
  if (item.tags.includes("教育背景")) return "education";
  if (item.tags.includes("项目经历") || item.tags.includes("项目作品"))
    return "project";
  return item.type === "reference" ? "project" : "personal";
}
function categoryLabel(value: Filter) {
  return value === "personal"
    ? "个人经历"
    : value === "project"
      ? "项目经历"
      : value === "education"
        ? "教育背景"
        : value === "skill"
          ? "专业技能"
          : value === "certificate"
            ? "证书资质"
            : value === "resume"
              ? "简历参考"
            : "全部";
}

export function MaterialsPage() {
  const { materials, save: saveMaterial, remove: removeMaterial, refresh } = useMaterials();
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sortNewest, setSortNewest] = useState(true);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [drawer, setDrawer] = useState<Material | "new" | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [toast, setToast] = useState("");
  const [searchParams] = useSearchParams();

  useEffect(() => {
    void settingsRepository.get().then(setSettings);
  }, []);
  useEffect(() => {
    const item = materials.find(
      (material) => material.id === searchParams.get("materialId"),
    );
    if (item) setDrawer(item);
  }, [materials, searchParams]);
  useEffect(() => {
    const available = new Set(materials.map((material) => material.id));
    setSelectedIds((current) => current.filter((id) => available.has(id)));
  }, [materials]);

  const filtered = useMemo(
    () =>
      materials
        .filter((item) => {
          const text = (
            item.title +
            " " +
            item.content +
            " " +
            (item.note ?? "")
          ).toLowerCase();
          return (
            (filter === "all" || category(item) === filter) &&
            text.includes(query.toLowerCase())
          );
        })
        .sort((a, b) =>
          sortNewest
            ? new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
            : new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime(),
        ),
    [materials, filter, query, sortNewest],
  );
  const save = async (item: Material) => {
    await saveMaterial(item);
    await refresh();
    setDrawer(null);
    setToast("素材已保存");
  };
  const removeSelected = async () => {
    for (const id of selectedIds) await removeMaterial(id);
    await refresh();
    setSelectedIds([]);
    setConfirm(false);
    setToast("素材已删除");
  };
  const importText = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = [...(event.target.files ?? [])];
    event.target.value = "";
    for (const file of files) {
      const content = await file.text();
      const now = new Date().toISOString();
      await saveMaterial({
        id: crypto.randomUUID(),
        title: file.name.replace(/\.(txt|md)$/i, ""),
        content,
        type: file.name.toLowerCase().endsWith(".md")
          ? "reference"
          : "personal",
        tags: [],
        createdAt: now,
        updatedAt: now,
      });
    }
    await refresh();
    setToast("素材已导入");
  };
  const allTags = [...PRESET_TAGS, ...settings.customTags];
  return (
    <div>
      <header className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <h1 className="text-3xl font-semibold">素材库</h1>
          <p className="mt-2 text-sm text-slate-500">
            沉淀真实经历，让后续每一步都有可靠依据。
          </p>
        </div>
        <div className="flex gap-2">
          <label className="button-secondary cursor-pointer">
            <Upload size={16} />
            导入备份
            <input
              className="sr-only"
              type="file"
              accept=".txt,.md,text/plain,text/markdown"
              multiple
              onChange={(event) => void importText(event)}
            />
          </label>
          <button className="button-primary" onClick={() => setDrawer("new")}>
            <Plus size={17} />
            新增素材
          </button>
        </div>
      </header>
      <section className="mt-8">
        <div className="flex flex-col gap-3 md:flex-row">
          <div className="relative flex-1">
            <Search
              className="absolute left-3.5 top-3 text-slate-400"
              size={18}
            />
            <input
              className="field pl-10"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索标题、内容或备注..."
            />
          </div>
          <select
            className="field md:w-32"
            value={sortNewest ? "new" : "old"}
            onChange={(event) => setSortNewest(event.target.value === "new")}
          >
            <option value="new">最新排序</option>
            <option value="old">最早排序</option>
          </select>
        </div>
        <div className="mt-3 flex gap-2 overflow-x-auto">
          {(
            [
              "all",
              "personal",
              "project",
              "education",
              "skill",
              "certificate",
              "resume",
            ] as Filter[]
          ).map((value) => (
            <button
              key={value}
              onClick={() => setFilter(value)}
              className={
                "whitespace-nowrap rounded-full px-3.5 py-2 text-xs font-medium " +
                (filter === value
                  ? "bg-indigo-600 text-white"
                  : "bg-white text-slate-500")
              }
            >
              {categoryLabel(value)} ·{" "}
              {value === "all"
                ? materials.length
                : materials.filter((item) => category(item) === value).length}
            </button>
          ))}
        </div>
        <div className="mt-3 flex gap-2 overflow-x-auto">
          <button
            onClick={() => setFilter("all")}
            className="text-xs text-slate-400"
          >
            全部标签
          </button>
          {allTags.map((tag) => (
            <button
              key={tag}
              onClick={() => setQuery(tag)}
              className="text-xs text-indigo-600"
            >
              #{tag}
            </button>
          ))}
        </div>
      </section>
      {selectedIds.length > 0 && (
        <div className="sticky bottom-4 z-10 mt-4 flex items-center justify-between rounded-xl border bg-white p-3 shadow-lg">
          <span className="text-sm">已选 {selectedIds.length} 项</span>
          <button
            className="button-secondary text-rose-600"
            onClick={() => setConfirm(true)}
          >
            <Trash2 size={15} />
            批量删除
          </button>
        </div>
      )}
      <section className="mt-6">
        {filtered.length ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {filtered.map((item) => (
              <article className="panel group p-5" key={item.id}>
                <div className="flex gap-3">
                  <input
                    className="mt-1 accent-indigo-600"
                    type="checkbox"
                    checked={selectedIds.includes(item.id)}
                    onChange={() =>
                      setSelectedIds((ids) =>
                        ids.includes(item.id)
                          ? ids.filter((id) => id !== item.id)
                          : [...ids, item.id],
                      )
                    }
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h2 className="font-semibold">{item.title}</h2>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs text-indigo-700">
                            {categoryLabel(category(item) as Filter)}
                          </span>
                          {item.tags.map((tag) => (
                            <span
                              key={tag}
                              className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-500"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <button
                          className="rounded-lg p-2 text-slate-400 hover:text-indigo-600"
                          onClick={() => setDrawer(item)}
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          className="rounded-lg p-2 text-slate-400 hover:text-rose-600"
                          onClick={() => {
                            setSelectedIds([item.id]);
                            setConfirm(true);
                          }}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                    <p className="mt-4 line-clamp-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">
                      {item.content}
                    </p>
                    <div className="mt-4 flex items-center gap-3 text-xs text-slate-400">
                      <FileText size={13} />
                      更新于 {formatDate(item.updatedAt)}{" "}
                      {item.sourceUrl && (
                        <a
                          href={item.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <ExternalLink size={13} />
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="panel flex min-h-72 flex-col items-center justify-center p-8 text-center">
            {materials.length ? <><BookOpen size={28} className="text-slate-300" /><p className="mt-4 text-sm text-slate-500">没有找到匹配素材</p></> : <EmptyState icon={BookOpen} title="还没有沉淀任何素材" description="把你的项目经历、金句和行业信息沉淀下来，是所有功能的基础" actionLabel="去添加素材" onAction={() => setDrawer("new")} />}
          </div>
        )}
      </section>
      {drawer && (
        <MaterialDrawer
          material={drawer === "new" ? undefined : drawer}
          tags={[
            ...settings.customTags,
            "项目经历",
            "教育背景",
            "专业技能",
            "证书资质",
            "简历参考",
          ]}
          onClose={() => setDrawer(null)}
          onSave={save}
          onAddTag={async (tag) => {
            const next = {
              ...settings,
              customTags: [...settings.customTags, tag],
            };
            await settingsRepository.save(next);
            setSettings(next);
          }}
        />
      )}
      {confirm && (
        <ConfirmDialog
          title="确认执行该操作？"
          description="删除后该内容将无法恢复"
          confirmLabel="确认删除"
          onCancel={() => setConfirm(false)}
          onConfirm={() => void removeSelected()}
        />
      )}
      {toast && <Toast message={toast} onClose={() => setToast("")} />}
    </div>
  );
}
