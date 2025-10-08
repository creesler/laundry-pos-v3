import React from 'react';

const TicketInput = ({ 
  ticket, 
  onTicketNumberChange,
  onWashChange, 
  onDryChange,
  isInputMode,
  activeInput,
  currentInputValue,
  onInputClick,
  onInputBlur,
  onInsert,
  loading
}) => {
  return (
    <div className="bg-white rounded-lg shadow p-4">
      <div className="grid grid-cols-4 gap-4 mb-4">
        <div>
          <label className="block text-sm font-medium text-gray-600 mb-1">Ticket #</label>
          <div
            className={`p-2 rounded border ${
              activeInput === 'ticketNumber' ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
            } cursor-pointer`}
            onClick={() => onInputClick('ticketNumber', ticket.id)}
          >
            {activeInput === 'ticketNumber' ? (
              <input
                type="text"
                value={currentInputValue}
                onChange={(e) => onTicketNumberChange(e.target.value)}
                onBlur={onInputBlur}
                className="w-full bg-transparent focus:outline-none"
                autoFocus
              />
            ) : (
              ticket.ticketNumber || '---'
            )}
          </div>
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-600 mb-1">Wash</label>
          <div
            className={`p-2 rounded border ${
              activeInput === 'wash' ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
            } cursor-pointer`}
            onClick={() => onInputClick('wash', ticket.id)}
          >
            {activeInput === 'wash' ? (
              <input
                type="text"
                value={currentInputValue}
                onChange={(e) => onWashChange(e.target.value)}
                onBlur={onInputBlur}
                className="w-full bg-transparent focus:outline-none"
                autoFocus
              />
            ) : (
              `$${ticket.wash?.toFixed(2)}`
            )}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-600 mb-1">Dry</label>
          <div
            className={`p-2 rounded border ${
              activeInput === 'dry' ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
            } cursor-pointer`}
            onClick={() => onInputClick('dry', ticket.id)}
          >
            {activeInput === 'dry' ? (
              <input
                type="text"
                value={currentInputValue}
                onChange={(e) => onDryChange(e.target.value)}
                onBlur={onInputBlur}
                className="w-full bg-transparent focus:outline-none"
                autoFocus
              />
            ) : (
              `$${ticket.dry?.toFixed(2)}`
            )}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-600 mb-1">Total</label>
          <div className="p-2 rounded bg-gray-50 font-semibold">
            ${ticket.total?.toFixed(2)}
          </div>
        </div>
      </div>

      {/* Insert Button */}
      <div className="flex justify-end">
        <button
          onClick={onInsert}
          disabled={loading || !ticket.ticketNumber || !(ticket.wash > 0 || ticket.dry > 0)}
          className={`px-6 py-2 rounded-lg font-semibold flex items-center space-x-2 ${
            loading || !ticket.ticketNumber || !(ticket.wash > 0 || ticket.dry > 0)
              ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
              : 'bg-green-600 hover:bg-green-700 text-white shadow-lg hover:shadow-xl transform hover:scale-105'
          }`}
        >
          {loading ? (
            <>
              <svg className="animate-spin h-5 w-5 mr-2" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span>Processing...</span>
            </>
          ) : (
            <>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              <span>Insert Ticket</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};

export default TicketInput;