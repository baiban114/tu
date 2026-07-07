import { common, createLowlight } from 'lowlight'

/** Shared lowlight instance for fenced code block syntax highlighting. */
export const codeBlockLowlight = createLowlight(common)
