interface Window {
  htmlDocx?: { asBlob: (html: string, options?: { orientation?: 'portrait' | 'landscape'; margins?: Record<string, number> }) => Blob }
}
