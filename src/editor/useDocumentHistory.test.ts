import { describe, expect, it } from 'vitest'
import { createInitialDocument, createTextElement } from '../model/presentation'
import {
  documentHistoryReducer,
  type DocumentHistory,
} from './useDocumentHistory'

describe('documentHistoryReducer', () => {
  it('undoes, redoes, clears redo after editing, and limits history', () => {
    const initial = createInitialDocument()
    let history: DocumentHistory = { past: [], present: initial, future: [] }
    history = documentHistoryReducer(history, {
      type: 'commit',
      action: {
        type: 'element/add',
        slideId: 'slide-1',
        element: createTextElement('text-1'),
      },
    })
    const withText = history.present
    history = documentHistoryReducer(history, { type: 'undo' })
    expect(history.present).toBe(initial)
    history = documentHistoryReducer(history, { type: 'redo' })
    expect(history.present).toBe(withText)
    history = documentHistoryReducer(history, { type: 'undo' })
    history = documentHistoryReducer(history, {
      type: 'commit',
      action: {
        type: 'element/add',
        slideId: 'slide-1',
        element: createTextElement('text-2'),
      },
    })
    expect(history.future).toHaveLength(0)

    for (let index = 0; index < 55; index += 1) {
      history = documentHistoryReducer(history, {
        type: 'commit',
        action: {
          type: 'element/set-text',
          slideId: 'slide-1',
          elementId: 'text-2',
          text: `edit-${index}`,
        },
      })
    }
    expect(history.past).toHaveLength(50)
  })
})
