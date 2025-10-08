import { supabase } from '../lib/supabase';
import { localDB } from './localDB.jsx';

class POSService {
  // Track sync state
  isSyncing = false;
  pendingSync = [];
  lastSyncTime = null;
  // Removed loadInitialData to strictly follow offline-first principle
  // All data loading should happen through localDB directly

  // Generate ticket numbers using local DB
  async generateTicketNumbers(count = 3) {
    try {
      // Get existing tickets from today
      const today = new Date().toISOString().split('T')[0];
      const allTickets = await localDB.getAll('tickets');
      const todaysTickets = allTickets
        .filter(t => t.updatedAt?.startsWith(today))
        .sort((a, b) => b.ticket_number - a.ticket_number);

      // If we have tickets from today, use the first 3
      if (todaysTickets.length > 0) {
        return todaysTickets
          .slice(0, count)
          .map(t => t.ticket_number);
      }

      // Generate new ticket numbers
      const ticketNumbers = [];
      const newTickets = [];
      
      for (let i = 0; i < count; i++) {
        const number = await localDB.getNextTicketNumber();
        const ticket = {
          id: `ticket-${Date.now()}-${i}`,
          ticket_number: number,
          wash: 0,
          dry: 0,
          total: 0,
          isSynced: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        newTickets.push(ticket);
        ticketNumbers.push(number);
      }

      // Save new tickets to local DB
      await localDB.setAll('tickets', newTickets);
      return ticketNumbers;

    } catch (error) {
      console.error('Error generating ticket numbers:', error);
      // Fallback to timestamp-based numbers
      const base = Date.now() % 1000;
      return Array.from({ length: count }, (_, i) => 
        String(base + i).padStart(3, '0')
      );
    }
  }
  }

  // Removed loadInitialData to strictly follow offline-first principle
  // All data loading should happen through localDB directly
  async syncWithServer() {
    try {
      if (!navigator.onLine) {
        return { success: false, error: 'No internet connection' };
      }

      // Get all unsynced data
      const [unsyncedTickets, unsyncedInventory] = await Promise.all([
        localDB.getAll('tickets').then(tickets => 
          tickets.filter(t => !t.isSynced)
        ),
        localDB.getAll('inventory').then(items => 
          items.filter(i => !i.isSynced)
        )
      ]);

      // Sync tickets
      if (unsyncedTickets.length > 0) {
        const { error } = await supabase
          .from('pos_wash_dry_tickets')
          .upsert(unsyncedTickets, { onConflict: 'id' });

        if (error) throw error;

        // Mark as synced
        await localDB.setAll('tickets', 
          unsyncedTickets.map(t => ({ ...t, isSynced: true }))
        );
      }

      // Sync inventory
      if (unsyncedInventory.length > 0) {
        const { error } = await supabase
          .from('pos_inventory_items')
          .upsert(unsyncedInventory, { onConflict: 'id' });

        if (error) throw error;

        // Mark as synced
        await localDB.setAll('inventory',
          unsyncedInventory.map(i => ({ ...i, isSynced: true }))
        );
      }

      return { success: true };
    } catch (error) {
      console.error('Sync failed:', error);
      return { success: false, error };
    }
  }

  // Save current state to local DB and optionally sync with server
  async saveCurrentState(inventory, tickets, syncToServer = false) {
    try {
      // Save to local DB
      await localDB.setAll('inventory', inventory);
      await localDB.setAll('tickets', tickets);
      
      // Mark as unsynced
      const unsyncedTickets = tickets.map(t => ({ ...t, isSynced: false }));
      await localDB.setAll('tickets', unsyncedTickets);
      
      // Sync to server if requested and online
      if (syncToServer && navigator.onLine) {
        return await this.syncWithServer();
      }
      
      return { success: true };
    } catch (error) {
      console.error('Error saving state:', error);
      return { success: false, error };
    }
  }
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

  // Create a new POS session
  async createSession(employeeId, sessionDate = null) {
    try {
      const date = sessionDate || new Date()?.toISOString()?.split('T')?.[0];
      
      const { data, error } = await supabase?.from('pos_sessions')?.insert([{
          employee_id: employeeId,
          session_date: date,
          status: 'active'
        }])?.select()?.single();

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

  // Sync local changes with server
  async syncWithServer() {
    if (this.isSyncing) {
      console.log('Sync already in progress, queuing request');
      return new Promise((resolve) => {
        this.pendingSync.push(resolve);
      });
    }

    try {
      this.isSyncing = true;
      
      // Get all unsynced data
      const [unsyncedTickets, unsyncedInventory] = await Promise.all([
        localDB.getAll('tickets').then(tickets => tickets.filter(t => !t.isSynced)),
        localDB.getAll('inventory')
      ]);

      let success = true;
      let error = null;

      // Sync tickets if there are any unsynced
      if (unsyncedTickets.length > 0) {
        try {
          const { error: ticketsError } = await supabase
            .from('tickets')
            .upsert(unsyncedTickets, { onConflict: 'id' });
          
          if (ticketsError) throw ticketsError;
          
          // Mark tickets as synced
          await Promise.all(unsyncedTickets.map(ticket => 
            localDB.set('tickets', { ...ticket, isSynced: true }, ticket.id)
          ));
          
        } catch (syncError) {
          console.error('Error syncing tickets:', syncError);
          success = false;
          error = syncError.message || 'Failed to sync tickets';
        }
      }

      // Sync inventory
      try {
        const { error: inventoryError } = await supabase
          .from('pos_inventory_items')
          .upsert(unsyncedInventory, { onConflict: 'id' });
        
        if (inventoryError) throw inventoryError;
        
      } catch (syncError) {
        console.error('Error syncing inventory:', syncError);
        success = false;
        error = error ? `${error}; ${syncError.message}` : `Failed to sync inventory: ${syncError.message}`;
      }

      this.lastSyncTime = new Date();
      return { success, error };
      
    } catch (error) {
      console.error('Error in syncWithServer:', error);
      return { 
        success: false, 
        error: error.message || 'An unknown error occurred during sync' 
      };
    } finally {
      this.isSyncing = false;
      
      // Process any queued sync requests
      if (this.pendingSync.length > 0) {
        const nextResolve = this.pendingSync.shift();
        if (nextResolve) {
          this.syncWithServer().then(nextResolve);
        }
      }
    }
  }

  // Save current state to local DB and optionally sync with server
  async saveCurrentState(inventory, tickets, syncToServer = false) {
    try {
      // Save to local DB first
      await Promise.all([
        localDB.setAll('inventory', inventory),
        localDB.setAll('tickets', tickets.map(t => ({
          ...t,
          updatedAt: new Date().toISOString(),
          isSynced: syncToServer ? t.isSynced : false
        })))
      ]);

      // Sync with server if requested and online
      if (syncToServer && navigator.onLine) {
        return await this.syncWithServer();
      }

      return { success: true };
    } catch (error) {
      console.error('Error saving current state:', error);
      return { success: false, error: error.message };
    }
  }
}

export const posService = new POSService();