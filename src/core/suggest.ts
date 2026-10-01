/**
 * Icon and color suggestions from a title (PLAN.md T16): first the user's own history (the most
 * recent task with the same title), then a keyword map. A plain lookup, not AI.
 */

import type { TaskColor, Task } from './tasks.ts'

export interface StyleSuggestion {
  icon: string | null
  color: TaskColor | null
}

/** Keyword → icon (from TASK_ICON_NAMES) and color. The first word of the title that matches
 *  wins, so "Call about the gym" is a call. */
const RULES: readonly { words: readonly string[]; icon: string; color: TaskColor }[] = [
  {
    words: ['gym', 'workout', 'lift', 'weights', 'training', 'exercise', 'crossfit'],
    icon: 'dumbbell',
    color: 'orange',
  },
  {
    words: ['run', 'running', 'jog', 'jogging', 'walk', 'walking', 'hike', 'steps'],
    icon: 'footprints',
    color: 'green',
  },
  { words: ['bike', 'cycle', 'cycling', 'ride', 'spin'], icon: 'bike', color: 'green' },
  {
    words: ['yoga', 'stretch', 'stretching', 'meditate', 'meditation', 'breathe', 'pilates'],
    icon: 'leaf',
    color: 'teal',
  },
  { words: ['call', 'phone', 'ring', 'dial'], icon: 'phone', color: 'blue' },
  { words: ['email', 'emails', 'mail', 'reply', 'newsletter'], icon: 'mail', color: 'blue' },
  {
    words: ['chat', 'message', 'messages', 'text', 'slack', 'whatsapp'],
    icon: 'message-circle',
    color: 'blue',
  },
  {
    words: ['meeting', 'meet', 'standup', 'sync', '1:1', 'interview', 'catchup', 'retro'],
    icon: 'users',
    color: 'purple',
  },
  { words: ['zoom', 'video', 'webinar', 'teams'], icon: 'video', color: 'purple' },
  {
    words: ['present', 'presentation', 'demo', 'slides', 'pitch', 'talk'],
    icon: 'presentation',
    color: 'indigo',
  },
  {
    words: [
      'code',
      'coding',
      'dev',
      'develop',
      'program',
      'programming',
      'debug',
      'deploy',
      'refactor',
      'bug',
      'pr',
    ],
    icon: 'code',
    color: 'indigo',
  },
  {
    words: ['work', 'office', 'project', 'client', 'admin', 'report'],
    icon: 'briefcase',
    color: 'gray',
  },
  { words: ['read', 'reading', 'book', 'books', 'article'], icon: 'book-open', color: 'yellow' },
  {
    words: [
      'study',
      'learn',
      'learning',
      'course',
      'class',
      'lecture',
      'exam',
      'homework',
      'revise',
    ],
    icon: 'graduation-cap',
    color: 'yellow',
  },
  {
    words: ['write', 'writing', 'journal', 'blog', 'essay', 'draft', 'notes'],
    icon: 'pen-line',
    color: 'yellow',
  },
  {
    words: ['think', 'plan', 'planning', 'brainstorm', 'focus', 'deep', 'research'],
    icon: 'brain',
    color: 'indigo',
  },
  { words: ['goal', 'goals', 'okr', 'review', 'retrospective'], icon: 'target', color: 'coral' },
  {
    words: ['breakfast', 'lunch', 'dinner', 'eat', 'meal', 'cook', 'cooking', 'snack', 'brunch'],
    icon: 'utensils',
    color: 'orange',
  },
  { words: ['coffee', 'tea', 'break'], icon: 'coffee', color: 'orange' },
  { words: ['sleep', 'nap', 'bed', 'bedtime'], icon: 'bed', color: 'indigo' },
  { words: ['wake', 'morning', 'rise', 'sunrise'], icon: 'sunrise', color: 'orange' },
  { words: ['evening', 'night', 'wind', 'sunset'], icon: 'moon', color: 'indigo' },
  { words: ['shower', 'bath', 'skincare'], icon: 'shower-head', color: 'teal' },
  { words: ['laundry', 'clothes', 'dress', 'iron', 'ironing'], icon: 'shirt', color: 'pink' },
  {
    words: ['shop', 'shopping', 'groceries', 'grocery', 'buy', 'store', 'supermarket'],
    icon: 'shopping-cart',
    color: 'green',
  },
  {
    words: ['pay', 'bill', 'bills', 'bank', 'budget', 'tax', 'taxes', 'invoice', 'money', 'rent'],
    icon: 'wallet',
    color: 'green',
  },
  {
    words: ['clean', 'cleaning', 'chores', 'tidy', 'vacuum', 'dishes', 'home', 'house'],
    icon: 'house',
    color: 'teal',
  },
  { words: ['drive', 'car', 'commute', 'parking', 'fuel'], icon: 'car', color: 'gray' },
  {
    words: ['flight', 'fly', 'airport', 'travel', 'trip', 'pack', 'packing'],
    icon: 'plane',
    color: 'blue',
  },
  { words: ['dog', 'pet', 'cat', 'vet'], icon: 'dog', color: 'orange' },
  {
    words: ['doctor', 'dentist', 'medicine', 'pill', 'pills', 'meds', 'therapy', 'clinic'],
    icon: 'pill',
    color: 'pink',
  },
  { words: ['water', 'drink', 'hydrate'], icon: 'droplets', color: 'blue' },
  {
    words: ['music', 'guitar', 'piano', 'practice', 'sing', 'singing', 'song'],
    icon: 'music',
    color: 'purple',
  },
  {
    words: ['draw', 'drawing', 'paint', 'painting', 'art', 'design', 'sketch'],
    icon: 'palette',
    color: 'pink',
  },
  { words: ['game', 'games', 'gaming', 'play'], icon: 'gamepad-2', color: 'purple' },
  { words: ['gift', 'gifts', 'birthday', 'party', 'anniversary'], icon: 'gift', color: 'pink' },
  {
    words: ['family', 'friend', 'friends', 'date', 'mom', 'dad', 'kids'],
    icon: 'heart',
    color: 'coral',
  },
]

const byWord = new Map<string, { icon: string; color: TaskColor }>()
for (const rule of RULES) {
  for (const word of rule.words) if (!byWord.has(word)) byWord.set(word, rule)
}

function words(title: string): string[] {
  return title.toLowerCase().match(/[a-z0-9:]+/g) ?? []
}

/** The style the title suggests from the keyword map alone. */
export function keywordStyle(title: string): StyleSuggestion {
  for (const word of words(title)) {
    const hit = byWord.get(word) ?? byWord.get(word.replace(/s$/, ''))
    if (hit) return { icon: hit.icon, color: hit.color }
  }
  return { icon: null, color: null }
}

/**
 * The suggested icon and color: the user's latest task with the same title (case and spacing
 * ignored) wins; otherwise the keyword map.
 */
export function suggestStyle(
  title: string,
  history: readonly Pick<Task, 'title' | 'icon' | 'color' | 'updatedAt'>[] = [],
): StyleSuggestion {
  const key = words(title).join(' ')
  if (key === '') return { icon: null, color: null }
  const same = history
    .filter((t) => words(t.title).join(' ') === key)
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))[0]
  if (same) return { icon: same.icon, color: same.color }
  return keywordStyle(title)
}
