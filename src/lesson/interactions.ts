export type LessonUiInteraction =
  | { kind: 'choice'; value: string }
  | { kind: 'action'; value: string }
  | { kind: 'restart' }
  | null

export interface LessonPointerState {
  stagePointerDown: boolean
  stagePointerDownX: number
  stagePointerDownY: number
  stageDragged: boolean
}

export function createLessonPointerState(): LessonPointerState {
  return {
    stagePointerDown: false,
    stagePointerDownX: 0,
    stagePointerDownY: 0,
    stageDragged: false,
  }
}

export function resolveLessonUiInteraction(target: HTMLElement | null): LessonUiInteraction {
  if (!target) return null

  const choiceBtn = target.closest<HTMLElement>('[data-choice]')
  if (choiceBtn) {
    return { kind: 'choice', value: choiceBtn.dataset.choice || '' }
  }

  const actionBtn = target.closest<HTMLElement>('[data-action]')
  if (actionBtn) {
    return { kind: 'action', value: actionBtn.dataset.action || '' }
  }

  const uiBtn = target.closest<HTMLElement>('[data-ui]')
  if (uiBtn?.dataset.ui === 'restart') {
    return { kind: 'restart' }
  }

  return null
}

export function startLessonPointer(
  state: LessonPointerState,
  event: PointerEvent,
): void {
  state.stagePointerDown = true
  state.stagePointerDownX = event.clientX
  state.stagePointerDownY = event.clientY
  state.stageDragged = false
}

export function endLessonPointer(state: LessonPointerState): void {
  state.stagePointerDown = false
}
