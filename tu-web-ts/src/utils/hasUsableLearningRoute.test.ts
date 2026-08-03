import { describe, expect, it } from 'vitest'
import { hasUsableLearningRoute } from './hasUsableLearningRoute'

describe('hasUsableLearningRoute', () => {
  it('treats multi-node snapshot as usable chain', () => {
    expect(hasUsableLearningRoute(3, ['kp-1'])).toBe(true)
  })

  it('treats lone seed without prerequisites as insufficient', () => {
    expect(hasUsableLearningRoute(1, ['kp-1'])).toBe(false)
    expect(hasUsableLearningRoute(0, [])).toBe(false)
  })
})
