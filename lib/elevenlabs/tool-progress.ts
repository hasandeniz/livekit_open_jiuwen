export const DOCUMENT_TOOL_NAME = 'build-and-run';

export type ToolProgressState = {
  pending: Record<string, number>;
  completed: string[];
};

export const initialToolProgress: ToolProgressState = { pending: {}, completed: [] };

export function toolProgressReducer(
  state: ToolProgressState,
  event:
    | { type: 'start'; id: string; at: number }
    | { type: 'finish'; id: string }
    | { type: 'reset' }
): ToolProgressState {
  if (event.type === 'reset') return initialToolProgress;
  if (state.completed.includes(event.id)) return state;
  if (event.type === 'start') {
    if (Object.hasOwn(state.pending, event.id)) return state;
    return { ...state, pending: { ...state.pending, [event.id]: event.at } };
  }
  const pending = { ...state.pending };
  delete pending[event.id];
  return { pending, completed: [...state.completed, event.id] };
}
