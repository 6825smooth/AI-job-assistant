export function interpolate(template: string, variables: Record<string, string>) {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key: string) => variables[key] ?? '')
}

export { JD_PARSER_PROMPT, buildJDParserPrompt } from './jdParser'
