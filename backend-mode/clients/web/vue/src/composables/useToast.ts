import { ref } from 'vue'

export type ToastKind = 'error' | 'warning'

export interface ToastMessage {
  id: number
  kind: ToastKind
  text: string
}

const AUTO_DISMISS_MS = 5000

// Module-level state so any component can raise a notice without threading a
// callback down the tree.
const messages = ref<ToastMessage[]>([])
let nextId = 0

export function pushToast(text: string, kind: ToastKind = 'error') {
  if (!text) return
  // The SDK can report the same error repeatedly; one notice is enough.
  if (messages.value.some(m => m.text === text)) return

  const id = nextId++
  messages.value = [...messages.value, { id, kind, text }]
  setTimeout(() => dismissToast(id), AUTO_DISMISS_MS)
}

export function dismissToast(id: number) {
  messages.value = messages.value.filter(m => m.id !== id)
}

export function useToast() {
  return { messages, push: pushToast, dismiss: dismissToast }
}
