"use client";

import { useMemo, useState } from "react";
import {
  DndContext,
  DragEndEvent,
  DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import PlayerAvatar from "@/components/PlayerAvatar";
import type { Player } from "@/lib/types";

type Props = {
  ranking: string[];
  onChange: (ranking: string[]) => void;
  players: Player[];
  avatarUrls: Record<string, string>;
  disabled?: boolean;
};

function SortablePlayer({
  id,
  position,
  name,
  photoUrl,
  disabled,
}: {
  id: string;
  position: number;
  name: string;
  photoUrl?: string;
  disabled: boolean;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id, disabled });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, position: "relative", zIndex: isDragging ? 20 : undefined }}
      className={`flex min-w-0 items-center gap-2 rounded-2xl bg-white px-3 py-3 shadow-md dark:bg-slate-800 sm:gap-3 sm:px-4 ${isDragging ? "ring-2 ring-violet-400 shadow-xl" : ""}`}
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-r from-sky-400 to-blue-500 text-base font-black text-white sm:h-10 sm:w-10">
        {position}
      </div>
      <div className="shrink-0"><PlayerAvatar name={name} src={photoUrl} size="sm" /></div>
      <p className="min-w-0 flex-1 break-words text-left text-base font-black leading-tight text-slate-800 dark:text-slate-100 sm:text-lg">
        {name}
      </p>
      <button
        ref={setActivatorNodeRef}
        type="button"
        disabled={disabled}
        aria-label={`Drag to reorder ${name}, currently rank ${position}. Use Space and arrow keys with a keyboard.`}
        title={`Move ${name}`}
        {...attributes}
        {...listeners}
        className="flex h-11 w-10 shrink-0 touch-none items-center justify-center rounded-xl bg-sky-100 text-sky-700 outline-offset-2 focus-visible:outline-2 focus-visible:outline-violet-500 disabled:opacity-40 dark:bg-slate-700 dark:text-sky-300"
      >
        <GripVertical className="h-6 w-6" />
      </button>
    </div>
  );
}

export default function DraggablePlayerRanking({ ranking, onChange, players, avatarUrls, disabled = false }: Props) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const playerNames = useMemo(() => new Map(players.map(player => [player.id, player.name])), [players]);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function onDragEnd(event: DragEndEvent) {
    setActiveId(null);
    if (disabled || !event.over || event.active.id === event.over.id) return;
    const oldIndex = ranking.indexOf(String(event.active.id));
    const newIndex = ranking.indexOf(String(event.over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    onChange(arrayMove(ranking, oldIndex, newIndex));
  }

  return (
    <div>
      <p className="mb-3 text-sm font-semibold text-slate-500 dark:text-slate-400">Hold the handle and drag to reorder players.</p>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={(event: DragStartEvent) => setActiveId(String(event.active.id))}
        onDragCancel={() => setActiveId(null)}
        onDragEnd={onDragEnd}
      >
        <SortableContext items={ranking} strategy={verticalListSortingStrategy}>
          <div className="space-y-3">
            {ranking.map((id, index) => (
              <SortablePlayer
                key={id}
                id={id}
                position={index + 1}
                name={playerNames.get(id) || "Player"}
                photoUrl={avatarUrls[id]}
                disabled={disabled}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
