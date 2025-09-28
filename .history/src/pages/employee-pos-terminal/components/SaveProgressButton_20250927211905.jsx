import React from 'react';

const SaveProgressButton = ({ onSave, loading, disabled }) => (
  <button
    onClick={onSave}
    disabled={loading || disabled}
    className={`px-6 py-3 rounded-xl font-semibold transition-all flex items-center space-x-2 shadow-lg hover:shadow-xl transform hover:scale-105
      ${loading || disabled ? 'bg-slate-200 text-slate-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 text-white'}`}
  >
    <span>{loading ? 'Saving...' : 'Save Progress'}</span>
  </button>
);

export default SaveProgressButton;
