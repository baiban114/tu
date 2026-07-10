export interface ApiEnvelope<T> {
  code: number
  message: string
  data: T
}

export interface LearningHealthDto {
  status: string
  service: string
}

const LEARNING_API_BASE = '/api/learning'

export async function fetchLearningHealth(): Promise<LearningHealthDto> {
  const response = await fetch(`${LEARNING_API_BASE}/health`)
  if (!response.ok) {
    throw new Error(`health check failed: ${response.status}`)
  }
  const body = await response.json() as ApiEnvelope<LearningHealthDto>
  return body.data
}
