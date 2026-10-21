import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Smoothly animates streamed text by draining an internal queue via
 * requestAnimationFrame, giving a typewriter-style rendering effect
 * instead of chunky batch updates.
 */
export function useStreamingText() {
  const queueRef = useRef('')
  const [displayText, setDisplayText] = useState('')
  const rafRef = useRef<number | undefined>(undefined)

  useEffect(() => {
    const drain = () => {
      if (queueRef.current.length > 0) {
        // Smooth linear scale: 1 char/frame at idle → up to 4 chars/frame if very far behind.
        // No step-function jumps. At 60fps: 60–240 chars/sec range.
        const take = Math.min(4, 1 + Math.floor(queueRef.current.length / 100))
        const batch = queueRef.current.slice(0, take)
        queueRef.current = queueRef.current.slice(take)
        setDisplayText(prev => prev + batch)
      }
      rafRef.current = requestAnimationFrame(drain)
    }
    rafRef.current = requestAnimationFrame(drain)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [])

  const appendText = useCallback((delta: string) => {
    queueRef.current += delta
  }, [])

  const reset = useCallback(() => {
    queueRef.current = ''
    setDisplayText('')
  }, [])

  return { displayText, appendText, reset }
}
