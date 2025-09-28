import React from 'react';
import Icon from '../../../components/AppIcon';

const NotesSection = ({ notes, setNotes }) => {
  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg border border-white/20 p-6">
      <div className="flex items-center space-x-3 mb-6">
        <div className="p-2 bg-teal-100 rounded-lg">
          <Icon name="FileText" size={20} className="text-teal-600" />
        </div>
        <h3 className="text-lg font-semibold text-slate-800">Notes / Refunds</h3>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-slate-700">Additional Notes</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e?.target?.value)}
          placeholder="Enter any notes, refunds, or additional information..."
          rows={8}
          className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all text-sm"
        />
        
        <div className="flex items-center justify-between pt-2">
          <span className="text-xs text-slate-500">
            {notes?.length || 0} characters
          </span>
          <button
            onClick={() => setNotes('')}
            className="text-xs text-slate-500 hover:text-slate-700 transition-colors flex items-center space-x-1"
          >
            <Icon name="X" size={12} />
            <span>Clear</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default NotesSection;