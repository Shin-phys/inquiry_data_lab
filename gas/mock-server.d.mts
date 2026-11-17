export function makeGas(source?: string): {
  sheets: Map<string, { rows: unknown[][] }>
  get: (parameter: Record<string, string>) => any
  post: (contents: unknown) => any
}
