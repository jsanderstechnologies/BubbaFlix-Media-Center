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
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex flex-col items-center justify-center z-50 animate-fade-in p-6">
      <div className="absolute top-6 right-6">
        <button 
          onClick={onClose}
          className="p-3 bg-white/5 hover:bg-white/10 rounded-full text-white/80 hover:text-white transition-all hover:scale-110 active:scale-95 flex items-center justify-center border border-white/10"
        >
          <X className="w-6 h-6" />
        </button>
      </div>

      <div className="w-full max-w-4xl flex flex-col gap-8 bg-slate-950/40 p-8 rounded-3xl border border-white/10 shadow-2xl">
        {/* On-screen Input Preview */}
        <div className="flex flex-col gap-2">
          <div className="text-white/60 text-xs font-bold tracking-widest uppercase">
            Search query (Optimized for remote controls)
          </div>
          <div className="w-full bg-black/60 border-2 border-indigo-500/50 rounded-2xl p-5 flex items-center justify-between text-2xl font-light text-white shadow-inner min-h-[72px]">
            <div className="flex items-center gap-2">
              <span className="text-indigo-400 font-bold select-none mr-1">🔍</span>
              {value ? (
                <span className="tracking-wide">{value}</span>
              ) : (
                <span className="text-white/30 italic">Enter search term...</span>
              )}
              <span className="w-1.5 h-6 bg-indigo-500 animate-pulse ml-0.5 rounded-full inline-block" />
            </div>
            {value && (
              <button 
                onClick={() => onChange('')} 
                className="text-xs text-white/80 hover:text-rose-400 transition-colors uppercase font-bold tracking-wider px-3 py-1.5 bg-white/5 rounded-lg border border-white/5"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Keyboard Layout Grid */}
        <div className="flex flex-col gap-3">
          {KEYBOARD_ROWS.map((row, rIndex) => {
            const isSpecialRow = rIndex === 4;
            return (
              <div 
                key={rIndex} 
                className={`grid gap-3 ${isSpecialRow ? 'grid-cols-10' : 'grid-cols-10'}`}
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
                        flex items-center justify-center rounded-xl transition-all duration-150
                        ${isSelected 
                          ? 'bg-indigo-600 text-white scale-110 shadow-lg ring-4 ring-indigo-400/50 z-10 border-transparent font-extrabold' 
                          : 'bg-white/5 hover:bg-white/10 text-white border border-white/5'
                        }
                        active:scale-95 select-none
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
        <div className="flex justify-between items-center text-white/60 text-xs px-2 select-none">
          <div className="flex items-center gap-2">
            <span className="bg-white/10 px-2 py-1 rounded text-[10px] font-mono border border-white/15">▲ ▼ ◄ ►</span>
            <span>Use Arrow Keys to Navigate</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="bg-white/10 px-2 py-1 rounded text-[10px] font-mono border border-white/15">ENTER</span>
            <span>Select Key</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="bg-white/10 px-2 py-1 rounded text-[10px] font-mono border border-white/15">ESC</span>
            <span>Close Keyboard</span>
          </div>
        </div>
      </div>
    </div>
  );
}
