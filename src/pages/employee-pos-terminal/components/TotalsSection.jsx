import React from 'react';
import Icon from '../../../components/AppIcon';

const TotalsSection = ({ totals }) => {
  const formatCurrency = (value) => {
    return `$${(value || 0)?.toFixed(2)}`;
  };

  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg border border-white/20 p-6">
      <div className="flex items-center space-x-3 mb-6">
        <div className="p-2 bg-indigo-100 rounded-lg">
          <Icon name="TrendingUp" size={20} className="text-indigo-600" />
        </div>
        <h3 className="text-lg font-semibold text-slate-800">Totals</h3>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-700">Inventory Sales Total</label>
          <div className="flex items-center space-x-2">
            <div className="flex-1 h-10 rounded-lg bg-green-50 border border-green-200 flex items-center justify-center font-semibold text-green-700">
              {formatCurrency(totals?.inventorySalesTotal)}
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-700">Wash & Dry Sales Total</label>
          <div className="flex items-center space-x-2">
            <div className="flex-1 h-10 rounded-lg bg-purple-50 border border-purple-200 flex items-center justify-center font-semibold text-purple-700">
              {formatCurrency(totals?.washDrySubtotal)}
            </div>
          </div>
        </div>

        <div className="pt-4 border-t border-slate-200">
          <div className="space-y-2">
            <label className="text-base font-semibold text-slate-800">Grand Total</label>
            <div className="flex items-center space-x-2">
              <div className="flex-1 h-14 rounded-xl bg-gradient-to-r from-indigo-50 to-purple-50 border-2 border-indigo-200 flex items-center justify-center">
                <span className="text-2xl font-bold text-indigo-700">
                  {formatCurrency(totals?.grandTotal)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TotalsSection;