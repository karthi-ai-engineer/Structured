import { useEditor } from '@/features/editor/editorContext'
import { InboxList } from '@/features/inbox/InboxList'
import { Fab } from '@/features/shell/Fab'

export function InboxView() {
  const editor = useEditor()
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 pt-4 pb-28 lg:pb-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Inbox</h1>
        <p className="text-sm text-muted-foreground">Tasks without a date.</p>
      </header>
      <InboxList />
      <Fab label="New inbox task" onClick={() => editor.openCreate({ date: null })} />
    </div>
  )
}
