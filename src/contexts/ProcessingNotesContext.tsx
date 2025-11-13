import { createContext, useContext, useState, ReactNode } from 'react';

interface ProcessingNotesContextType {
  processingNotes: Set<string>;
  addProcessingNote: (noteId: string) => void;
  removeProcessingNote: (noteId: string) => void;
  processingCount: number;
}

const ProcessingNotesContext = createContext<ProcessingNotesContextType | undefined>(undefined);

export const ProcessingNotesProvider = ({ children }: { children: ReactNode }) => {
  const [processingNotes, setProcessingNotes] = useState<Set<string>>(new Set());

  const addProcessingNote = (noteId: string) => {
    setProcessingNotes(prev => new Set(prev).add(noteId));
  };

  const removeProcessingNote = (noteId: string) => {
    setProcessingNotes(prev => {
      const newSet = new Set(prev);
      newSet.delete(noteId);
      return newSet;
    });
  };

  return (
    <ProcessingNotesContext.Provider value={{
      processingNotes,
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
