'use client';

import { useEffect, useState } from 'react';
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from '@hello-pangea/dnd';
import type { Question, QuestionOption } from '@/lib/types';

interface Props {
  question: Question;
  currentOrder?: string[];
  onReorder: (order: string[]) => void;
}

export default function DragAndDrop({ question, currentOrder, onReorder }: Props) {
  const [items, setItems] = useState<QuestionOption[]>([]);

  useEffect(() => {
    if (currentOrder && currentOrder.length > 0) {
      const ordered = currentOrder
        .map(id => question.options.find(o => o.id === id))
        .filter(Boolean) as QuestionOption[];
      setItems(ordered);
    } else {
      // Shuffle on first render
      setItems([...question.options].sort(() => Math.random() - 0.5));
    }
  }, [question.options, currentOrder]);

  const onDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const reordered = Array.from(items);
    const [moved] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, moved);
    setItems(reordered);
    onReorder(reordered.map(i => i.id));
  };

  return (
    <div>
      <p className="text-xs mb-3 text-center" style={{ color: 'rgba(255,255,255,0.4)' }}>
        ↕ Glisse les éléments pour les ordonner
      </p>
      <DragDropContext onDragEnd={onDragEnd}>
        <Droppable droppableId="dnd-list">
          {(provided, snapshot) => (
            <div
              ref={provided.innerRef}
              {...provided.droppableProps}
              className="space-y-2"
              style={{
                background: snapshot.isDraggingOver
                  ? 'rgba(33,158,188,0.05)'
                  : 'transparent',
                borderRadius: '0.75rem',
                transition: 'background 0.2s',
                padding: '4px',
              }}
            >
              {items.map((item, index) => (
                <Draggable key={item.id} draggableId={item.id} index={index}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.draggableProps}
                      {...provided.dragHandleProps}
                      className="flex items-center gap-3 p-3.5 rounded-xl select-none"
                      style={{
                        ...provided.draggableProps.style,
                        background: snapshot.isDragging
                          ? 'rgba(33,158,188,0.25)'
                          : 'rgba(255,255,255,0.06)',
                        border: snapshot.isDragging
                          ? '1.5px solid rgba(33,158,188,0.6)'
                          : '1.5px solid rgba(255,255,255,0.08)',
                        boxShadow: snapshot.isDragging
                          ? '0 8px 30px rgba(33,158,188,0.2)'
                          : 'none',
                        cursor: snapshot.isDragging ? 'grabbing' : 'grab',
                        zIndex: snapshot.isDragging ? 100 : 1,
                        transition: 'background 0.15s, border 0.15s',
                      }}
                    >
                      {/* Drag handle icon */}
                      <div className="flex flex-col gap-0.5 flex-shrink-0">
                        {[0, 1, 2].map(i => (
                          <div
                            key={i}
                            className="flex gap-0.5"
                          >
                            {[0, 1].map(j => (
                              <div
                                key={j}
                                className="w-1 h-1 rounded-full"
                                style={{ background: 'rgba(255,255,255,0.25)' }}
                              />
                            ))}
                          </div>
                        ))}
                      </div>

                      {/* Order badge */}
                      <div
                        className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                        style={{
                          background: snapshot.isDragging
                            ? 'rgba(33,158,188,0.4)'
                            : 'rgba(255,255,255,0.1)',
                          color: snapshot.isDragging ? '#219EBC' : 'rgba(255,255,255,0.5)',
                        }}
                      >
                        {index + 1}
                      </div>

                      <span
                        className="text-sm font-medium flex-1"
                        style={{ color: snapshot.isDragging ? 'white' : 'rgba(255,255,255,0.8)' }}
                      >
                        {item.label}
                      </span>
                    </div>
                  )}
                </Draggable>
              ))}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>
    </div>
  );
}
