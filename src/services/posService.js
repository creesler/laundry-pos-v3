import { supabase } from '../lib/supabase';
import { localDB } from './localDB.jsx';

class POSService {
  async generateTicketNumbers(count = 1) {
    try {
      // Get all tickets from localDB
      const allTickets = await localDB.getAllTickets();
      
      // Filter valid ticket numbers and convert to numbers
      const validNumbers = allTickets
        .map(ticket => ticket.ticketNumber)
        .filter(num => num && !isNaN(parseInt(num)))
        .map(num => parseInt(num));
      
      // Find the highest ticket number
      const highestNumber = validNumbers.length > 0 
        ? Math.max(...validNumbers) 
        : 0;
      
      // Generate new sequential numbers
      const newNumbers = Array.from({ length: count }, (_, i) => 
        String(highestNumber + i + 1).padStart(3, '0')
      );
      
      console.log('Generated new ticket numbers:', newNumbers);
      return newNumbers;
    } catch (error) {
      console.error('Error generating ticket numbers:', error);
      // Fallback: generate numbers based on timestamp
      const timestamp = Date.now();
      return Array.from({ length: count }, (_, i) => 
        String(timestamp + i).slice(-3).padStart(3, '0')
      );
    }
  }

  async getTicketSequenceStatus() {
    try {
      // Get all tickets from localDB
      const allTickets = await localDB.getAllTickets();
      
      // Find the highest ticket number
      const validNumbers = allTickets
        .map(ticket => ticket.ticketNumber)
        .filter(num => num && !isNaN(parseInt(num)))
        .map(num => parseInt(num));
      
      const lastTicketNumber = validNumbers.length > 0 
        ? Math.max(...validNumbers) 
        : 0;
      
      return {
        last_ticket_number: lastTicketNumber,
        total_tickets: validNumbers.length
      };
    } catch (error) {
      console.error('Error getting ticket sequence status:', error);
      return {
        last_ticket_number: 0,
        total_tickets: 0
      };
    }
  }
}

export const posService = new POSService();