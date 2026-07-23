import { useEffect, useState } from 'react';
import { Delete, X, Space, RotateCcw, Check } from 'lucide-react';

interface VirtualKeyboardProps {
  value: string;
  onChange: (val: string) => void;
  onClose: () => void;
  isOpen: boolean;
}

const KEYBOARD_ROWS = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', '-'],
  ['Z', 'X', 'C', 'V', 'B', 'N', 'M', '_', '.', '@'],
  ['SPACE', 'BACKSPACE', 'CLEAR', 'DONE']
];

export function VirtualKeyboard({ value, onChange, onClose, isOpen }: VirtualKeyboardProps) {
  const [activeRow, setActiveRow] = useState(1); // Default to Q row
  const [activeCol, setActiveCol] = useState(0); // Default to first letter
  const [isShiftActive, setIsShiftActive] = useState(false); // Can support toggle case if needed

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Prevent default browser scrolling with arrow keys inside the keyboard
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'Escape'].includes(e.key)) {
        e.preventDefault();
      }

      if (e.key === 'Escape') {
        onClose();
        return;
      }

      const numRows = KEYBOARD_ROWS.length;

      if (e.key === 'ArrowUp') {
        setActiveRow((prevRow) => {
          const nextRow = (prevRow - 1 + numRows) % numRows;
          const maxCol = KEYBOARD_ROWS[nextRow].length - 1;
          setActiveCol((prevCol) => Math.min(prevCol, maxCol));
          return nextRow;
        });
      } else if (e.key === 'ArrowDown') {
        setActiveRow((prevRow) => {
          const nextRow = (prevRow + 1) % numRows;
          const maxCol = KEYBOARD_ROWS[nextRow].length - 1;
          setActiveCol((prevCol) => Math.min(prevCol, maxCol));
          return nextRow;
        });
      } else if (e.key === 'ArrowLeft') {
        setActiveCol((prevCol) => {
          const rowLength = KEYBOARD_ROWS[activeRow].length;
          return (prevCol - 1 + rowLength) % rowLength;
        });
      } else if (e.key === 'ArrowRight') {
        setActiveCol((prevCol) => {
          const rowLength = KEYBOARD_ROWS[activeRow].length;
          return (prevCol + 1) % rowLength;
        });
      } else if (e.key === 'Enter') {
        const key = KEYBOARD_ROWS[activeRow][activeCol];
        handleKeyPress(key);
      } else if (e.key === 'Backspace') {
        handleKeyPress('BACKSPACE');
      } else if (e.key.length === 1) {
        // Direct physical keyboard fallback typing
        const typedChar = e.key;
        if (typedChar === ' ') {
          onChange(value + ' ');
        } else {
          onChange(value + typedChar);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, activeRow, activeCol, value, onChange, onClose]);

  if (!isOpen) return null;

  const handleKeyPress = (key: string) => {
    // Add custom visual press indication or audio tick here if desired
    if (key === 'SPACE') {
      onChange(value + ' ');
    } else if (key === 'BACKSPACE') {
      onChange(value.slice(0, -1));
    } else if (key === 'CLEAR') {
      onChange('');
    } else if (key === 'DONE') {
      onClose();
    } else {
      onChange(value + (isShiftActive ? key.toUpperCase() : key.toLowerCase()));
    }
  };

  const getButtonWidthClass = (key: string) => {
    switch (key) {
      case 'SPACE':
        return 'flex-1 col-span-3';
      case 'BACKSPACE':
        return 'flex-1 col-span-3';
      case 'CLEAR':
        return 'flex-1 col-span-2';
      case 'DONE':
        return 'flex-1 col-span-2';
      default:
        return 'aspect-square w-full';
    }
  };

  const renderKeyIcon = (key: string) => {
    switch (key) {
      case 'SPACE':
        return (
          <span className="flex items-center gap-2 font-medium tracking-wide">
            <Space className="w-4 h-4" /> SPACE
          </span>
        );
      case 'BACKSPACE':
        return (
          <span className="flex items-center gap-2 font-medium tracking-wide text-amber-500">
            <Delete className="w-4 h-4" /> BACK
          </span>
        );
      case 'CLEAR':
        return (
          <span className="flex items-center gap-2 font-medium tracking-wide text-rose-500">
            <RotateCcw className="w-4 h-4" /> CLEAR
          </span>
        );
      case 'DONE':
        return (
          <span className="flex items-center gap-2 font-semibold tracking-wide text-emerald-400">
            <Check className="w-4 h-4" /> DONE
          </span>
        );
      default:
        return <span className="font-bold text-lg">{key}</span>;
    }
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 bg-slate-950/95 backdrop-blur-xl border-t border-white/15 shadow-[0_-15px_40px_rgba(0,0,0,0.8)] p-3 sm:p-4 flex flex-col items-center justify-center animate-slide-up">
      <div className="w-full max-w-4xl flex flex-col gap-2.5">
        {/* Header bar with live query preview and controls */}
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2 text-xs font-semibold text-white/80">
            <span className="text-indigo-400 font-bold">🔍</span>
            <span className="truncate max-w-md">
              {value ? <span className="text-white font-bold">"{value}"</span> : <span className="text-white/40 italic">Type to search live results...</span>}
            </span>
          </div>
          <div className="flex items-center gap-3">
            {value && (
              <button 
                onClick={() => onChange('')} 
                className="text-[11px] text-rose-400 hover:text-rose-300 font-bold uppercase tracking-wider px-2.5 py-0.5 bg-white/5 rounded border border-white/10 transition-colors"
              >
                Clear
              </button>
            )}
            <button 
              onClick={onClose}
              className="p-1.5 bg-white/5 hover:bg-white/10 rounded-full text-white/70 hover:text-white transition-all border border-white/10 flex items-center justify-center cursor-pointer"
              title="Close Keyboard"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Keyboard Layout Grid */}
        <div className="flex flex-col gap-2">
          {KEYBOARD_ROWS.map((row, rIndex) => {
            const isSpecialRow = rIndex === 4;
            return (
              <div 
                key={rIndex} 
                className={`grid gap-2 ${isSpecialRow ? 'grid-cols-10' : 'grid-cols-10'}`}
              >
                {row.map((key, cIndex) => {
                  const isSelected = activeRow === rIndex && activeCol === cIndex;
                  const buttonWidthClass = getButtonWidthClass(key);

                  return (
                    <button
                      key={key}
                      onClick={() => {
                        setActiveRow(rIndex);
                        setActiveCol(cIndex);
                        handleKeyPress(key);
                      }}
                      className={`
                        ${buttonWidthClass}
                        h-9 sm:h-10 flex items-center justify-center rounded-lg transition-all duration-150 text-xs sm:text-sm
                        ${isSelected 
                          ? 'bg-indigo-600 text-white scale-105 shadow-md ring-2 ring-indigo-400/50 z-10 border-transparent font-extrabold' 
                          : 'bg-white/5 hover:bg-white/10 text-white border border-white/5'
                        }
                        active:scale-95 select-none cursor-pointer
                      `}
                    >
                      {renderKeyIcon(key)}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* Navigation Tips */}
        <div className="flex justify-between items-center text-white/50 text-[11px] px-1 select-none pt-0.5">
          <div className="flex items-center gap-1.5">
            <span className="bg-white/10 px-1.5 py-0.5 rounded text-[9px] font-mono border border-white/15">▲ ▼ ◄ ►</span>
            <span>Navigate</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="bg-white/10 px-1.5 py-0.5 rounded text-[9px] font-mono border border-white/15">ENTER</span>
            <span>Type Key</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="bg-white/10 px-1.5 py-0.5 rounded text-[9px] font-mono border border-white/15">ESC</span>
            <span>Hide Keyboard</span>
          </div>
        </div>
      </div>
    </div>
  );
}
