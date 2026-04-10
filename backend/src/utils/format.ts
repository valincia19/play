/**
 * Shared formatting utilities for the backend.
 */
import { KB, MB, GB, TB } from './constants'

export function formatBytes(bytes: number, decimals = 2): string {
  if (!+bytes) return '0 Bytes'
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']
  
  if (bytes < KB) return `${bytes} ${sizes[0]}`
  if (bytes < MB) return `${(bytes / KB).toFixed(dm)} ${sizes[1]}`
  if (bytes < GB) return `${(bytes / MB).toFixed(dm)} ${sizes[2]}`
  if (bytes < TB) return `${(bytes / GB).toFixed(dm)} ${sizes[3]}`
  return `${(bytes / TB).toFixed(dm)} ${sizes[4]}`
}
