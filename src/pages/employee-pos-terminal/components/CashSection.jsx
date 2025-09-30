import React from 'react';
import Icon from '../../../components/AppIcon';

const CashSection = ({ cashData, onFieldClick, activeInput, getDisplayValue }) => {
  const handleFieldClick = (field) => {
    onFieldClick({ section: 'cash', field });
  };

  const isFieldActive = (field) => {
    return activeInput?.section === 'cash' && activeInput?.field === field;
  };

  const formatCurrency = (value) => {
    return `$${(value || 0)?.toFixed(2)}`;
  };

  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg border border-white/20 p-6">
      <div className="flex items-center space-x-3 mb-6">
        <div className="p-2 bg-orange-100 rounded-lg">
          <Icon name="DollarSign" size={20} className="text-orange-600" />
        </div>
        <h3 className="text-lg font-semibold text-slate-800">Cash Section</h3>
      </div>
      <div className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-700">Cash Started</label>
          <button
            onClick={() => handleFieldClick('started')}
            className={`w-full h-12 rounded-lg border-2 transition-all font-semibold text-lg ${
              isFieldActive('started') 
                ? 'border-blue-500 bg-blue-50 text-blue-700 shadow-md' :'border-slate-200 bg-white hover:border-slate-300 text-slate-600'
            }`}
          >
            ${getDisplayValue('cash', null, 'started', cashData?.started)}
          </button>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-700">Cash Added</label>
          <button
            onClick={() => handleFieldClick('added')}
            className={`w-full h-12 rounded-lg border-2 transition-all font-semibold text-lg ${
              isFieldActive('added') 
                ? 'border-blue-500 bg-blue-50 text-blue-700 shadow-md' :'border-slate-200 bg-white hover:border-slate-300 text-slate-600'
            }`}
          >
            ${getDisplayValue('cash', null, 'added', cashData?.added)}
          </button>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-700">Coins Used</label>
          <button
            onClick={() => handleFieldClick('coinsUsed')}
            className={`w-full h-12 rounded-lg border-2 transition-all font-semibold text-lg ${
              isFieldActive('coinsUsed') 
                ? 'border-blue-500 bg-blue-50 text-blue-700 shadow-md' :'border-slate-200 bg-white hover:border-slate-300 text-slate-600'
            }`}
          >
            ${getDisplayValue('cash', null, 'coinsUsed', cashData?.coinsUsed)}
          </button>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-700">Total Cash</label>
          <div className="flex items-center space-x-2">
            <div className="flex-1 h-12 rounded-lg bg-orange-50 border border-orange-200 flex items-center justify-center font-bold text-lg text-orange-700">
              {formatCurrency(cashData?.total)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CashSection;