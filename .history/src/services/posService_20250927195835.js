/**
 * LAUNDRY KING POS - ARCHITECTURAL RULES & DATABASE STRUCTURE
 * ========================================================
 * 
 * OFFLINE-FIRST PRINCIPLES:
 * ------------------------
 * 1. All operations MUST work offline by default
 * 2. Data is stored locally first (localStorage/IndexedDB)
 * 3. Server sync ONLY happens when "Save Progress" is explicitly triggered
 * 4. No automatic server connections or background syncs
 * 
 * DATABASE RELATIONSHIPS:
 * ---------------------
 * user_profiles (Central Employee Table)
 * └── id (uuid) PRIMARY KEY
 * └── full_name, email, role
 * 
 * employee_timesheets
 * └── employee_id → user_profiles.id
 * └── Tracks: clock in/out times, work duration
 * 
 * pos_sessions
 * └── employee_id → user_profiles.id
 * └── Tracks: cash, totals, session status
 *     ├── pos_inventory_items
 *     │   └── pos_session_id → pos_sessions.id
 *     │   └── Tracks: item counts, sales, stock
 *     │
 *     └── pos_wash_dry_tickets
 *         └── pos_session_id → pos_sessions.id
 *         └── Tracks: ticket numbers, amounts
 * 
 * DATA FLOW:
 * ----------
 * 1. All operations save to localStorage first
 * 2. "Save Progress" button triggers:
 *    a) Get employee_id from user_profiles
 *    b) Create/update pos_session
 *    c) Link inventory items and tickets to session
 *    d) Update employee timesheet if needed
 * 
 * VALIDATION RULES:
 * ---------------
 * 1. Every operation must work without server connection
 * 2. All server sync operations must be atomic
 * 3. All relationships must be preserved during sync
 * 4. Data integrity must be maintained offline and online
 */

import { supabase } from '../lib/supabase';
import { localDB } from './localDB';

class POSService {
  // Get next sequential ticket number from localDB
  async getNextTicketNumber() {
    try {
      // Get next number from localDB
      return await localDB.getNextTicketNumber();
    } catch (error) {
      console.error('Failed to get next ticket number:', error);
      // Fallback to timestamp-based unique number if everything fails
      const timestamp = Date.now().toString().slice(-3);
      return timestamp.padStart(3, '0');
    }
  }

  // Generate sequential ticket numbers from localDB
  async generateTicketNumbers(count = 3) {
    try {
      // Get numbers from localDB
      return await localDB.generateTicketNumbers(count);
    } catch (error) {
      console.error('Failed to generate ticket numbers:', error);
      
      // Fallback with timestamp-based numbers
      const baseNumber = parseInt(Date.now().toString().slice(-3));
      const ticketNumbers = [];
      
      for (let i = 0; i < count; i++) {
        ticketNumbers.push(((baseNumber + i) % 1000).toString().padStart(3, '0'));
      }
      
      return ticketNumbers;
    }
  }

  // Enhanced save method that ensures ticket numbers are properly saved and synced
  async saveSessionProgress(sessionId, sessionData) {
    try {
      const { notes, cashStarted, cashAdded } = sessionData;
      
      // Calculate totals for comprehensive tracking
      const inventoryTotal = sessionData?.inventoryItems?.reduce((sum, item) => sum + (item?.total || 0), 0);
      const washDryTotal = sessionData?.tickets?.reduce((sum, ticket) => sum + (ticket?.total || 0), 0);
      const grandTotal = inventoryTotal + washDryTotal;
      const cashTotal = (cashStarted || 0) + (cashAdded || 0);
      
      // Update session with all comprehensive totals
      const { data: session, error: sessionError } = await supabase?.from('pos_sessions')?.update({
          notes: notes || '',
          cash_started: cashStarted || 0,
          cash_added: cashAdded || 0,
          cash_total: cashTotal,
          inventory_total: inventoryTotal,
          wash_dry_total: washDryTotal,
          grand_total: grandTotal,
          status: 'saved',
          updated_at: new Date()?.toISOString()
        })?.eq('id', sessionId)?.select()?.single();

      if (sessionError) throw sessionError;

      // Update inventory items with comprehensive stock tracking
      if (sessionData?.inventoryItems?.length > 0) {
        await this.updateInventoryItems(sessionId, sessionData?.inventoryItems);
      }

      // Enhanced: Update wash/dry tickets with complete transaction data and ticket number persistence
      if (sessionData?.tickets?.length > 0) {
        await this.updateWashDryTicketsWithSequencing(sessionId, sessionData?.tickets);
      }

      // Update master inventory items to maintain admin dashboard sync
      if (sessionData?.inventoryItems?.length > 0) {
        await this.syncMasterInventoryFromSession(sessionData?.inventoryItems);
      }

      console.log(`✅ Session saved successfully with ticket number synchronization`);
      return session;
    } catch (error) {
      throw new Error(`Failed to save comprehensive session data: ${error?.message}`);
    }
  }

  // NEW: Enhanced wash/dry ticket update with ticket number validation and sequence tracking
  async updateWashDryTicketsWithSequencing(sessionId, tickets) {
    try {
      // Delete existing tickets first
      await supabase?.from('pos_wash_dry_tickets')?.delete()?.eq('pos_session_id', sessionId);

      // Validate and ensure all tickets have proper sequential numbers
      const ticketsWithValidNumbers = [];
      
      for (const ticket of tickets) {
        let ticketNumber = ticket?.ticketNumber;
        
        // If ticket number is missing or invalid, generate a new one
        if (!ticketNumber || ticketNumber === '') {
          ticketNumber = await this.getNextTicketNumber();
          console.log(`⚠️ Generated missing ticket number: ${ticketNumber} for ticket ${ticket?.id}`);
        }
        
        ticketsWithValidNumbers?.push({
          pos_session_id: sessionId,
          ticket_number: ticketNumber,
          wash_amount: ticket?.wash || 0,
          dry_amount: ticket?.dry || 0,
          total_amount: ticket?.total || 0,
          created_at: new Date()?.toISOString(),
          updated_at: new Date()?.toISOString()
        });
      }

      if (ticketsWithValidNumbers?.length > 0) {
        const { error } = await supabase?.from('pos_wash_dry_tickets')?.insert(ticketsWithValidNumbers);
        if (error) throw error;
        
        console.log(`✅ Saved ${ticketsWithValidNumbers?.length} wash/dry tickets with sequential numbering:`, 
          ticketsWithValidNumbers?.map(t => t?.ticket_number)?.join(', '));
      }
    } catch (error) {
      throw new Error(`Failed to save wash/dry ticket transactions with sequencing: ${error?.message}`);
    }
  }

  // NEW: Get current ticket sequence status (for debugging/admin purposes)
  async getTicketSequenceStatus() {
    try {
      const { data, error } = await supabase
        ?.from('pos_ticket_sequence')
        ?.select('*')
        ?.order('updated_at', { ascending: false })
        ?.limit(1);

      if (error) throw error;

      return data?.[0] || null;
    } catch (error) {
      console.error('Failed to get ticket sequence status:', error);
      return null;
    }
  }

  // NEW: Reset ticket sequence (admin only)
  async resetTicketSequence(startNumber = 0) {
    try {
      const { data, error } = await supabase?.rpc('reset_ticket_sequence', {
        new_start_number: startNumber
      });

      if (error) throw error;

      console.log(`✅ Ticket sequence reset to: ${startNumber}`);
      return data;
    } catch (error) {
      throw new Error(`Failed to reset ticket sequence: ${error?.message}`);
    }
  }

  // Create a new POS session with proper employee relationship
  async createSession(employeeName, sessionDate = null) {
    try {
      const date = sessionDate || new Date()?.toISOString()?.split('T')?.[0];
      
      // Get employee from local DB first
      const employee = await localDB.getEmployeeByName(employeeName);
      if (!employee?.id) {
        throw new Error('No valid employee available to assign to the session');
      }
      
      // Create session locally first
      const session = {
        id: crypto.randomUUID(),
        employee_id: employee.id,
        session_date: date,
        status: 'active'
      };
      
      // Only sync with server on Save Progress button
      return session;

      if (error) throw error;
      return data;
    } catch (error) {
      throw new Error(`Failed to create POS session: ${error?.message}`);
    }
  }

  // Get current session for employee and date
  async getCurrentSession(employeeId, sessionDate = null) {
    try {
      const date = sessionDate || new Date()?.toISOString()?.split('T')?.[0];
      
      const { data, error } = await supabase?.from('pos_sessions')?.select(`
          *,
          pos_inventory_items (*),
          pos_wash_dry_tickets (*)
        `)?.eq('employee_id', employeeId)?.eq('session_date', date)?.single();

      if (error && error?.code !== 'PGRST116') throw error;
      return data || null;
    } catch (error) {
      throw new Error(`Failed to fetch current session: ${error?.message}`);
    }
  }

  // Enhanced save session progress with comprehensive field synchronization
  async saveSessionProgress(sessionId, sessionData) {
    try {
      const { notes, cashStarted, cashAdded } = sessionData;
      
      // Calculate totals for comprehensive tracking
      const inventoryTotal = sessionData?.inventoryItems?.reduce((sum, item) => sum + (item?.total || 0), 0);
      const washDryTotal = sessionData?.tickets?.reduce((sum, ticket) => sum + (ticket?.total || 0), 0);
      const grandTotal = inventoryTotal + washDryTotal;
      const cashTotal = (cashStarted || 0) + (cashAdded || 0);
      
      // Update session with all comprehensive totals
      const { data: session, error: sessionError } = await supabase?.from('pos_sessions')?.update({
          notes: notes || '',
          cash_started: cashStarted || 0,
          cash_added: cashAdded || 0,
          cash_total: cashTotal,
          inventory_total: inventoryTotal,
          wash_dry_total: washDryTotal,
          grand_total: grandTotal,
          status: 'saved',
          updated_at: new Date()?.toISOString()
        })?.eq('id', sessionId)?.select()?.single();

      if (sessionError) throw sessionError;

      // Update inventory items with comprehensive stock tracking
      if (sessionData?.inventoryItems?.length > 0) {
        await this.updateInventoryItems(sessionId, sessionData?.inventoryItems);
      }

      // Update wash/dry tickets with complete transaction data
      if (sessionData?.tickets?.length > 0) {
        await this.updateWashDryTickets(sessionId, sessionData?.tickets);
      }

      // Update master inventory items to maintain admin dashboard sync
      if (sessionData?.inventoryItems?.length > 0) {
        await this.syncMasterInventoryFromSession(sessionData?.inventoryItems);
      }

      return session;
    } catch (error) {
      throw new Error(`Failed to save comprehensive session data: ${error?.message}`);
    }
  }

  // New method to sync master inventory from session data for admin dashboard
  async syncMasterInventoryFromSession(sessionItems) {
    try {
      for (const item of sessionItems) {
        // Find matching master inventory item by name
        const { data: masterItems, error: findError } = await supabase
          ?.from('pos_inventory_items')
          ?.select('id, item_name')
          ?.eq('item_name', item?.name)
          ?.is('pos_session_id', null)
          ?.limit(1);

        if (findError) throw findError;

        if (masterItems && masterItems?.length > 0) {
          // Update master inventory with latest stock levels
          const { error: updateError } = await supabase
            ?.from('pos_inventory_items')
            ?.update({
              start_count: item?.start || 0,
              left_count: item?.left || 0,
              sold_count: item?.sold || 0,
              add_count: item?.add || 0,
              total_amount: item?.total || 0,
              updated_at: new Date()?.toISOString()
            })
            ?.eq('id', masterItems?.[0]?.id);

          if (updateError) {
            console.error(`Failed to sync master inventory for ${item?.name}:`, updateError);
          } else {
            console.log(`✅ Master inventory synced: ${item?.name} - Current Stock: ${item?.left}`);
          }
        }
      }
    } catch (error) {
      console.error('Error syncing master inventory:', error);
      // Don't throw error as this is supplementary sync
    }
  }

  // Enhanced inventory update with comprehensive field tracking
  async updateInventoryItems(sessionId, items) {
    try {
      // Delete existing items first
      await supabase?.from('pos_inventory_items')?.delete()?.eq('pos_session_id', sessionId);

      // Insert new items with all field data
      const itemsToInsert = items?.map(item => ({
        pos_session_id: sessionId,
        item_name: item?.name || item?.item_name,
        quantity: item?.qty || item?.quantity || 1,
        price: item?.price || 0,
        start_count: item?.start || item?.start_count || 0,
        add_count: item?.add || item?.add_count || 0,
        sold_count: item?.sold || item?.sold_count || 0,
        left_count: item?.left || item?.left_count || 0,
        total_amount: item?.total || item?.total_amount || 0,
        created_at: new Date()?.toISOString(),
        updated_at: new Date()?.toISOString()
      }));

      if (itemsToInsert?.length > 0) {
        const { error } = await supabase?.from('pos_inventory_items')?.insert(itemsToInsert);
        if (error) throw error;
        console.log(`✅ Saved ${itemsToInsert?.length} inventory items with complete stock data`);
      }
    } catch (error) {
      throw new Error(`Failed to save inventory stock levels: ${error?.message}`);
    }
  }

  // Enhanced wash/dry ticket update with complete transaction tracking
  async updateWashDryTickets(sessionId, tickets) {
    try {
      // Delete existing tickets first
      await supabase?.from('pos_wash_dry_tickets')?.delete()?.eq('pos_session_id', sessionId);

      // Insert new tickets with complete transaction data
      const ticketsToInsert = tickets?.map(ticket => ({
        pos_session_id: sessionId,
        ticket_number: ticket?.ticketNumber,
        wash_amount: ticket?.wash || 0,
        dry_amount: ticket?.dry || 0,
        total_amount: ticket?.total || 0,
        created_at: new Date()?.toISOString(),
        updated_at: new Date()?.toISOString()
      }));

      if (ticketsToInsert?.length > 0) {
        const { error } = await supabase?.from('pos_wash_dry_tickets')?.insert(ticketsToInsert);
        if (error) throw error;
        console.log(`✅ Saved ${ticketsToInsert?.length} wash/dry tickets with complete transaction data`);
      }
    } catch (error) {
      throw new Error(`Failed to save wash/dry ticket transactions: ${error?.message}`);
    }
  }

  // Get session history for employee
  async getSessionHistory(employeeId, limit = 30) {
    try {
      const { data, error } = await supabase?.from('pos_sessions')?.select(`
          *,
          pos_inventory_items (*),
          pos_wash_dry_tickets (*)
        `)?.eq('employee_id', employeeId)?.order('session_date', { ascending: false })?.limit(limit);

      if (error) throw error;
      return data || [];
    } catch (error) {
      throw new Error(`Failed to fetch session history: ${error?.message}`);
    }
  }

  // Complete a session
  async completeSession(sessionId) {
    try {
      const { data, error } = await supabase?.from('pos_sessions')?.update({
          status: 'completed',
          updated_at: new Date()?.toISOString()
        })?.eq('id', sessionId)?.select()?.single();

      if (error) throw error;
      return data;
    } catch (error) {
      throw new Error(`Failed to complete session: ${error?.message}`);
    }
  }

  // New method to get comprehensive dashboard analytics for admin
  async getDashboardAnalytics(startDate = null, endDate = null) {
    try {
      const start = startDate || new Date(new Date()?.setDate(new Date()?.getDate() - 30))?.toISOString()?.split('T')?.[0];
      const end = endDate || new Date()?.toISOString()?.split('T')?.[0];

      // Get session analytics with comprehensive data
      const { data: sessions, error: sessionError } = await supabase
        ?.from('pos_sessions')
        ?.select(`
          *,
          user_profiles (full_name, email),
          pos_inventory_items (*),
          pos_wash_dry_tickets (*)
        `)
        ?.gte('session_date', start)
        ?.lte('session_date', end)
        ?.order('session_date', { ascending: false });

      if (sessionError) throw sessionError;

      // Calculate comprehensive analytics
      const analytics = {
        totalSessions: sessions?.length || 0,
        totalRevenue: sessions?.reduce((sum, session) => sum + (session?.grand_total || 0), 0),
        totalCashHandled: sessions?.reduce((sum, session) => sum + (session?.cash_total || 0), 0),
        totalInventorySold: sessions?.reduce((sum, session) => sum + (session?.inventory_total || 0), 0),
        totalWashDryRevenue: sessions?.reduce((sum, session) => sum + (session?.wash_dry_total || 0), 0),
        uniqueEmployees: [...new Set(sessions?.map(s => s?.employee_id)?.filter(Boolean))]?.length,
        sessions: sessions || []
      };

      return analytics;
    } catch (error) {
      throw new Error(`Failed to get dashboard analytics: ${error?.message}`);
    }
  }
}

export const posService = new POSService();