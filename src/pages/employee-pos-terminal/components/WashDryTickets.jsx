import React from 'react';
import Icon from '../../../components/AppIcon';

const WashDryTickets = ({ tickets, onFieldClick, activeInput, getDisplayValue }) => {
  const handleFieldClick = (ticketId, field) => {
    onFieldClick({ section: 'tickets', id: ticketId, field });
  };

  const isFieldActive = (ticketId, field) => {
    return activeInput?.section === 'tickets' && 
           activeInput?.id === ticketId && 
           activeInput?.field === field;
  };

  const formatCurrency = (value) => {
    return `$${(value || 0)?.toFixed(2)}`;
  };

  return (
    <div className="space-y-4">
      <div className="max-h-80 overflow-y-auto overflow-x-auto scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-slate-100">
        <table className="w-full">
          <thead className="sticky top-0 bg-white z-10">
            <tr className="border-b border-slate-200 shadow-sm">
              <th className="text-left py-3 px-4 font-semibold text-slate-700">Ticket #</th>
              <th className="text-center py-3 px-4 font-semibold text-slate-700">Wash $</th>
              <th className="text-center py-3 px-4 font-semibold text-slate-700">Dry $</th>
              <th className="text-center py-3 px-4 font-semibold text-slate-700">Total</th>
            </tr>
          </thead>
          <tbody>
            {tickets?.map((ticket) => (
              <tr key={ticket?.id} className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
                <td className="py-4 px-4">
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 bg-gradient-to-br from-cyan-100 to-cyan-200 rounded-lg flex items-center justify-center">
                      <Icon name="FileText" size={14} className="text-cyan-600" />
                    </div>
                    <span className="font-medium text-slate-800">#{ticket?.ticketNumber}</span>
                  </div>
                </td>
                <td className="py-4 px-4 text-center">
                  <button
                    onClick={() => handleFieldClick(ticket?.id, 'wash')}
                    className={`w-24 h-10 rounded-lg border-2 transition-all font-medium ${
                      isFieldActive(ticket?.id, 'wash') 
                        ? 'border-blue-500 bg-blue-50 text-blue-700 shadow-md' :'border-slate-200 bg-white hover:border-slate-300 text-slate-600'
                    }`}
                  >
                    ${getDisplayValue('tickets', ticket?.id, 'wash', ticket?.wash)}
                  </button>
                </td>
                <td className="py-4 px-4 text-center">
                  <button
                    onClick={() => handleFieldClick(ticket?.id, 'dry')}
                    className={`w-24 h-10 rounded-lg border-2 transition-all font-medium ${
                      isFieldActive(ticket?.id, 'dry') 
                        ? 'border-blue-500 bg-blue-50 text-blue-700 shadow-md' :'border-slate-200 bg-white hover:border-slate-300 text-slate-600'
                    }`}
                  >
                    ${getDisplayValue('tickets', ticket?.id, 'dry', ticket?.dry)}
                  </button>
                </td>
                <td className="py-4 px-4 text-center">
                  <div className="flex items-center justify-center space-x-2">
                    <span className="w-24 h-10 rounded-lg bg-purple-50 border border-purple-200 flex items-center justify-center font-semibold text-purple-700">
                      {formatCurrency(ticket?.total)}
                    </span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Wash & Dry Subtotal */}
      <div className="pt-4 border-t border-slate-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-purple-100 rounded-lg">
              <Icon name="Calculator" size={16} className="text-purple-600" />
            </div>
            <span className="font-semibold text-slate-800">Wash & Dry Subtotal</span>
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-2xl font-bold text-purple-600">
              {formatCurrency(tickets?.reduce((sum, ticket) => sum + (ticket?.total || 0), 0))}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WashDryTickets;