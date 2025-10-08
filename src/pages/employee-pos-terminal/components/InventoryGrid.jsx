import React from 'react';
import Icon from '../../../components/AppIcon';

const InventoryGrid = ({ items = [], onFieldClick, activeInput, getDisplayValue }) => {
  // Ensure items is always an array to prevent errors
  const safeItems = Array.isArray(items) ? items : [];
  
  // Helper function to safely get display value
  const getSafeDisplayValue = (item, field) => {
    if (!item || typeof item !== 'object') return 0;
    if (typeof getDisplayValue === 'function') {
      try {
        const value = getDisplayValue('inventory', item.id || 0, field, item[field] || 0);
        // Ensure we return a valid value even if getDisplayValue returns undefined
        return value !== undefined ? value : (item[field] || 0);
      } catch (error) {
        return item[field] || 0;
      }
    }
    return item[field] || 0;
  };
  const handleFieldClick = (itemId, field) => {
    if (typeof onFieldClick === 'function') {
      onFieldClick({ section: 'inventory', id: itemId, field });
    }
  };

  const isFieldActive = (itemId, field) => {
    return activeInput?.section === 'inventory' && 
           activeInput?.id === itemId && 
           activeInput?.field === field;
  };

  const formatCurrency = (value) => {
    return `$${(value || 0)?.toFixed(2)}`;
  };

  return (
    <div className="max-h-96 overflow-y-auto overflow-x-auto scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-slate-100">
      <table className="w-full">
        <thead className="sticky top-0 bg-white z-10">
          <tr className="border-b border-slate-200 shadow-sm">
            <th className="text-left py-3 px-4 font-semibold text-slate-700">Item</th>
            <th className="text-center py-3 px-2 font-semibold text-slate-700">QTY</th>
            <th className="text-center py-3 px-2 font-semibold text-slate-700">Price</th>
            <th className="text-center py-3 px-2 font-semibold text-slate-700">Start</th>
            <th className="text-center py-3 px-2 font-semibold text-slate-700">Add</th>
            <th className="text-center py-3 px-2 font-semibold text-slate-700">Sold</th>
            <th className="text-center py-3 px-2 font-semibold text-slate-700">Left</th>
            <th className="text-center py-3 px-2 font-semibold text-slate-700">Total</th>
          </tr>
        </thead>
        <tbody>
          {safeItems.map((item) => (
            <tr key={item?.id || item?.name} className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
              <td className="py-4 px-4">
                <div className="flex items-center space-x-3">
                  <div>
                    <div className="font-medium text-slate-800">{item?.name || 'Unnamed Item'}</div>
                  </div>
                </div>
              </td>
              <td className="py-4 px-2 text-center">
                <button 
                  onClick={() => handleFieldClick(item.id, 'qty')}
                  className={`inline-flex items-center justify-center w-10 h-10 rounded-md transition-colors ${
                    isFieldActive(item.id, 'qty') 
                      ? 'bg-blue-100 text-blue-700 ring-2 ring-blue-500' 
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                  }`}
                >
                  {getSafeDisplayValue(item, 'qty')}
                </button>
              </td>
              <td className="py-4 px-2 text-center">
                <span className="font-semibold text-green-600">
                  {formatCurrency(item?.price)}
                </span>
              </td>
              <td className="py-4 px-2 text-center">
                <button
                  onClick={() => handleFieldClick(item?.id, 'start')}
                  className={`w-16 h-10 rounded-lg border-2 transition-all font-medium flex items-center justify-center ${
                    isFieldActive(item?.id, 'start') 
                      ? 'border-blue-500 bg-blue-50 text-blue-700 shadow-md' 
                      : 'border-slate-200 bg-white hover:border-slate-300 text-slate-600'
                  }`}
                >
                  {item?.start ?? item?.left ?? 0}
                </button>
              </td>
              <td className="py-4 px-2 text-center">
                <button
                  onClick={() => handleFieldClick(item?.id, 'add')}
                  className={`w-16 h-10 rounded-lg border-2 transition-all font-medium ${
                    isFieldActive(item?.id, 'add') 
                      ? 'border-blue-500 bg-blue-50 text-blue-700 shadow-md' :'border-slate-200 bg-white hover:border-slate-300 text-slate-600'
                  }`}
                >
                  {getSafeDisplayValue(item, 'add')}
                </button>
              </td>
              <td className="py-4 px-2 text-center">
                <button
                  onClick={() => handleFieldClick(item?.id, 'sold')}
                  className={`w-16 h-10 rounded-lg border-2 transition-all font-medium ${
                    isFieldActive(item?.id, 'sold') 
                      ? 'border-blue-500 bg-blue-50 text-blue-700 shadow-md' :'border-slate-200 bg-white hover:border-slate-300 text-slate-600'
                  }`}
                >
                  {getSafeDisplayValue(item, 'sold')}
                </button>
              </td>
              <td className="py-4 px-2 text-center">
                <div className="flex items-center justify-center space-x-1">
                  <span className="w-16 h-10 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-center font-medium text-amber-700">
                    {item?.left || '0'}
                  </span>
                </div>
              </td>
              <td className="py-4 px-2 text-center">
                <div className="flex items-center justify-center space-x-1">
                  <span className="w-20 h-10 rounded-lg bg-green-50 border border-green-200 flex items-center justify-center font-semibold text-green-700">
                    {formatCurrency(item?.total)}
                  </span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default InventoryGrid;