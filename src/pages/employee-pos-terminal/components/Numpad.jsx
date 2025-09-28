import React from 'react';
import Icon from '../../../components/AppIcon';

const Numpad = ({ 
  onNumberClick, 
  onDecimalClick, 
  onClear, 
  onEnter, 
  onSave, 
  activeInput,
  loading = false
}) => {
  const numbers = [
    ['7', '8', '9'],
    ['4', '5', '6'],
    ['1', '2', '3'],
    ['0', '.', 'C']
  ];

  const handleButtonClick = (value) => {
    if (loading) return; // Prevent clicks when loading
    
    if (value === 'C') {
      onClear?.();
    } else if (value === '.') {
      onDecimalClick?.();
    } else {
      onNumberClick?.(value);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center space-x-3 mb-4">
          <div className="p-2 bg-blue-100 rounded-lg">
            <Icon name="Calculator" size={20} className="text-blue-600" />
          </div>
          <h3 className="text-lg font-semibold text-slate-800">Input Panel</h3>
        </div>
        
        {/* Active Field Display */}
        <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
          <div className="text-sm text-slate-600 mb-1">Active Field:</div>
          <div className="text-slate-800 font-medium">
            {activeInput ? (
              `${activeInput?.section} - ${activeInput?.field}`
            ) : (
              'Click a field to start input'
            )}
          </div>
        </div>
      </div>

      {/* Number Pad */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {numbers?.flat()?.map((num) => (
          <button
            key={num}
            onClick={() => handleButtonClick(num)}
            disabled={loading}
            className={`
              h-14 rounded-xl font-semibold text-lg transition-all
              ${num === 'C' ?'bg-red-500 hover:bg-red-600 text-white' 
                : num === '.' ?'bg-orange-500 hover:bg-orange-600 text-white' :'bg-white hover:bg-slate-50 text-slate-800 border border-slate-200'
              }
              ${loading ? 'opacity-50 cursor-not-allowed' : 'hover:shadow-lg transform hover:scale-105'}
              ${!activeInput && num !== 'C' ? 'opacity-50' : ''}
            `}
          >
            {num}
          </button>
        ))}
      </div>

      {/* Action Buttons */}
      <div className="space-y-3">
        <button
          onClick={onEnter}
          disabled={!activeInput || loading}
          className={`
            w-full py-3 rounded-xl font-semibold transition-all flex items-center justify-center space-x-2
            ${!activeInput || loading
              ? 'bg-slate-200 text-slate-400 cursor-not-allowed' :'bg-green-600 hover:bg-green-700 text-white shadow-lg hover:shadow-xl transform hover:scale-105'
            }
          `}
        >
          <Icon name="Check" size={18} />
          <span>Enter</span>
        </button>
        
        <button
          onClick={onSave}
          disabled={loading}
          className={`
            w-full py-3 rounded-xl font-semibold transition-all flex items-center justify-center space-x-2
            ${loading
              ? 'bg-slate-200 text-slate-400 cursor-not-allowed' :'bg-blue-600 hover:bg-blue-700 text-white shadow-lg hover:shadow-xl transform hover:scale-105'
            }
          `}
        >
          <Icon name="Save" size={18} />
          <span>{loading ? 'Saving...' : 'Save Progress'}</span>
        </button>
      </div>

      {/* Instructions removed for cleaner UI */}
    </div>
  );
};

export default Numpad;