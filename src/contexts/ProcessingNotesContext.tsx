import { createContext, useContext, useState, ReactNode } from 'react';

interface ProcessingNotesContextType {
  processingNotes: Set<string>;
  processingStartTimes: Map<string, number>;
  addProcessingNote: (noteId: string) => void;
  removeProcessingNote: (noteId: string) => void;
  processingCount: number;
}

const ProcessingNotesContext = createContext<ProcessingNotesContextType | undefined>(undefined);

export const ProcessingNotesProvider = ({ children }: { children: ReactNode }) => {
  const [processingNotes, setProcessingNotes] = useState<Set<string>>(new Set());
  const [processingStartTimes, setProcessingStartTimes] = useState<Map<string, number>>(new Map());

  const addProcessingNote = (noteId: string) => {
    setProcessingNotes(prev => new Set(prev).add(noteId));
    
    setProcessingStartTimes(prev => {
      const newMap = new Map(prev);
      if (!newMap.has(noteId)) {
        newMap.set(noteId, Date.now());
      }
      return newMap;
    });
  };

  const removeProcessingNote = (noteId: string) => {
    setProcessingNotes(prev => {
      const newSet = new Set(prev);
      newSet.delete(noteId);
      return newSet;
    });
    
    setProcessingStartTimes(prev => {
      const newMap = new Map(prev);
      newMap.delete(noteId);
      return newMap;
    });
  };

  return (
    <ProcessingNotesContext.Provider value={{
      processingNotes,
      processingStartTimes,
      addProcessingNote,
      removeProcessingNote,
      processingCount: processingNotes.size
    }}>
      {children}
    </ProcessingNotesContext.Provider>
  );
};

export const useProcessingNotes = () => {
  const context = useContext(ProcessingNotesContext);
  if (!context) {
    throw new Error('useProcessingNotes must be used within ProcessingNotesProvider');
  }
  return context;
};
