import { useState, useCallback } from 'react'
import type { DragStartEvent, DragOverEvent, DragEndEvent } from '@dnd-kit/core'
import { arrayMove } from '@dnd-kit/sortable'
import { useQueryClient } from '@tanstack/react-query'
import { moveTaskApi, bulkUpdatePositionsApi } from '@/api/endpoints/tasks'
import type { Task, TaskStatus } from '@/types'

interface UseBoardDndProps {
  slug: string
  projectId: string
  statuses: TaskStatus[]
  groupedTasks: Map<string, Task[]>
  queryKey: unknown[]
}

export function useBoardDnd({
  statuses,
  groupedTasks,
  queryKey,
}: UseBoardDndProps) {
  const queryClient = useQueryClient()
  const [activeTask, setActiveTask] = useState<Task | null>(null)

  const statusIds = statuses.map((s) => s.id)

  const onDragStart = useCallback(
    ({ active }: DragStartEvent) => {
      const task = statuses
        .flatMap((s) => groupedTasks.get(s.id) ?? [])
        .find((t) => t.id === active.id)
      setActiveTask(task ?? null)
    },
    [statuses, groupedTasks]
  )

  const onDragOver = useCallback((_: DragOverEvent) => {}, [])

  const onDragEnd = useCallback(
    async ({ active, over }: DragEndEvent) => {
      setActiveTask(null)
      if (!over) return

      const activeId = String(active.id)
      const overId = String(over.id)

      // Find source column
      let sourceStatusId: string | null = null
      for (const status of statuses) {
        const col = groupedTasks.get(status.id) ?? []
        if (col.some((t) => t.id === activeId)) {
          sourceStatusId = status.id
          break
        }
      }
      if (!sourceStatusId) return

      // Determine destination status
      let destStatusId: string
      if (statusIds.includes(overId)) {
        destStatusId = overId
      } else {
        destStatusId = sourceStatusId
        for (const status of statuses) {
          const col = groupedTasks.get(status.id) ?? []
          if (col.some((t) => t.id === overId)) {
            destStatusId = status.id
            break
          }
        }
      }

      const sourceCol = [...(groupedTasks.get(sourceStatusId) ?? [])]
      const destCol =
        destStatusId === sourceStatusId
          ? sourceCol
          : [...(groupedTasks.get(destStatusId) ?? [])]

      const activeIndex = sourceCol.findIndex((t) => t.id === activeId)
      const overIndex = statusIds.includes(overId)
        ? destCol.length
        : destCol.findIndex((t) => t.id === overId)

      // Optimistic update
      queryClient.setQueryData<{ tasks: Task[]; total: number }>(
        queryKey,
        (old) => {
          if (!old) return old
          const tasks = [...old.tasks]

          if (destStatusId === sourceStatusId) {
            const colTasks = tasks
              .filter((t) => t.status_id === sourceStatusId)
              .sort((a, b) => a.position - b.position)
            const reordered = arrayMove(colTasks, activeIndex, overIndex)
            const updated = reordered.map((t, i) => ({ ...t, position: i }))
            return {
              ...old,
              tasks: tasks.map((t) => updated.find((u) => u.id === t.id) ?? t),
            }
          } else {
            return {
              ...old,
              tasks: tasks.map((t) =>
                t.id === activeId
                  ? { ...t, status_id: destStatusId, position: overIndex }
                  : t
              ),
            }
          }
        }
      )

      // API sync
      try {
        if (destStatusId !== sourceStatusId) {
          await moveTaskApi(activeId, {
            status_id: destStatusId,
            position: overIndex,
          })
        } else {
          const reordered = arrayMove(sourceCol, activeIndex, overIndex)
          await bulkUpdatePositionsApi(
            reordered.map((t, i) => ({ task_id: t.id, position: i }))
          )
        }
      } catch {
        queryClient.invalidateQueries({ queryKey })
      }
    },
    [statuses, groupedTasks, statusIds, queryClient, queryKey]
  )

  return { activeTask, onDragStart, onDragOver, onDragEnd }
}