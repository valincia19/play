import { loadConfig, getConfig, type AppConfig } from './env'

export type { AppConfig }

export interface ApiRuntimeConfig {
  frontendUrl: string
  port: number
}

export interface WorkerRuntimeConfig {
  heartbeatTtlSec: number
}

export function loadApiRuntimeConfig(): ApiRuntimeConfig {
  const config = loadConfig()

  return {
    frontendUrl: config.frontendUrl,
    port: config.port,
  }
}

export function loadWorkerRuntimeConfig(): WorkerRuntimeConfig {
  loadConfig() // Validates all required env vars
  
  return {
    heartbeatTtlSec: 30,
  }
}
