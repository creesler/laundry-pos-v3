import React, { useState, useEffect } from 'react';

const TicketHistory = ({ tickets = [], pageSize = 10 }) => {
  const [currentPage, setCurrentPage] = useState(0);
  const [displayedTickets, setDisplayedTickets] = useState([]);
  
  useEffect(() => {
    console.log('TicketHistory received tickets:', tickets);
    
    // Filter out empty tickets and sort by date
    const validTickets = tickets.filter(ticket => 
      ticket.id !== 'message' &&
      (ticket.ticketNumber || ticket.ticket_number) &&
      ((ticket.wash > 0 || ticket.dry > 0) ||
       (ticket.wash_amount > 0 || ticket.dry_amount > 0))
    );
    
    // Sort by date, oldest first
    const sortedTickets = [...validTickets].sort((a, b) => {
      const dateA = new Date(a.created_at || 0);
      const dateB = new Date(b.created_at || 0);
      return dateA - dateB;
    });

    // Calculate total pages
    const totalPages = Math.ceil(sortedTickets.length / pageSize);
    
    // If we're on a page that no longer exists, move to the last page
    if (currentPage >= totalPages && totalPages > 0) {
      setCurrentPage(totalPages - 1);
    }

    const startIndex = currentPage * pageSize;
    const ticketsToShow = sortedTickets.slice(startIndex, startIndex + pageSize);
    console.log('Displaying tickets:', ticketsToShow);
    setDisplayedTickets(ticketsToShow);
  }, [tickets, currentPage, pageSize]);

  const totalPages = Math.ceil(tickets.length / pageSize);

  const goToPreviousPage = () => {
    setCurrentPage(prev => Math.max(0, prev - 1));
  };

  const goToNextPage = () => {
    setCurrentPage(prev => Math.min(totalPages - 1, prev + 1));
  };

  return (
    <div className="bg-white rounded-lg shadow p-4 mb-4">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold">Ticket History</h3>
        <div className="flex items-center space-x-2">
          <button
            onClick={goToPreviousPage}
            disabled={currentPage === 0}
            className={`px-3 py-1 rounded ${
              currentPage === 0
                ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                : 'bg-blue-500 text-white hover:bg-blue-600'
            }`}
          >
            ←
          </button>
          <span className="text-sm text-gray-600">
            Page {currentPage + 1} of {Math.max(1, totalPages)}
          </span>
          <button
            onClick={goToNextPage}
            disabled={currentPage >= totalPages - 1}
            className={`px-3 py-1 rounded ${
              currentPage >= totalPages - 1
                ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                : 'bg-blue-500 text-white hover:bg-blue-600'
            }`}
          >
            →
          </button>
        </div>
      </div>

      <div className="overflow-y-auto" style={{ maxHeight: '400px' }}>
        <table className="min-w-full">
          <thead className="sticky top-0 bg-white">
            <tr className="bg-gray-50">
              <th className="px-4 py-2 text-left text-sm font-semibold text-gray-600">Ticket #</th>
              <th className="px-4 py-2 text-right text-sm font-semibold text-gray-600">Wash</th>
              <th className="px-4 py-2 text-right text-sm font-semibold text-gray-600">Dry</th>
              <th className="px-4 py-2 text-right text-sm font-semibold text-gray-600">Total</th>
              <th className="px-4 py-2 text-left text-sm font-semibold text-gray-600">Time</th>
            </tr>
          </thead>
          <tbody>
            {displayedTickets.map((ticket, index) => {
              // Handle both old and new field names
              const ticketNumber = ticket.ticket_number || ticket.ticketNumber;
              const washAmount = ticket.wash_amount || ticket.wash || 0;
              const dryAmount = ticket.dry_amount || ticket.dry || 0;
              const totalAmount = ticket.total_amount || ticket.total || (washAmount + dryAmount);

              return (
                <tr 
                  key={ticket.id} 
                  className={`border-t border-gray-100 ${
                    index === displayedTickets.length - 1 ? 'bg-blue-50' : ''
                  }`}
                >
                  <td className="px-4 py-2 text-sm">{ticketNumber}</td>
                  <td className="px-4 py-2 text-right text-sm">
                    {washAmount > 0 ? `$${washAmount.toFixed(2)}` : ''}
                  </td>
                  <td className="px-4 py-2 text-right text-sm">
                    {dryAmount > 0 ? `$${dryAmount.toFixed(2)}` : ''}
                  </td>
                  <td className="px-4 py-2 text-right text-sm font-semibold">
                    {totalAmount > 0 ? `$${totalAmount.toFixed(2)}` : ''}
                  </td>
                  <td className="px-4 py-2 text-sm text-gray-500">
                    {new Date(ticket.created_at).toLocaleTimeString()}
                  </td>
                </tr>
              );
            })}
            {displayedTickets.length === 0 && (
              <tr>
                <td colSpan="5" className="px-4 py-8 text-center text-gray-500">
                  No ticket history available
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default TicketHistory;