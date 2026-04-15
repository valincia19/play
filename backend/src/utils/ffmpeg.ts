/**
 * FFmpeg Utilities — extracted from video/processor.ts
 *
 * Provides memory profile detection, FFmpeg execution wrapper,
 * media probing, and output validation.
 */

import ffmpeg from 'fluent-ffmpeg'
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg'
import ffprobeInstaller from '@ffprobe-installer/ffprobe'
import { promisify } from 'util'
import { execFile } from 'child_process'
import os from 'os'
import { UnrecoverableError } from 'bullmq'
import { logger } from './logger'

// Prefer system FFmpeg (installed via Dockerfile) over npm package version
// The npm @ffmpeg-installer version is from 2018 and lacks codecs/protocols
ffmpeg.setFfmpegPath(process.env.FFMPEG_PATH || ffmpegInstaller.path)
ffmpeg.setFfprobePath(process.env.FFPROBE_PATH || ffprobeInstaller.path)

const execFileAsync = promisify(execFile)

// ─── Memory Profile ───────────────────────────────────────────────────

export interface MemoryProfile {
  tier: 'low' | 'medium' | 'high'
  uploadConcurrency: number
  streamBufferSize: number
  ffmpegThreadsPerQuality: number
  maxSimultaneousQualities: number
  downloadBufferSize: number
  hlsSegmentDuration: number
  ffmpegPreset: 'superfast' | 'veryfast'
}

const GB = 1024 * 1024 * 1024
const MB = 1024 * 1024

export function detectMemoryProfile(): MemoryProfile {
  const totalMem = os.totalmem()
  const freeMem = os.freemem()
  const usable = Math.min(totalMem / 2, freeMem)

  if (usable < 1 * GB) {
    return {
      tier: 'low',
      uploadConcurrency: 2,
      streamBufferSize: 256 * 1024,
      ffmpegThreadsPerQuality: 1,
      maxSimultaneousQualities: 1,
      downloadBufferSize: 512 * 1024,
      hlsSegmentDuration: 8,
      ffmpegPreset: 'superfast',
    }
  } else if (usable < 4 * GB) {
    return {
      tier: 'medium',
      uploadConcurrency: 4,
      streamBufferSize: 512 * 1024,
      ffmpegThreadsPerQuality: 1,
      maxSimultaneousQualities: 2,
      downloadBufferSize: 1 * MB,
      hlsSegmentDuration: 6,
      ffmpegPreset: 'superfast',
    }
  } else {
    return {
      tier: 'high',
      uploadConcurrency: 8,
      streamBufferSize: 4 * MB,
      ffmpegThreadsPerQuality: 4,
      maxSimultaneousQualities: 5,
      downloadBufferSize: 8 * MB,
      hlsSegmentDuration: 4,
      ffmpegPreset: 'veryfast',
    }
  }
}

/** Compute once at boot, re-use everywhere */
export const memProfile = detectMemoryProfile()

logger.info({
  event: 'memory_profile_detected',
  tier: memProfile.tier,
  totalMemMB: Math.round(os.totalmem() / MB),
  freeMemMB: Math.round(os.freemem() / MB),
  uploadConcurrency: memProfile.uploadConcurrency,
  ffmpegThreads: memProfile.ffmpegThreadsPerQuality,
  ffmpegPreset: memProfile.ffmpegPreset,
  hlsSegmentDuration: memProfile.hlsSegmentDuration,
})

// ─── Error Types ──────────────────────────────────────────────────────

/** Errors that should immediately fail the job — no BullMQ retries */
export class PermanentProcessingError extends UnrecoverableError {
  constructor(message: string) {
    super(message)
    this.name = 'PermanentProcessingError'
  }
}

// ─── Media Info ───────────────────────────────────────────────────────

export interface MediaInfo {
  duration: number
  hasAudio: boolean
}

/**
 * Extract video duration and audio presence using ffprobe.
 */
export async function probeMediaInfo(inputPath: string): Promise<MediaInfo> {
  try {
    const { stdout } = await execFileAsync(ffprobeInstaller.path, [
      '-v', 'error',
      '-show_entries', 'format=duration:stream=codec_type',
      '-of', 'json',
      inputPath,
    ], { timeout: 15000 })

    const parsed = JSON.parse(stdout) as {
      format?: { duration?: string }
      streams?: Array<{ codec_type?: string }>
    }

    const rawDuration = parsed.format?.duration ? parseFloat(parsed.format.duration) : 0
    const duration = isNaN(rawDuration) || rawDuration <= 0 ? 0 : Math.round(rawDuration)
    const hasAudio = Array.isArray(parsed.streams)
      ? parsed.streams.some((stream) => stream.codec_type === 'audio')
      : false

    return { duration, hasAudio }
  } catch (err: any) {
    logger.error({ event: 'ffprobe_failed', inputPath, error: err.message, stack: err.stack })
    return { duration: 0, hasAudio: false }
  }
}

// ─── FFmpeg Runner ────────────────────────────────────────────────────

/**
 * Run FFmpeg using Bun.spawn with timeout protection and progress logging.
 */
export async function runFfmpeg(args: string[], videoId: string, timeoutMs: number = 3600000): Promise<void> {
  const proc = Bun.spawn([ffmpegInstaller.path, ...args], {
    stdin: null,
    stdout: 'ignore',
    stderr: 'pipe',
    windowsHide: true,
  })

  const abort = new AbortController()
  const timeout = setTimeout(() => abort.abort(), timeoutMs)
  const stderrLines: string[] = []

  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      abort.signal.addEventListener('abort', () => {
        proc.kill(9)
        reject(new Error(`FFmpeg process timed out after ${timeoutMs}ms`))
      })
    })

    if (proc.stderr) {
      const pump = async () => {
        try {
          const reader = proc.stderr.getReader()
          const decoder = new TextDecoder()
          let buffer = ''
          let lastLogTime = Date.now()

          while (true) {
            const { done, value } = await reader.read()
            if (done || abort.signal.aborted) break

            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split(/[\r\n]+/)
            buffer = lines.pop() || ''

            for (const line of lines) {
              const l = line.trim()
              if (!l) continue
              stderrLines.push(l)
              if (stderrLines.length > 30) stderrLines.shift()
              if (l.startsWith('frame=') && Date.now() - lastLogTime > 5000) {
                logger.info({ event: 'ffmpeg_progress', videoId, progress: l.replace(/\s+/g, ' ') })
                lastLogTime = Date.now()
              }
            }
          }
        } catch {
          // Stream closed or aborted - ignore
        }
      }
      pump()
    }

    const exitCode = await Promise.race([proc.exited, timeoutPromise]) as number

    if (exitCode !== 0) {
      if (stderrLines.length > 0) {
        const errorLines = stderrLines.filter(l => !l.startsWith('frame='))
        if (errorLines.length > 0) {
          logger.error({
            event: 'ffmpeg_stderr_tail',
            videoId,
            exitCode,
            lastLines: errorLines.slice(-10),
          })
        }
      }
      throw new Error(`FFmpeg failed with exit code ${exitCode}`)
    }
  } finally {
    clearTimeout(timeout)
    if (!proc.killed) {
      proc.kill(9)
    }
  }
}

// ─── Output Validation ────────────────────────────────────────────────

/**
 * Validate FFmpeg output file using Bun.file (lazy — no disk read until .size).
 */
export async function validateOutput(
  filePath: string,
  videoId: string,
  minBytes: number = 1024
): Promise<number> {
  const file = Bun.file(filePath)
  const exists = await file.exists()

  if (!exists) {
    throw new PermanentProcessingError(`FFmpeg output missing: ${filePath} does not exist`)
  }

  if (file.size < minBytes) {
    throw new PermanentProcessingError(
      `FFmpeg output too small: ${filePath} is ${file.size} bytes (min: ${minBytes})`
    )
  }

  logger.info({ event: 'ffmpeg_output_validated', videoId, path: filePath, size: file.size })
  return file.size
}

// ─── HLS Helpers ──────────────────────────────────────────────────────

export function getHlsSegmentDuration(durationSec: number, renditionCount: number): number {
  if (durationSec >= 30 * 60) return 8
  if (renditionCount <= 1 && durationSec >= 2 * 60) return Math.max(memProfile.hlsSegmentDuration, 6)
  if (renditionCount >= 3) return 4
  return memProfile.hlsSegmentDuration
}