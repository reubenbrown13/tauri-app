/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useRef } from "react"

export const useDebounce = <T extends (...args: any[]) => void>(cb: T, delay: number = 500) => {
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(null)

  return useCallback(
    (...args: Parameters<T>) => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      timeoutRef.current = setTimeout(() => cb(...args), delay)
    },
    [cb, delay]
  )
}