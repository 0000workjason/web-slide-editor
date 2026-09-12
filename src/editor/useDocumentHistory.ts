import { useCallback, useReducer } from 'react'
import { createInitialDocument, type PresentationDocument } from '../model/presentation'
import {
  presentationReducer,
  type PresentationAction,
} from './presentationReducer'

const HISTORY_LIMIT = 50

export interface DocumentHistory {
  past: PresentationDocument[]
  present: PresentationDocument
  future: PresentationDocument[]
}

export type DocumentHistoryAction =
  | { type: 'commit'; action: PresentationAction }
  | { type: 'replace'; document: PresentationDocument }
  | { type: 'undo' }
  | { type: 'redo' }

export function documentHistoryReducer(
  history: DocumentHistory,
  action: DocumentHistoryAction,
): DocumentHistory {
  if (action.type === 'replace') {
    return { past: [], present: action.document, future: [] }
  }

  if (action.type === 'undo') {
    const previous = history.past.at(-1)
    if (!previous) return history
    return {
      past: history.past.slice(0, -1),
      present: previous,
      future: [history.present, ...history.future],
    }
  }

  if (action.type === 'redo') {
    const next = history.future[0]
    if (!next) return history
    return {
      past: [...history.past, history.present].slice(-HISTORY_LIMIT),
      present: next,
      future: history.future.slice(1),
    }
  }

  const next = presentationReducer(history.present, action.action)
  if (next === history.present) return history
  return {
    past: [...history.past, history.present].slice(-HISTORY_LIMIT),
    present: next,
    future: [],
  }
}

export function useDocumentHistory() {
  const [history, dispatch] = useReducer(
    documentHistoryReducer,
    undefined,
    () => ({ past: [], present: createInitialDocument(), future: [] }),
  )

  return {
    document: history.present,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    commit: useCallback(
      (action: PresentationAction) => dispatch({ type: 'commit', action }),
      [],
    ),
    replace: useCallback(
      (document: PresentationDocument) => dispatch({ type: 'replace', document }),
      [],
    ),
    undo: useCallback(() => dispatch({ type: 'undo' }), []),
    redo: useCallback(() => dispatch({ type: 'redo' }), []),
  }
}
