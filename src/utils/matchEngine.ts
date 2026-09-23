import { JDKeyword, JDMatchResult, Material, MatchedMaterial, ParsedJD } from '@/types'

function normalize(value: string) { return value.toLocaleLowerCase().replace(/[\s，。、“”‘’；：！？（）()、·/_-]+/g, '') }
function tokens(value: string) { return (value.toLocaleLowerCase().match(/[\u4e00-\u9fff]|[a-z0-9]+/gi) ?? []).filter(Boolean) }
function keywordMatch(keyword: string, fields: string[]) {
  const normalizedKeyword = normalize(keyword)
  if (!normalizedKeyword) return { level: 0 }
  const normalizedFields = fields.map(normalize)
  if (normalizedFields.some((field) => field === normalizedKeyword)) return { level: 3 }
  if (normalizedFields.some((field) => field.includes(normalizedKeyword) || normalizedKeyword.includes(field))) return { level: 2 }
  const keywordTokens = tokens(keyword)
  if (keywordTokens.length < 2) return { level: 0 }
  const splitMatch = normalizedFields.some((field) => keywordTokens.filter((token) => tokens(field).includes(token) || field.includes(token)).length / keywordTokens.length >= 0.5)
  return { level: splitMatch ? 1 : 0 }
}

function calculateMaterialMatch(material: Material, keywords: JDKeyword[]): MatchedMaterial | null {
  if (!keywords.length) return null
  const fields = [material.title, material.content, ...material.tags]
  const matches = keywords.map((keyword) => ({ keyword, level: keywordMatch(keyword.word, fields).level })).filter((item) => item.level > 0)
  if (!matches.length) return null
  const baseScore = matches.length / keywords.length * 100
  const qualityBonus = matches.reduce((sum, item) => sum + (item.level - 1) * Math.max(1, item.keyword.weight) * 1.5, 0)
  const weightBonus = matches.reduce((sum, item) => sum + (Math.max(1, item.keyword.weight) - 1) * 0.8, 0)
  const score = Math.max(0, Math.min(100, Math.round(baseScore + qualityBonus + weightBonus)))
  const hitWords = matches.map((item) => item.keyword.word)
  const tagHits = matches.filter((item) => material.tags.some((tag) => keywordMatch(item.keyword.word, [tag]).level > 0)).length
  const contentHits = matches.filter((item) => keywordMatch(item.keyword.word, [material.title, material.content]).level > 0).length
  return { material, score, reason: `${hitWords.length} 个关键词命中：${hitWords.slice(0, 3).join('、')}`, dimensions: { tag: Math.round(tagHits / keywords.length * 100), content: Math.round(contentHits / keywords.length * 100), relevance: score } }
}

export function matchMaterials(parsed: ParsedJD, materials: Material[]): JDMatchResult {
  const keywords = parsed.keywords.filter((keyword) => keyword.word.trim())
  const matchedMaterials = materials.map((material) => calculateMaterialMatch(material, keywords)).filter((item): item is MatchedMaterial => Boolean(item)).sort((left, right) => right.score - left.score).slice(0, 3)
  const totalScore = matchedMaterials.length ? Math.round(matchedMaterials.reduce((sum, item) => sum + item.score, 0) / matchedMaterials.length) : 0
  const shortageTips = keywords.filter((keyword) => !materials.some((material) => keywordMatch(keyword.word, [material.title, material.content, ...material.tags]).level > 0)).sort((left, right) => right.weight - left.weight).map((keyword) => `素材库暂未覆盖「${keyword.word}」`)
  if (!materials.length) shortageTips.unshift('素材库暂无内容，请先补充项目经历、技能或行业信息。')
  return { totalScore, matchedMaterials, shortageTips }
}
